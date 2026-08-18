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
  /**
   * A day to jump to, set by something outside the calendar — the balance alert
   * banner's "View" link. The parent moves the month and sets this together;
   * clearing it via `onRequestedDateHandled` is what lets the same date be
   * asked for twice in a row.
   */
  requestedDate: string | null;
  onRequestedDateHandled: () => void;
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
 * DOM focus follows the ring, but only when a key moved it. A month change the
 * user made with the mouse, or a first render, must not pull focus away from
 * wherever it already is.
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
  requestedDate,
  onRequestedDateHandled,
}: CalendarTimelineProps) {
  const monthDays = days.filter((d) => d.date.slice(0, 7) === currentMonth);
  const allIds = monthDays.map((d) => d.date);

  const [rovingState, setRovingState] = useState(() => createRovingState(allIds, todayDate));
  const [selectedDate, setSelectedDate] = useState(() =>
    defaultSelection(allIds, todayDate, currentMonth),
  );
  const [modalDate, setModalDate] = useState<string | null>(null);
  /** Phone only: the search field is behind a toggle below `sm`. */
  const [searchOpen, setSearchOpen] = useState(false);
  /*
   * Phone only: whether the day sheet is raised.
   *
   * Separate from `selectedDate` because on a phone the two mean different
   * things. Selecting a day updates a persistent panel on desktop, but opens
   * something modal on a phone — so closing the sheet has to leave the day
   * selected, or returning to the calendar would lose the reader's place.
   */
  const [sheetOpen, setSheetOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /**
   * Set by every shortcut that moves the ring, and consumed by the effect that
   * moves DOM focus after it. A ref rather than state: it must not itself cause
   * a render, and it has to survive the one the shortcut triggers.
   */
  const focusFollowsKey = useRef(false);

  /** The element the transaction modal was opened from, to hand focus back to. */
  const modalTrigger = useRef<HTMLElement | null>(null);

  // Reset focus and selection when the visible month changes.
  useEffect(() => {
    const preferredFocus = todayDate.slice(0, 7) === currentMonth ? todayDate : null;
    setRovingState(createRovingState(allIds, preferredFocus ?? allIds[0] ?? todayDate));
    setSelectedDate(defaultSelection(allIds, todayDate, currentMonth));
    setSheetOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  /*
   * Move DOM focus onto the cell carrying the ring.
   *
   * The roving tabindex pattern requires the two together: a ring that moves
   * while focus stays behind announces nothing to a screen reader, and leaves
   * the next Tab departing from a cell the user cannot see.
   *
   * `currentMonth` is a dependency because T crosses months — the cell to focus
   * does not exist until the new month has rendered.
   */
  useEffect(() => {
    if (!focusFollowsKey.current) return;
    focusFollowsKey.current = false;

    const date = rovingState.focusedId;
    if (!date) return;
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();
  }, [rovingState.focusedId, currentMonth]);

  /*
   * Honour a jump requested from outside the calendar.
   *
   * Declared after the focus effect on purpose. Both run in the commit that
   * changes the month, and the focus effect consumes `focusFollowsKey` — if it
   * ran second it would consume the flag while `focusedId` still held the old
   * day, moving focus to the wrong cell and swallowing the jump.
   *
   * A date outside the visible month is left alone rather than clearing the
   * request: the parent sets the month and the date together, so by the time
   * this runs the month has already caught up.
   */
  useEffect(() => {
    if (!requestedDate) return;
    if (!allIds.includes(requestedDate)) return;

    setRovingState((prev) => ({ ...prev, focusedId: requestedDate }));
    setSelectedDate(requestedDate);
    focusFollowsKey.current = true;
    onRequestedDateHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedDate, currentMonth]);

  /** Opens the modal, remembering what to give focus back to on close. */
  const openModal = useCallback((date: string) => {
    modalTrigger.current = document.activeElement as HTMLElement | null;
    // On a phone the entry point is inside the day sheet. Two stacked sheets
    // would trap focus in the lower one and hide the form behind it. On
    // desktop this is a no-op — the panel ignores `sheetOpen`.
    setSheetOpen(false);
    setModalDate(date);
  }, []);

  /** Closes the modal and returns focus to whatever opened it (PRD §5.2). */
  const closeModal = useCallback(() => {
    setModalDate(null);
    modalTrigger.current?.focus();
    modalTrigger.current = null;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      /*
       * While the modal is open every key belongs to it, including its own
       * Escape. Keys reach this handler at all only because the modal renders
       * inside the grid — without this guard an arrow key typed in the
       * description field would move the ring behind the modal, and take focus
       * out of the field with it.
       */
      if (modalDate) return;

      const direction = keyToDirection(e.key);
      if (direction) {
        e.preventDefault();
        focusFollowsKey.current = true;
        setRovingState((prev) => moveFocus(prev, direction));
        return;
      }

      if (e.key === 'T' || e.key === 't') {
        focusFollowsKey.current = true;
        setRovingState((prev) => ({ ...prev, focusedId: todayDate }));
        setSelectedDate(todayDate);
        onToday();
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (rovingState.focusedId) {
          openModal(rovingState.focusedId);
        }
        return;
      }

      // Escape inside the search field is handled on the input itself.
      if (e.key === '/') {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          searchInputRef.current?.focus();
        }
      }
    },
    [rovingState.focusedId, todayDate, onToday, modalDate, onSearchChange, openModal, closeModal],
  );

  const selectedDay = days.find((d) => d.date === selectedDate) ?? null;
  const isCurrentMonth = todayDate.slice(0, 7) === currentMonth;

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label="Cash flow calendar"
      onKeyDown={handleKeyDown}
      className="outline-none"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 sm:gap-4">
        <h3 className="font-display text-xl text-bark-dark sm:text-2xl">
          {formatMonthTitle(currentMonth)}, day by day
        </h3>

        <div className="flex flex-wrap items-center gap-2">
          {/* The legend moves below the grid on a phone, where the row has no room. */}
          <span className="hidden font-mono text-[10px] uppercase tracking-label text-warm-gray sm:inline">
            Bar = spend that day
          </span>

          {/*
            A 160px field alongside three month controls does not fit 393px, so
            below `sm` the field is behind this toggle and opens full width on
            its own row. From `sm` up the field is always there and this button
            is not.
          */}
          <button
            type="button"
            onClick={() => {
              setSearchOpen((open) => !open);
              // Focus lands after the field is displayed, not before.
              requestAnimationFrame(() => searchInputRef.current?.focus());
            }}
            /*
              Not "Search transactions" — that is the field's name, and two
              controls under one accessible name is ambiguous to anyone
              choosing between them by name. `aria-expanded` carries the state.
            */
            aria-label={searchOpen ? 'Hide search' : 'Show search'}
            aria-expanded={searchOpen}
            aria-controls="calendar-search"
            className="hit-target flex h-9 w-9 items-center justify-center rounded-full border border-cream-mid bg-surface text-bark transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage sm:hidden"
          >
            <Icon name="search" />
          </button>

          <div
            id="calendar-search"
            className={`relative order-last basis-full sm:order-none sm:basis-auto ${
              searchOpen ? 'block' : 'hidden'
            } sm:block`}
          >
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
              className="hit-target w-full rounded-full sm:w-40 border border-cream-mid bg-surface py-[7px] pl-3.5 pr-7 text-[13px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
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
            className="hit-target flex h-9 w-9 items-center justify-center rounded-full border border-cream-mid bg-surface text-bark transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            <Icon name="chevron-left" />
          </button>

          {!isCurrentMonth && (
            <button
              type="button"
              onClick={onToday}
              className="hit-target rounded-full border border-cream-mid bg-surface px-4 py-2 text-[13px] font-semibold text-bark transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Today
            </button>
          )}

          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Next month"
            className="hit-target flex h-9 w-9 items-center justify-center rounded-full border border-cream-mid bg-surface text-bark transition-colors duration-150 hover:bg-cream focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
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
            onSelectDate={(date) => {
              setSelectedDate(date);
              setSheetOpen(true);
            }}
            onActivateDate={openModal}
          />

          {/*
            The legend the header row has no room for on a phone. Also says
            what a tap does, which is not discoverable the way hovering a
            desktop cell is.
          */}
          <p className="mt-2.5 text-center font-mono text-[9px] uppercase tracking-label-wide text-warm-gray sm:hidden">
            Tap a day for detail · bar = spend
          </p>
        </div>

        <div className="max-w-[336px] flex-[1_1_320px]">
          <DayPanel
            date={selectedDate}
            day={selectedDay}
            todayDate={todayDate}
            greenThreshold={greenThreshold}
            criticalThreshold={criticalThreshold}
            onAddTransaction={openModal}
            isOpen={sheetOpen}
            onClose={() => setSheetOpen(false)}
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
          closeModal();
        }}
        onClose={closeModal}
      />
    </div>
  );
}
