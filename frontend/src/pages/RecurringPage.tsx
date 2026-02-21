import { useContext, useState } from 'react';
import { RecurringList } from '@/components/recurring/RecurringList';
import { PendingReviewSection } from '@/components/recurring/PendingReviewSection';
import { EditSeriesModal } from '@/components/recurring/EditSeriesModal';
import {
  useRecurring,
  usePendingReview,
  useCreateRecurring,
  useUpdateRecurring,
  useDeleteRecurring,
  useDetectRecurring,
} from '@/hooks/useRecurring';
import { AccountContext } from '@/App';
import type { Recurring, UpdateRecurringBody, CreateRecurringBody } from '@/api/types';

type DetectStatus = 'idle' | 'success' | 'none' | 'error';

/**
 * Recurring transaction management page.
 */
export function RecurringPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [editTarget, setEditTarget] = useState<Recurring | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [detectStatus, setDetectStatus] = useState<DetectStatus>('idle');
  const [detectCount, setDetectCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);

  const { data: allRecurring = [], isLoading, isError } = useRecurring(selectedAccountId);
  const { data: pending = [] } = usePendingReview(selectedAccountId);
  const createMutation = useCreateRecurring(selectedAccountId);
  const updateMutation = useUpdateRecurring(selectedAccountId);
  const deleteMutation = useDeleteRecurring(selectedAccountId);
  const detectMutation = useDetectRecurring(selectedAccountId);

  function handleSave(id: string | null, body: UpdateRecurringBody) {
    if (id === null) {
      // Create new recurring series
      const createBody: CreateRecurringBody = {
        accountId: selectedAccountId,
        name: body.name!,
        amount: body.amount!,
        frequency: body.frequency!,
        nextDate: body.nextDate!,
        ...(body.endDate ? { endDate: body.endDate } : {}),
      };
      createMutation.mutate(createBody);
    } else {
      updateMutation.mutate({ id, body });
    }
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  function handleConfirmPending(id: string) {
    updateMutation.mutate({ id, body: { status: 'active' } });
  }

  function handleDismissPending(id: string) {
    updateMutation.mutate({ id, body: { status: 'disabled' } });
  }

  function handleScan() {
    setDetectStatus('idle');
    detectMutation.mutate(undefined, {
      onSuccess: (result) => {
        setDetectCount(result.detected);
        setExpiredCount(result.expired);
        setDetectStatus(result.detected > 0 || result.expired > 0 ? 'success' : 'none');
      },
      onError: () => {
        setDetectStatus('error');
      },
    });
  }

  if (!selectedAccountId) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <p>Select an account to manage recurring transactions.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading recurring transactions"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="p-4 text-center text-red-700 dark:text-red-400">
        Failed to load recurring transactions. Please try refreshing.
      </div>
    );
  }

  const nonPending = allRecurring.filter((r) => r.status !== 'pending_review');

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          Recurring Transactions
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleScan}
            disabled={detectMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {detectMutation.isPending ? (
              <span
                className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
            ) : (
              <span aria-hidden="true">🔍</span>
            )}
            Scan for patterns
          </button>

          <button
            type="button"
            onClick={() => {
              setEditTarget(null);
              setIsCreatingNew(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <span aria-hidden="true">+</span>
            Add manually
          </button>
        </div>
      </div>

      {/* Scan result feedback */}
      {detectStatus === 'success' && (
        <p className="mb-4 text-sm text-green-700 dark:text-green-400">
          {detectCount > 0 && `Found ${detectCount} new pattern${detectCount !== 1 ? 's' : ''}.`}
          {detectCount > 0 && expiredCount > 0 && ' '}
          {expiredCount > 0 && `Ended ${expiredCount} stale series.`}
        </p>
      )}
      {detectStatus === 'none' && (
        <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          No new patterns detected.
        </p>
      )}
      {detectStatus === 'error' && (
        <p className="mb-4 text-sm text-red-700 dark:text-red-400">
          Scan failed — try again.
        </p>
      )}

      <PendingReviewSection
        items={pending}
        onConfirm={handleConfirmPending}
        onDismiss={handleDismissPending}
        onEdit={(r) => {
          setIsCreatingNew(false);
          setEditTarget(r);
        }}
      />

      <RecurringList
        items={nonPending}
        onUpdate={(id, body) => updateMutation.mutate({ id, body })}
        onDelete={handleDelete}
      />

      <EditSeriesModal
        recurring={editTarget}
        isOpen={editTarget !== null || isCreatingNew}
        isCreating={isCreatingNew}
        onSave={handleSave}
        onClose={() => {
          setEditTarget(null);
          setIsCreatingNew(false);
        }}
      />
    </div>
  );
}
