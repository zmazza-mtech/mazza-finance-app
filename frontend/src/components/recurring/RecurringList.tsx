import { useState } from 'react';
import { EditSeriesModal } from './EditSeriesModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatAmount, isNegative } from '@/lib/balance';
import { getCategoryColor } from '@/lib/categoryColors';
import type { Recurring, UpdateRecurringBody } from '@/api/types';

interface RecurringListProps {
  items: Recurring[];
  onUpdate: (id: string, body: UpdateRecurringBody) => void;
  onDelete: (id: string) => void;
}

const COLUMNS: { key: string; label: string; width: string; alignRight?: boolean }[] = [
  { key: 'name', label: 'Series', width: 'auto' },
  { key: 'amount', label: 'Amount', width: '130px', alignRight: true },
  { key: 'frequency', label: 'Frequency', width: '120px' },
  { key: 'nextDate', label: 'Next date', width: '130px' },
  { key: 'status', label: 'Status', width: '100px' },
  { key: 'actions', label: 'Actions', width: '210px', alignRight: true },
];

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
      <div className="rounded-lg border border-cream-mid bg-surface px-[18px] py-12 text-center">
        <p className="text-sm text-stone">No recurring transactions yet.</p>
        <p className="mt-1 text-sm text-warm-gray">
          Sync your accounts or add one manually to get started.
        </p>
      </div>
    );
  }

  function toggleStatus(item: Recurring) {
    onUpdate(item.id, { status: item.status === 'active' ? 'disabled' : 'active' });
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border border-cream-mid bg-surface md:block">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed">
            <colgroup>
              {COLUMNS.map((col) => (
                <col
                  key={col.key}
                  style={col.width === 'auto' ? undefined : { width: col.width }}
                />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-cream-mid bg-cream">
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-[18px] py-3 font-mono text-[10px] font-normal uppercase tracking-label-wide text-stone ${
                      col.alignRight ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {active.map((item) => {
                const debit = isNegative(item.amount);
                return (
                  <tr
                    key={item.id}
                    className="border-b border-cream-mid transition-colors duration-150 last:border-b-0 hover:bg-cream"
                  >
                    <td className="px-[18px] py-[13px]">
                      <SeriesName item={item} />
                    </td>
                    <td
                      className={`whitespace-nowrap px-[18px] py-[13px] text-right font-mono text-sm ${
                        debit ? 'text-bark-light' : 'text-sage-deep'
                      }`}
                    >
                      {debit ? '−' : '+'}${formatAmount(item.amount)}
                    </td>
                    <td className="px-[18px] py-[13px] text-[13px] capitalize text-stone">
                      {item.frequency}
                    </td>
                    <td className="whitespace-nowrap px-[18px] py-[13px] font-mono text-xs text-stone">
                      {item.nextDate}
                    </td>
                    <td className="px-[18px] py-[13px]">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-[18px] py-[13px]">
                      <RowActions
                        item={item}
                        alignRight
                        onEdit={() => setEditTarget(item)}
                        onToggle={() => toggleStatus(item)}
                        onDelete={() => setDeleteTarget(item.id)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <ul className="space-y-2.5 md:hidden">
        {active.map((item) => {
          const debit = isNegative(item.amount);
          return (
            <li
              key={item.id}
              className="rounded-lg border border-cream-mid bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SeriesName item={item} />
                  <p className="mt-0.5 font-mono text-xs text-stone">
                    <span className={debit ? 'text-bark-light' : 'text-sage-deep'}>
                      {debit ? '−' : '+'}${formatAmount(item.amount)}
                    </span>{' '}
                    &middot; <span className="capitalize">{item.frequency}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-warm-gray">
                    Next {item.nextDate}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-3">
                <RowActions
                  item={item}
                  onEdit={() => setEditTarget(item)}
                  onToggle={() => toggleStatus(item)}
                  onDelete={() => setDeleteTarget(item.id)}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <EditSeriesModal
        recurring={editTarget}
        isOpen={editTarget !== null}
        onSave={(id, body) => { if (id) onUpdate(id, body); }}
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

function SeriesName({ item }: { item: Recurring }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ backgroundColor: getCategoryColor(item.category) }}
        aria-hidden="true"
      />
      <span className="truncate text-sm text-charcoal" title={item.name}>
        {item.name}
      </span>
    </span>
  );
}

function StatusBadge({ status }: { status: Recurring['status'] }) {
  const classes =
    status === 'active'
      ? 'bg-sage-lighter text-sage-deep'
      : 'bg-cream-mid text-stone';

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${classes}`}
    >
      {status === 'active' ? 'Active' : 'Disabled'}
    </span>
  );
}

function RowActions({
  item,
  onEdit,
  onToggle,
  onDelete,
  alignRight = false,
}: {
  item: Recurring;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  alignRight?: boolean;
}) {
  const ghost =
    'hit-target rounded-full border border-cream-mid bg-surface px-3 py-1 text-xs text-bark transition-colors duration-150 hover:border-sage-light focus:outline-none focus-visible:ring-2 focus-visible:ring-sage';

  return (
    <div className={`flex flex-wrap gap-2 ${alignRight ? 'justify-end' : ''}`}>
      <button
        type="button"
        aria-label={`Edit ${item.name}`}
        onClick={onEdit}
        className={ghost}
      >
        Edit
      </button>
      <button
        type="button"
        aria-label={item.status === 'active' ? `Disable ${item.name}` : `Enable ${item.name}`}
        onClick={onToggle}
        className={ghost}
      >
        {item.status === 'active' ? 'Disable' : 'Enable'}
      </button>
      <button
        type="button"
        aria-label={`Delete ${item.name}`}
        onClick={onDelete}
        className="hit-target rounded-full border border-danger-line bg-surface px-3 py-1 text-xs text-error transition-colors duration-150 hover:bg-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        Delete
      </button>
    </div>
  );
}
