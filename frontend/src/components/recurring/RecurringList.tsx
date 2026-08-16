import { useState } from 'react';
import { EditSeriesModal } from './EditSeriesModal';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatAmount, isNegative } from '@/lib/balance';
import { getCategoryColor } from '@/lib/categoryColors';
import type { Recurring, UpdateRecurringBody } from '@/api/types';
import { useIsPhone } from '@/hooks/useIsPhone';
import { nextOccurrenceAfter } from '@/lib/recurring';
import { todayIso } from '@/lib/dates';

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
 * Displays recurring series: active and disabled in the main list, and any
 * that have ended in a separate section below it.
 *
 * Ended series used to be filtered out entirely, which meant a series ended in
 * error could not be seen, edited or revived from the app at all — and
 * re-detection is blocked by name, so nothing brought it back on its own
 * either (#43, Defect 4). They are listed here so that judgement stays with
 * the reader rather than with a staleness heuristic.
 */
export function RecurringList({ items, onUpdate, onDelete }: RecurringListProps) {
  const isPhone = useIsPhone();
  const [editTarget, setEditTarget] = useState<Recurring | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const active = items.filter((r) => r.status === 'active' || r.status === 'disabled');
  const ended = items.filter((r) => r.status === 'ended');

  /**
   * Brings an ended series back.
   *
   * `nextDate` is rolled forward to the next occurrence after today. Restoring
   * the stored date would put a date months in the past into an active series,
   * which is judged stale on the next detection run and expands every
   * occurrence since as though it were owed.
   */
  function reactivate(item: Recurring) {
    onUpdate(item.id, {
      status: 'active',
      endDate: null,
      nextDate: nextOccurrenceAfter(item.nextDate, item.frequency, todayIso()),
    });
  }

  if (active.length === 0 && ended.length === 0) {
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
      {/*
        One or the other, never both. Toggling two trees with `hidden` leaves
        every series name and every Edit/Disable/Delete button in the DOM
        twice, which makes each of them ambiguous to find by name.
      */}
      {!isPhone && (
      <div className="overflow-hidden rounded-lg border border-cream-mid bg-surface">
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
      )}

      {isPhone && (
      <ul className="space-y-2.5">
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
      )}

      {ended.length > 0 && (
        <section aria-labelledby="ended-series-heading" className="mt-6">
          <h3 id="ended-series-heading" className="font-display text-lg text-bark-dark">
            Ended series
          </h3>
          <p className="mb-2.5 mt-1 text-[13px] text-stone">
            These no longer appear in the forecast. A series is ended
            automatically when no payment has been seen for a while, so anything
            here that is still being paid can be brought back.
          </p>

          <ul className="space-y-2.5">
            {ended.map((item) => {
              const debit = isNegative(item.amount);
              return (
                <li
                  key={item.id}
                  className="list-row flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cream-mid bg-surface p-3.5"
                >
                  <div className="min-w-0">
                    <SeriesName item={item} />
                    <p className="mt-0.5 font-mono text-xs text-stone">
                      <span className={debit ? 'text-bark-light' : 'text-sage-deep'}>
                        {debit ? '−' : '+'}${formatAmount(item.amount)}
                      </span>{' '}
                      &middot; <span className="capitalize">{item.frequency}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => reactivate(item)}
                    aria-label={`Reactivate ${item.name}`}
                    className="hit-target shrink-0 rounded-full border border-cream-mid bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-sage-deep transition-colors duration-150 hover:border-sage-light hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
                  >
                    Reactivate
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
  /*
   * `flex-1` below `sm` so the three actions divide the card's width evenly,
   * as the handoff draws them; `sm:flex-none` hands the width back to the
   * content inside the table cell, where they sit in a row of their own.
   */
  const ghost =
    'hit-target flex-1 rounded-full border border-cream-mid bg-surface px-3 py-1 text-xs text-bark transition-colors duration-150 hover:border-sage-light focus:outline-none focus-visible:ring-2 focus-visible:ring-sage sm:flex-none';

  return (
    <div className={`flex gap-2 sm:flex-wrap ${alignRight ? 'justify-end' : ''}`}>
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
        className="hit-target flex-1 rounded-full border border-danger-line bg-surface px-3 py-1 text-xs text-error transition-colors duration-150 hover:bg-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-sage sm:flex-none"
      >
        Delete
      </button>
    </div>
  );
}
