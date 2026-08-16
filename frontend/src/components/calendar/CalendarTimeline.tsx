import { useState, useCallback, useEffect, useRef } from 'react';
import { MonthCalendarGrid } from './MonthCalendarGrid';
import { DayPanel } from './DayPanel';
import { TransactionModal } from './TransactionModal';
import { Icon } from '@/components/shared/Icon';
import { createRovingState, moveFocus, keyToDirection } from '@/lib/keyboard';
import { formatMonthTitle } from '@/lib/dates';
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

/** The day the panel opens on when a month is first shown. */
function defaultSelection(monthDates: string[], todayDate: string, currentMonth: string): string {
  if (todayDate.slice(0, 7) === currentMonth) return todayDate;
  return monthDates[0] ?? todayDate;
}

/**
 * Owns keyboard navigation, day selection and the add-transaction modal, and
 * lays out the section header, calendar card and day panel.
 *
 * Selection and focus are deliberately separate pieces of state. Arrowing
 * through the grid moves the focus ring without disturbing the panel, so a
 * keyboard user can scan the month while keeping one day's detail on screen.
 *
 * Keyboard shortcuts:
 * - Arrow keys: move the focus ring between day cells
 * - T: jump to today, and to today's month
 * - Enter / Space: open the add-transaction modal for the focused day
 * - /: focus the search field
 * - Escape: clear search, or close the modal
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
  const monthDays = days.filter((d) => d.date.slice(0, 7) === currentMonth);
  const allIds = monthDays.map((d) => d.date);

  const [rovingState, setRovingState] = useState(() => createRovingState(allIds, todayDate));
  const [selectedDate, setSelectedDate] = useState(() =>
    defaultSelection(allIds, todayDate, currentMonth),
  );
  const [modalDate, setModalDate] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset focus and selection when the visible month changes.
  useEffect(() => {
    const preferredFocus = todayDate.slice(0, 7) === currentMonth ? todayDate : null;
    setRovingState(createRovingState(allIds, preferredFocus ?? allIds[0] ?? todayDate));
    setSelectedDate(defaultSelection(allIds, todayDate, currentMonth));
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
        setSelectedDate(todayDate);
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

      if (e.key === '/' && !modalDate) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
        return;
      }

      // Escape inside the search field is handled on the input itself.
      if (e.key === 'Escape' && modalDate) {
        setModalDate(null);
      }
    },
    [rovingState.focusedId, todayDate, onToday, modalDate, onSearchChange],
  );

  const selectedDay = days.find((d) => d.date === selectedDate) ?? null;
  const isCurrentMonth = todayDate.slice(0, 7) === currentMonth;

  return (
    <div role="grid" aria-label="Cash flow calendar" onKeyDown={handleKeyDown} className="outline-none">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
        <h3 className="font-display text-2xl text-bark-dark">
          {formatMonthTitle(currentMonth)}, day by day
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-label text-warm-gray">
            Bar = spend that day
          </span>

          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              /*
               * Keystrokes stop here so typing "t" or "/" into the field does
               * not fire the grid shortcuts. Escape is therefore handled on
               * the input itself — routing it to the grid handler could never
               * work, because propagation is already stopped.
               */
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                  onSearchChange('');
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search ( / )"
              aria-label="Search transactions"
              className="hit-target w-40 rounded-full border border-cream-mid bg-white py-[7px] pl-3.5 pr-7 text-[13px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  onSearchChange('');
                  searchInputRef.current?.blur();
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-warm-gray hover:text-bark"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Previous month"
            className="hit-target flex h-9 w-9 items-center justify-center rounded-full border border-cream-mid bg-white text-bark transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <Icon name="chevron-left" />
          </button>

          {!isCurrentMonth && (
            <button
              type="button"
              onClick={onToday}
              className="hit-target rounded-full border border-cream-mid bg-white px-4 py-2 text-[13px] font-semibold text-bark transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Today
            </button>
          )}

          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Next month"
            className="hit-target flex h-9 w-9 items-center justify-center rounded-full border border-cream-mid bg-white text-bark transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>

      {/*
        A wrapping flex row, not a fixed two-column grid: below roughly 1000px
        the panel drops under the calendar instead of crushing the cells.
      */}
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_640px]">
          <MonthCalendarGrid
            yearMonth={currentMonth}
            days={days}
            focusedDate={rovingState.focusedId}
            selectedDate={selectedDate}
            todayDate={todayDate}
            greenThreshold={greenThreshold}
            criticalThreshold={criticalThreshold}
            searchQuery={searchQuery}
            matchingDates={matchingDates}
            onFocusDate={(date) => setRovingState((prev) => ({ ...prev, focusedId: date }))}
            onSelectDate={setSelectedDate}
            onActivateDate={(date) => setModalDate(date)}
          />
        </div>

        <div className="max-w-[336px] flex-[1_1_320px]">
          <DayPanel
            date={selectedDate}
            day={selectedDay}
            todayDate={todayDate}
            greenThreshold={greenThreshold}
            criticalThreshold={criticalThreshold}
            onAddTransaction={(date) => setModalDate(date)}
          />
        </div>
      </div>

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
