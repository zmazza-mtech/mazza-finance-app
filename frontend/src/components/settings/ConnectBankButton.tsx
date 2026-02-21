import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { enroll } from '@/api/client';
import { ACCOUNTS_KEY } from '@/hooks/useAccounts';

// ---------------------------------------------------------------------------
// Teller Connect SDK global types
// ---------------------------------------------------------------------------

interface TellerEnrollment {
  accessToken: string;
  enrollment: { id: string; institution: { name: string } };
  user: { id: string };
}

interface TellerConnectHandler {
  open: () => void;
}

declare global {
  interface Window {
    TellerConnect?: {
      setup: (config: {
        applicationId: string;
        environment?: 'sandbox' | 'production' | 'development';
        onSuccess: (enrollment: TellerEnrollment) => void;
        onExit?: () => void;
      }) => TellerConnectHandler;
    };
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Loads the Teller Connect widget and opens it on click.
 * On success, POSTs the access token + enrollment ID to /api/v1/enroll
 * and invalidates the accounts query so the account list refreshes.
 */
export function ConnectBankButton() {
  const queryClient = useQueryClient();
  const handlerRef = useRef<TellerConnectHandler | null>(null);

  // Keep a stable ref to mutate so the Teller callback never goes stale
  const enrollMutation = useMutation({
    mutationFn: enroll,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
  const mutateRef = useRef(enrollMutation.mutate);
  useEffect(() => {
    mutateRef.current = enrollMutation.mutate;
  });

  useEffect(() => {
    const appId = import.meta.env['VITE_TELLER_APPLICATION_ID'] as
      | string
      | undefined;
    if (!appId) return;

    const env =
      (import.meta.env['VITE_TELLER_ENVIRONMENT'] as
        | 'sandbox'
        | 'production'
        | 'development'
        | undefined) ?? 'production';

    function init() {
      if (!window.TellerConnect || !appId) return;
      handlerRef.current = window.TellerConnect.setup({
        applicationId: appId,
        environment: env,
        onSuccess: (enrollment) => {
          mutateRef.current({
            accessToken: enrollment.accessToken,
            enrollmentId: enrollment.enrollment.id,
          });
        },
      });
    }

    if (window.TellerConnect) {
      init();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.teller.io/connect/connect.js';
    script.onload = init;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []); // only run once — appId is a build-time constant

  if (enrollMutation.isSuccess) {
    return (
      <p className="text-sm text-green-600 dark:text-green-400 font-medium">
        Bank connected. Hit &quot;Sync Now&quot; above to import your
        transactions.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => handlerRef.current?.open()}
        disabled={enrollMutation.isPending}
        className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      >
        {enrollMutation.isPending ? 'Connecting…' : 'Connect Bank Account'}
      </button>
      {enrollMutation.isError && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {(enrollMutation.error as Error).message}
        </p>
      )}
    </div>
  );
}
