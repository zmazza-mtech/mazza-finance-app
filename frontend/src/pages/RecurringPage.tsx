import { useContext, useState } from 'react';
import { RecurringList } from '@/components/recurring/RecurringList';
import { PendingReviewSection } from '@/components/recurring/PendingReviewSection';
import { EditSeriesModal } from '@/components/recurring/EditSeriesModal';
import {
  ScanResultMessage,
  type DetectStatus,
} from '@/components/recurring/ScanResultMessage';
import { Icon } from '@/components/shared/Icon';
import { describeSeriesCounts } from '@/lib/recurring';
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
      <div className="flex h-64 items-center justify-center text-sm text-stone">
        <p>Select an account to manage recurring transactions.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div
          className="spinner-sage"
          role="status"
          aria-label="Loading recurring transactions"
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div role="alert" className="p-4 text-center text-sm text-error">
        Failed to load recurring transactions. Please try refreshing.
      </div>
    );
  }

  const nonPending = allRecurring.filter((r) => r.status !== 'pending_review');
  const activeCount = nonPending.filter((r) => r.status === 'active').length;

  return (
    <div className="mx-auto max-w-shell px-6 py-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-bark-dark">Recurring</h1>
          <p className="mt-1 text-[15px] text-stone">
            {describeSeriesCounts(activeCount, pending.length)}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleScan}
            disabled={detectMutation.isPending}
            className="hit-target flex items-center gap-2 rounded-full border border-cream-mid bg-white px-[18px] py-[11px] text-sm text-bark transition-colors duration-150 hover:border-sage-light disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            {detectMutation.isPending ? (
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden="true"
              />
            ) : (
              <Icon name="search" size={14} />
            )}
            Scan for patterns
          </button>

          <button
            type="button"
            onClick={() => {
              setEditTarget(null);
              setIsCreatingNew(true);
            }}
            className="hit-target rounded-full bg-copper px-[18px] py-[11px] text-sm font-semibold text-white transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-dark hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            Add manually
          </button>
        </div>
      </div>

      <ScanResultMessage
        status={detectStatus}
        detected={detectCount}
        expired={expiredCount}
      />

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
