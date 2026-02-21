import { useContext, useState } from 'react';
import { RecurringList } from '@/components/recurring/RecurringList';
import { PendingReviewSection } from '@/components/recurring/PendingReviewSection';
import { EditSeriesModal } from '@/components/recurring/EditSeriesModal';
import {
  useRecurring,
  usePendingReview,
  useUpdateRecurring,
  useDeleteRecurring,
} from '@/hooks/useRecurring';
import { AccountContext } from '@/App';
import type { Recurring, UpdateRecurringBody } from '@/api/types';

/**
 * Recurring transaction management page.
 */
export function RecurringPage() {
  const { selectedAccountId } = useContext(AccountContext);
  const [editTarget, setEditTarget] = useState<Recurring | null>(null);

  const { data: allRecurring = [], isLoading, isError } = useRecurring(selectedAccountId);
  const { data: pending = [] } = usePendingReview(selectedAccountId);
  const updateMutation = useUpdateRecurring(selectedAccountId);
  const deleteMutation = useDeleteRecurring(selectedAccountId);

  function handleUpdate(id: string, body: UpdateRecurringBody) {
    updateMutation.mutate({ id, body });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id);
  }

  function handleConfirmPending(id: string) {
    handleUpdate(id, { status: 'active' });
  }

  function handleDismissPending(id: string) {
    handleUpdate(id, { status: 'disabled' });
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
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Recurring Transactions
      </h1>

      <PendingReviewSection
        items={pending}
        onConfirm={handleConfirmPending}
        onDismiss={handleDismissPending}
        onEdit={(r) => setEditTarget(r)}
      />

      <RecurringList
        items={nonPending}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
      />

      <EditSeriesModal
        recurring={editTarget}
        isOpen={editTarget !== null}
        onSave={handleUpdate}
        onClose={() => setEditTarget(null)}
      />
    </div>
  );
}
