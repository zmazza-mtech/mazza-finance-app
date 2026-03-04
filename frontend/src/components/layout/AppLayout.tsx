import { useContext, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { useBankAccounts } from '@/hooks/useAccounts';
import { useSyncStatus, useTriggerSync, useAutoSync } from '@/hooks/useSync';
import { AccountContext } from '@/App';

/**
 * Root layout: skip-nav link, nav header, and page outlet.
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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Skip navigation link — hidden until focused */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* Nav header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="max-w-screen-lg mx-auto px-4 h-14 flex items-center gap-4">
          {/* Brand */}
          <span className="font-bold text-blue-600 dark:text-blue-400 shrink-0">
            Mazza Finance
          </span>

          {/* Nav links */}
          <nav aria-label="Main navigation" className="flex gap-1">
            <NavLink
              to="/"
              end
              aria-label="Calendar"
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              Calendar
            </NavLink>
            <NavLink
              to="/transactions"
              aria-label="Transactions"
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              Transactions
            </NavLink>
            <NavLink
              to="/recurring"
              aria-label="Recurring"
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              Recurring
            </NavLink>
            <NavLink
              to="/reports"
              aria-label="Reports"
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              Reports
            </NavLink>
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) =>
                `px-3 py-1.5 text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              Settings
            </NavLink>
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Account selector */}
          {accounts.length > 0 && (
            <select
              aria-label="Select account"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="max-h-[44px] px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.institution} — {a.name}
                </option>
              ))}
            </select>
          )}

          {/* Last synced + remaining count */}
          <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500 shrink-0">
            {lastSynced ? `Synced ${lastSynced}` : ''}{' '}
            ({remaining}/{dailyLimit})
          </span>

          {/* Sync Now button */}
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
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {isSyncing ? 'Syncing...' : 'Sync'}
          </button>

          {/* Theme toggle (compact) */}
          <ThemeToggle compact />
        </div>
      </header>

      {/* Page content */}
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
