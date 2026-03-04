import { useState, useCallback, useEffect, useRef } from 'react';
import { MonthCalendarGrid } from './MonthCalendarGrid';
import { ShowMorePopover } from './ShowMorePopover';
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
  currentMonth: string; // 'YYYY-MM'
  greenThreshold: string;
  criticalThreshold: string;
  searchQuery: string;
  matchingDates: Set<string>;
  onSearchChange: (query: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
  onAddTransaction: (data: {
    accountId: string;
    date: string;
    description: string;
    amount: string;
  }) => void;
}

/**
 * Manages roving tabindex keyboard nav, ShowMorePopover, and TransactionModal.
 * Renders a single MonthCalendarGrid for the active month.
 *
 * Keyboard shortcuts:
 * - Arrow keys: navigate day cells
 * - T: jump to today (and navigate to today's month)
 * - Enter / Space: open add transaction modal
 * - Escape: close open popover / modal
 */
export function CalendarTimeline({
  days,
  accountId,
  todayDate,
  currentMonth,
  greenThreshold,
  criticalThreshold,
  searchQuery,
  matchingDates,
  onSearchChange,
  onPrevMonth,
  onNextMonth,
  onToday,
  onAddTransaction,
}: CalendarTimelineProps) {
  // Only include days in the currently visible month for roving tabindex
  const monthDays = days.filter((d) => d.date.slice(0, 7) === currentMonth);
  const allIds = monthDays.map((d) => d.date);

  const [rovingState, setRovingState] = useState(() =>
    createRovingState(allIds, todayDate),
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  const [showMoreDate, setShowMoreDate] = useState<string | null>(null);
  const [showMoreAnchor, setShowMoreAnchor] = useState<HTMLElement | null>(null);
  const [modalDate, setModalDate] = useState<string | null>(null);

  // Sync roving state when the visible month changes
  useEffect(() => {
    const preferredFocus = todayDate.slice(0, 7) === currentMonth ? todayDate : null;
    setRovingState(createRovingState(allIds, preferredFocus ?? allIds[0] ?? todayDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const direction = keyToDirection(e.key);
      if (direction) {
        e.preventDefault();
        setRovingState((prev) => moveFocus(prev, direction));
        return;
      }

      if (e.key === 'T' || e.key === 't') {
        setRovingState((prev) => ({ ...prev, focusedId: todayDate }));
        onToday();
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (rovingState.focusedId) {
          setModalDate(rovingState.focusedId);
        }
        return;
      }

      if (e.key === '/' && !showMoreDate && !modalDate) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
        return;
      }

      if (e.key === 'Escape') {
        if (searchQuery && document.activeElement === searchInputRef.current) {
          onSearchChange('');
          searchInputRef.current?.blur();
        } else if (showMoreDate) {
          setShowMoreDate(null);
          setShowMoreAnchor(null);
        } else if (modalDate) {
          setModalDate(null);
        }
      }
    },
    [rovingState.focusedId, todayDate, onToday, showMoreDate, modalDate, searchQuery, onSearchChange],
  );

  const showMoreTransactions =
    showMoreDate != null
      ? (days.find((d) => d.date === showMoreDate)?.transactions ?? [])
      : [];

  return (
    <div
      role="grid"
      aria-label="Cash flow calendar"
      onKeyDown={handleKeyDown}
      className="outline-none"
    >
      <MonthCalendarGrid
        yearMonth={currentMonth}
        days={days}
        focusedDate={rovingState.focusedId}
        todayDate={todayDate}
        greenThreshold={greenThreshold}
        criticalThreshold={criticalThreshold}
        searchQuery={searchQuery}
        matchingDates={matchingDates}
        searchInputRef={searchInputRef}
        onSearchChange={onSearchChange}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onToday={onToday}
        onFocusDate={(date) =>
          setRovingState((prev) => ({ ...prev, focusedId: date }))
        }
        onActivateDate={(date) => setModalDate(date)}
        onAddTransaction={(date) => setModalDate(date)}
        onShowMore={(date, anchor) => {
          setShowMoreDate(date);
          setShowMoreAnchor(anchor);
        }}
      />

      <ShowMorePopover
        date={showMoreDate ?? ''}
        transactions={showMoreTransactions}
        anchorEl={showMoreAnchor}
        isOpen={showMoreDate !== null}
        searchQuery={searchQuery}
        onClose={() => {
          setShowMoreDate(null);
          setShowMoreAnchor(null);
        }}
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
    </div>
  );
}
