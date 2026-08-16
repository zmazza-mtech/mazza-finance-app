import { useSyncExternalStore } from 'react';
import { PHONE_QUERY } from '@/lib/viewport';

/**
 * Whether the viewport is narrower than the phone breakpoint.
 *
 * This is the only place the app reads viewport width in JavaScript. The
 * default everywhere else is a single component tree reshaped by Tailwind
 * utilities; this hook exists for the handful of seams where the phone and
 * desktop structures genuinely differ — a table becoming cards, a dialog
 * becoming a bottom sheet — which CSS cannot express and which would double
 * the accessible row count if both trees were rendered and toggled with
 * `hidden`.
 *
 * `useSyncExternalStore` rather than `useState` plus `useEffect`: the store is
 * read during the first render, so there is no pass that renders the desktop
 * tree and then corrects itself. That correction is visible as a flash, and on
 * the app shell it would mean the nav moving under the reader's thumb.
 */

function subscribe(onStoreChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(PHONE_QUERY).matches;
}

/**
 * The app is client-rendered, so this never runs in practice. React requires
 * it for `useSyncExternalStore`, and desktop is the safer default: it renders
 * every control rather than the reduced phone set.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
