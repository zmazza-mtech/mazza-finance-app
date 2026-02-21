import { useState, useCallback, useRef, useEffect } from 'react';
import { MonthSection } from './MonthSection';
import { ShowMoreDrawer } from './ShowMoreDrawer';
import { TransactionModal } from './TransactionModal';
import {
  createRovingState,
  moveFocus,
  keyToDirection,
} from '@/lib/keyboard';
import type { ForecastDay } from '@/api/types';

interface CalendarTimelineProps {
  days: ForecastDay[];
  accountId: string;
  todayDate: string;
  greenThreshold: string;
  criticalThreshold: string;
  onAddTransaction: (data: {
    accountId: string;
    date: string;
    description: string;
    amount: string;
  }) => void;
}

/**
 * Groups forecast days by month, handles roving tabindex keyboard nav,
 * and orchestrates ShowMoreDrawer + TransactionModal.
 *
 * Keyboard shortcuts:
 * - Arrow keys: navigate day cells
 * - T: jump to today
 * - Enter: activate focused cell (open add transaction)
 * - Escape: close open drawer/modal
 */
export function CalendarTimeline({
  days,
  accountId,
  todayDate,
  greenThreshold,
  criticalThreshold,
  onAddTransaction,
}: CalendarTimelineProps) {
  const allIds = days.map((d) => d.date);
  const [rovingState, setRovingState] = useState(() =>
    createRovingState(allIds, todayDate),
  );

  const [showMoreDate, setShowMoreDate] = useState<string | null>(null);
  const [modalDate, setModalDate] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync roving state when days list changes
  useEffect(() => {
    setRovingState((prev) => createRovingState(allIds, prev.focusedId ?? todayDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length]);

  // Scroll to today whenever the days list loads or changes
  useEffect(() => {
    if (days.length > 0) {
      scrollToDate(todayDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days.length, todayDate]);

  // Group days by month label
  const months = groupByMonth(days);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const direction = keyToDirection(e.key);
      if (direction) {
        e.preventDefault();
        setRovingState((prev) => moveFocus(prev, direction));
        return;
      }

      if (e.key === 'T' || e.key === 't') {
        // Jump to today
        setRovingState((prev) => ({ ...prev, focusedId: todayDate }));
        scrollToDate(todayDate);
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (rovingState.focusedId) {
          setModalDate(rovingState.focusedId);
        }
      }
    },
    [rovingState.focusedId, todayDate],
  );

  function scrollToDate(date: string) {
    const el = containerRef.current?.querySelector(`[data-date="${date}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const showMoreTransactions =
    showMoreDate != null
      ? (days.find((d) => d.date === showMoreDate)?.transactions ?? [])
      : [];

  return (
    <>
      <div
        ref={containerRef}
        role="grid"
        aria-label="Cash flow calendar"
        aria-rowcount={days.length}
        onKeyDown={handleKeyDown}
        className="outline-none"
      >
        {months.map(({ label, days: monthDays }) => (
          <MonthSection
            key={label}
            month={label}
            days={monthDays}
            focusedDate={rovingState.focusedId}
            todayDate={todayDate}
            greenThreshold={greenThreshold}
            criticalThreshold={criticalThreshold}
            onFocusDate={(date) =>
              setRovingState((prev) => ({ ...prev, focusedId: date }))
            }
            onActivateDate={(date) => setModalDate(date)}
            onAddTransaction={(date) => setModalDate(date)}
            onShowMore={(date) => setShowMoreDate(date)}
          />
        ))}
      </div>

      <ShowMoreDrawer
        date={showMoreDate ?? ''}
        transactions={showMoreTransactions}
        isOpen={showMoreDate !== null}
        onClose={() => setShowMoreDate(null)}
      />

      <TransactionModal
        date={modalDate ?? todayDate}
        accountId={accountId}
        isOpen={modalDate !== null}
        onSubmit={(data) => {
          if (!modalDate) return;
          onAddTransaction({ accountId, date: modalDate, ...data });
          setModalDate(null);
        }}
        onClose={() => setModalDate(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MonthGroup {
  label: string;
  days: ForecastDay[];
}

function groupByMonth(days: ForecastDay[]): MonthGroup[] {
  const map = new Map<string, ForecastDay[]>();

  for (const day of days) {
    const label = monthLabel(day.date);
    const existing = map.get(label);
    if (existing) {
      existing.push(day);
    } else {
      map.set(label, [day]);
    }
  }

  return Array.from(map.entries()).map(([label, days]) => ({ label, days }));
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
