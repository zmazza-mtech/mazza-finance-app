/**
 * The sign-in gate (#77).
 *
 * Nothing behind it renders until Auth0 says who the user is. That is not the
 * security boundary — the Worker refuses every `/api` request without a valid
 * token, and a browser is not a thing to trust — but rendering a calendar
 * with no data behind it and letting five queries 401 in parallel is a worse
 * way to say "sign in".
 */
import type { ReactNode } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { readAuthConfig } from './config';

function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream px-6 text-center">
      {children}
    </div>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated, error, loginWithRedirect } = useAuth0();

  if (isLoading) {
    return (
      <FullScreen>
        <p className="font-mono text-[11px] uppercase tracking-label-wide text-warm-gray">
          Checking your session…
        </p>
      </FullScreen>
    );
  }

  if (error) {
    return (
      <FullScreen>
        <h1 className="font-display text-2xl text-bark-dark">Could not sign you in</h1>
        {/*
          Auth0's message is shown because the useful ones are actionable —
          "callback URL mismatch" is a configuration problem someone can fix,
          and hiding it behind "something went wrong" costs an hour.
        */}
        <p className="max-w-sm text-sm text-stone">{error.message}</p>
        <button
          type="button"
          onClick={() => void loginWithRedirect()}
          className="hit-target rounded-full bg-copper-dark px-[18px] py-[11px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-deep hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Try again
        </button>
      </FullScreen>
    );
  }

  if (!isAuthenticated) {
    return (
      <FullScreen>
        <h1 className="font-display text-3xl text-bark-dark">Mazza Finance</h1>
        <p className="max-w-sm text-sm text-stone">
          Sign in to see your forecast.
        </p>
        <button
          type="button"
          onClick={() => void loginWithRedirect()}
          className="hit-target rounded-full bg-copper-dark px-[18px] py-[11px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-deep hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Sign in
        </button>
      </FullScreen>
    );
  }

  return <>{children}</>;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  // Unconfigured means the Compose build, which has no Auth0 tenant. The
  // Worker still refuses every unauthenticated request, so this cannot become
  // an accidental way in — see AuthProvider.
  if (!readAuthConfig()) return <>{children}</>;

  return <Gate>{children}</Gate>;
}
