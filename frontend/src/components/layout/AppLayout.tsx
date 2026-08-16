import { useContext, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useBankAccounts } from '@/hooks/useAccounts';
import { useSyncStatus, useTriggerSync, useAutoSync } from '@/hooks/useSync';
import { AccountContext } from '@/App';
import { formatAmount } from '@/lib/balance';
import type { Account } from '@/api/types';

const NAV_ITEMS = [
  { to: '/', label: 'Calendar', end: true },
  { to: '/transactions', label: 'Transactions', end: false },
  { to: '/recurring', label: 'Recurring', end: false },
  { to: '/reports', label: 'Reports', end: false },
  { to: '/settings', label: 'Settings', end: false },
] as const;

/** "Joint Checking · $3,142.00", or just the name when no balance is known. */
function accountLabel(account: Account): string {
  return account.lastBalance
    ? `${account.name} · $${formatAmount(account.lastBalance)}`
    : account.name;
}

/**
 * Root layout: skip-nav link, sticky header, and page outlet.
 *
 * The header row wraps and lets the account selector and sync meta shrink.
 * Without that the row forces horizontal page scroll below roughly 1150px.
 * Only the brand and the sync button hold their width.
 */
export function AppLayout() {
  const { selectedAccountId, setSelectedAccountId } = useContext(AccountContext);
  const { data: accounts = [] } = useBankAccounts();
  const { data: syncStatus } = useSyncStatus();
  const triggerSync = useTriggerSync();
  useAutoSync();
  const mainRef = useRef<HTMLElement>(null);

  const lastSync = syncStatus?.lastSync ?? null;
  const syncsToday = syncStatus?.syncsToday ?? 0;
  const dailyLimit = syncStatus?.dailyLimit ?? 24;
  const remaining = Math.max(0, dailyLimit - syncsToday);
  const isSyncing = triggerSync.isPending || lastSync?.status === 'running';
  const limitReached = remaining <= 0;

  const lastSynced = lastSync?.completedAt
    ? new Date(lastSync.completedAt).toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      {/* Skip navigation link — hidden until focused */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-bark focus:px-4 focus:py-2 focus:text-cream focus:shadow-lg"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-cream-mid bg-[rgba(250,247,242,0.92)] backdrop-blur-[12px]">
        <div className="mx-auto flex min-h-[64px] max-w-shell flex-wrap items-center gap-x-5 gap-y-3 px-6 py-2.5">
          <span className="shrink-0 font-display text-[19px] font-bold tracking-[-0.02em] text-bark-dark">
            Mazza Finance
          </span>

          <nav aria-label="Main navigation" className="flex flex-wrap gap-1">
            {NAV_ITEMS.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-label={label}
                className={({ isActive }) =>
                  `hit-target inline-flex items-center rounded-full px-[14px] py-[7px] text-sm transition-colors duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-sage ${
                    isActive
                      ? 'bg-sage-lighter font-semibold text-sage-deep'
                      : 'text-stone hover:bg-cream-mid'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/*
            The right-hand group carries the auto margin rather than a flex-1
            spacer: under flex-wrap a spacer occupies a slot of its own and
            pushes the sync button onto a second line at full width.
          */}
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {accounts.length > 0 && (
              <select
                aria-label="Select account"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="hit-target min-w-0 max-w-[240px] truncate rounded-full border border-cream-mid bg-white px-[14px] py-[7px] text-[13px] text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountLabel(a)}
                  </option>
                ))}
              </select>
            )}

            <span className="hidden min-w-0 truncate font-mono text-[11px] uppercase tracking-label text-warm-gray sm:inline">
              {lastSynced ? `Synced ${lastSynced} · ` : ''}
              {remaining}/{dailyLimit}
            </span>

            <button
              type="button"
              onClick={() => triggerSync.mutate()}
              disabled={isSyncing || limitReached}
              aria-label={
                limitReached
                  ? 'Daily sync limit reached'
                  : isSyncing
                    ? 'Syncing...'
                    : 'Sync now'
              }
              className="hit-target shrink-0 rounded-full bg-bark px-4 py-2 text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-bark-dark hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              {isSyncing ? 'Syncing...' : 'Sync'}
            </button>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        className="outline-none"
      >
        <Outlet />
      </main>
    </div>
  );
}
