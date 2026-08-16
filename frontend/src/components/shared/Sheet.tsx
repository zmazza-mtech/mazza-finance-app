import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { useIsPhone } from '@/hooks/useIsPhone';

/**
 * Everything that can hold focus, minus the things that cannot right now.
 *
 * `[tabindex="-1"]` is excluded because it is programmatically focusable but
 * not tabbable, and the trap is about the Tab order. Disabled controls and
 * `inert` subtrees are skipped for the same reason.
 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * How many sheets are currently open.
 *
 * The body scroll lock is shared state, so it is counted rather than set and
 * cleared. A sheet opened from inside another sheet — a confirm dialog over an
 * edit form — would otherwise unlock the body when the inner one closes,
 * leaving the page behind the outer sheet scrollable.
 */
let openSheets = 0;
let restoreOverflow = '';

function lockBodyScroll(): () => void {
  if (openSheets === 0) {
    restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openSheets += 1;

  return () => {
    openSheets -= 1;
    if (openSheets === 0) {
      document.body.style.overflow = restoreOverflow;
    }
  };
}

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** id of the element that names the sheet. Prefer this over `label`. */
  labelledBy?: string;
  /** Accessible name, for sheets with no visible heading. */
  label?: string;
  /** id of the element describing the sheet. */
  describedBy?: string;
  /** Focused on open. Defaults to the first tabbable element. */
  initialFocusRef?: RefObject<HTMLElement>;
  /** Extra classes for the panel — width, padding, and the like. */
  className?: string;
  children: ReactNode;
}

/**
 * The app's one modal container.
 *
 * Three components used to hand-roll this — `TransactionModal`,
 * `EditSeriesModal` and `ConfirmDialog` — each with its own backdrop, Escape
 * handler and partial focus handling. None of them restored focus on close,
 * none locked body scroll, and one had no focus trap at all. Consolidating
 * fixes all three gaps in one place.
 *
 * `RecurringInstanceMenu` deliberately does not use this. It is a
 * `role="menu"` popover anchored to its trigger, not a modal dialog, and
 * routing it through here would replace menu semantics with dialog semantics.
 * A phone action sheet is a separate primitive; see #26, which is what will
 * first make that menu reachable.
 *
 * It is also a viewport seam. On a phone the panel slides up from the bottom
 * edge and is capped so the tab bar stays visible; on desktop it is the
 * centred dialog it has always been. That difference is structural — a
 * bottom-anchored sheet and a centred dialog do not share a layout — and the
 * scroll container moves with it.
 */
export function Sheet({
  isOpen,
  onClose,
  labelledBy,
  label,
  describedBy,
  initialFocusRef,
  className = '',
  children,
}: SheetProps) {
  const isPhone = useIsPhone();
  const panelRef = useRef<HTMLDivElement>(null);

  // Captured on open, not on close: by the time the sheet closes, focus has
  // moved inside it and the original element is no longer `activeElement`.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const releaseScroll = lockBodyScroll();

    const target =
      initialFocusRef?.current ??
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      panelRef.current;
    target?.focus();

    return () => {
      releaseScroll();
      returnFocusRef.current?.focus();
    };
    // `initialFocusRef` is a ref object and stable; re-running on it would
    // re-focus the sheet on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const panelClasses = isPhone
    ? // Bottom-anchored, capped so the tab bar stays visible and reachable.
      // `motion-safe` carries the slide: with reduced motion the sheet simply
      // appears, which is the point of the preference.
      'relative flex max-h-[85%] w-full flex-col overflow-y-auto rounded-t-xl border-t border-cream-mid bg-surface pb-safe-bottom shadow-xl motion-safe:animate-sheet-up'
    : 'relative mx-4 w-full max-w-md overflow-y-auto rounded-lg border border-cream-mid bg-surface shadow-xl';

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center ${
        isPhone ? 'items-end' : 'items-center'
      }`}
    >
      <div
        data-testid="sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-scrim/50"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className={`${panelClasses} ${className}`}
      >
        {isPhone && (
          <div className="flex flex-shrink-0 justify-center pb-1 pt-2.5">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-cream-mid" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
