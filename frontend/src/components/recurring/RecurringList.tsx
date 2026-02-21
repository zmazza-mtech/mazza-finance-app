import { useState } from 'react';
import { EditSeriesModal } from './EditSeriesModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatCurrency } from '@/lib/balance';
import type { Recurring, UpdateRecurringBody } from '@/api/types';

interface RecurringListProps {
  items: Recurring[];
  onUpdate: (id: string, body: UpdateRecurringBody) => void;
  onDelete: (id: string) => void;
}

/**
 * Displays active and disabled recurring transactions.
 * - Desktop: table layout
 * - Mobile (<768px): card layout
 */
export function RecurringList({ items, onUpdate, onDelete }: RecurringListProps) {
  const [editTarget, setEditTarget] = useState<Recurring | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const active = items.filter((r) => r.status === 'active' || r.status === 'disabled');

  if (active.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-sm">No recurring transactions yet.</p>
        <p className="text-sm mt-1">
          Sync your accounts or add one manually to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead>
            <tr>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Amount
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Frequency
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Next date
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {active.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {item.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                  {formatCurrency(item.amount)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 capitalize">
                  {item.frequency}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                  {item.nextDate}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <RowActions
                    item={item}
                    onEdit={() => setEditTarget(item)}
                    onToggle={() =>
                      onUpdate(item.id, {
                        status: item.status === 'active' ? 'disabled' : 'active',
                      })
                    }
                    onDelete={() => setDeleteTarget(item.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <ul className="md:hidden space-y-3">
        {active.map((item) => (
          <li
            key={item.id}
            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {item.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {formatCurrency(item.amount)} &middot; {item.frequency}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mt-0.5">
                  Next: {item.nextDate}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            <div className="flex gap-2 mt-3">
              <RowActions
                item={item}
                onEdit={() => setEditTarget(item)}
                onToggle={() =>
                  onUpdate(item.id, {
                    status: item.status === 'active' ? 'disabled' : 'active',
                  })
                }
                onDelete={() => setDeleteTarget(item.id)}
              />
            </div>
          </li>
        ))}
      </ul>

      <EditSeriesModal
        recurring={editTarget}
        isOpen={editTarget !== null}
        onSave={onUpdate}
        onClose={() => setEditTarget(null)}
      />

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete recurring transaction?"
        description="This will end the series and remove all future occurrences from your forecast."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          if (deleteTarget) onDelete(deleteTarget);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: Recurring['status'] }) {
  const classes =
    status === 'active'
      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classes}`}>
      {status === 'active' ? 'Active' : 'Disabled'}
    </span>
  );
}

function RowActions({
  item,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: Recurring;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        type="button"
        aria-label={`Edit ${item.name}`}
        onClick={onEdit}
        className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        Edit
      </button>
      <button
        type="button"
        aria-label={item.status === 'active' ? `Disable ${item.name}` : `Enable ${item.name}`}
        onClick={onToggle}
        className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {item.status === 'active' ? 'Disable' : 'Enable'}
      </button>
      <button
        type="button"
        aria-label={`Delete ${item.name}`}
        onClick={onDelete}
        className="px-3 py-1 text-xs border border-red-300 dark:border-red-700 rounded text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 focus:outline-none focus:ring-2 focus:ring-red-500"
      >
        Delete
      </button>
    </div>
  );
}
