import Decimal from 'decimal.js';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { Sheet } from '@/components/shared/Sheet';
import { Icon } from '@/components/shared/Icon';
import { useIsPhone } from '@/hooks/useIsPhone';
import {
  formatCurrency,
  formatAmount,
  getBalanceHealth,
  getBalanceHealthClasses,
  isNegative,
} from '@/lib/balance';
import { formatFullDate } from '@/lib/dates';
import { getCategoryColor } from '@/lib/categoryColors';
import type { ForecastDay } from '@/api/types';

interface DayPanelProps {
  date: string;
  /** Null when the selected date has no forecast entry. */
  day: ForecastDay | null;
  todayDate: string;
  greenThreshold: string;
  criticalThreshold: string;
  onAddTransaction: (date: string) => void;
  /** Phone only: whether the sheet is raised. The desktop panel is always shown. */
  isOpen: boolean;
  onClose: () => void;
}

function kindLabel(date: string, todayDate: string): string {
  if (date === todayDate) return 'Today';
  return date > todayDate ? 'Forecast day' : 'Settled day';
}

/** One of the two stat tiles above the transaction list. */
function StatTile({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex-1 rounded-md bg-cream p-3">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-label-wide text-warm-gray">
        {label}
      </p>
      <p className={`font-mono text-lg ${valueClass}`}>{value}</p>
    </div>
  );
}

/**
 * Detail for the selected day.
 *
 * Everything the cell could not fit lives here: the full transaction list with
 * no overflow cut, each row's category and source, and the add-transaction
 * entry point. On a phone the cell fits far less, so this carries more of the
 * weight there than it does on desktop.
 *
 * One of the five viewport seams. On desktop it is a persistent `<aside>`
 * beside the grid and selecting a day merely updates it. On a phone there is
 * no room beside anything, so it is a bottom sheet and selecting a day opens
 * something modal — which is why the caller tracks "selected" and "open"
 * separately.
 */
export function DayPanel({
  date,
  day,
  todayDate,
  greenThreshold,
  criticalThreshold,
  onAddTransaction,
  isOpen,
  onClose,
}: DayPanelProps) {
  const isPhone = useIsPhone();
  const transactions = day?.transactions ?? [];
  const dailyNet = day?.dailyNet ?? '0';
  const runningBalance = day?.runningBalance ?? '';

  const netIsZero = new Decimal(dailyNet).isZero();
  const netNegative = isNegative(dailyNet);

  const health = runningBalance
    ? getBalanceHealth(runningBalance, greenThreshold, criticalThreshold)
    : null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-label-wide text-warm-gray">
            {kindLabel(date, todayDate)}
          </p>
          <h3 id="day-panel-title" className="mt-1 font-display text-2xl text-bark-dark">
            {formatFullDate(date)}
          </h3>
        </div>

        {/*
          Phone only. The desktop panel is persistent — there is nothing to
          dismiss, and a close button there would imply otherwise.
        */}
        {isPhone && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close day detail"
            className="hit-target flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cream-mid bg-surface text-stone transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <StatTile
          label="Day net"
          value={netIsZero ? '—' : `${netNegative ? '−' : '+'}$${formatAmount(dailyNet)}`}
          valueClass={netIsZero ? 'text-stone' : netNegative ? 'text-bark-light' : 'text-sage-deep'}
        />
        <StatTile
          label="Balance after"
          value={runningBalance ? formatCurrency(runningBalance) : '—'}
          valueClass={health ? getBalanceHealthClasses(health) : 'text-stone'}
        />
      </div>

      {transactions.length === 0 ? (
        <p className="mt-4 text-[13px] text-stone">Nothing scheduled. Balance carries forward.</p>
      ) : (
        <ul className="mt-4">
          {transactions.map((tx) => {
            const debit = isNegative(tx.amount);
            return (
              <li
                key={tx.id}
                className="flex min-w-0 items-start justify-between gap-3 border-b border-cream-mid py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-charcoal" title={tx.description}>
                    {tx.description}
                  </p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getCategoryColor(tx.category) }}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-stone">
                      {tx.category ?? 'Uncategorized'}
                    </span>
                    <SourceBadge source={tx.source} />
                  </div>
                </div>
                <span
                  className={`shrink-0 font-mono text-sm font-medium ${
                    debit ? 'text-bark-light' : 'text-sage-deep'
                  }`}
                >
                  {debit ? '−' : '+'}${formatAmount(tx.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onAddTransaction(date)}
        className="hit-target mt-5 w-full rounded-full bg-copper px-[18px] py-[11px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-dark hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        Add transaction
      </button>
    </>
  );

  if (isPhone) {
    return (
      <Sheet isOpen={isOpen} onClose={onClose} labelledBy="day-panel-title" className="px-4 pb-4">
        {body}
      </Sheet>
    );
  }

  return (
    <aside
      aria-label={`Detail for ${formatFullDate(date)}`}
      className="sticky top-[88px] w-full rounded-lg border border-cream-mid bg-surface p-5"
    >
      {body}
    </aside>
  );
}
