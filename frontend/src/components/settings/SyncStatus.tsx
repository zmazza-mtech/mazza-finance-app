import type { SyncStatusResponse } from '@/api/types';

interface SyncStatusProps {
  syncStatus: SyncStatusResponse | null;
  isSyncing: boolean;
  onSync: () => void;
}

/**
 * Displays last sync status, remaining daily syncs, and a "Sync now" button.
 */
export function SyncStatus({ syncStatus, isSyncing, onSync }: SyncStatusProps) {
  const syncLog = syncStatus?.lastSync ?? null;
  const syncsToday = syncStatus?.syncsToday ?? 0;
  const dailyLimit = syncStatus?.dailyLimit ?? 24;
  const remaining = Math.max(0, dailyLimit - syncsToday);

  const isRunning = syncLog?.status === 'running' || isSyncing;
  const limitReached = remaining <= 0;

  let statusText = 'Never synced';
  let statusClass = 'text-stone';

  if (syncLog) {
    if (syncLog.status === 'running') {
      statusText = 'Sync in progress...';
      statusClass = 'text-sage';
    } else if (syncLog.status === 'success' && syncLog.completedAt) {
      statusText = `Last synced: ${formatRelative(syncLog.completedAt)}`;
      statusClass = 'text-sage-dark';
    } else if (syncLog.status === 'error') {
      statusText = `Sync failed${syncLog.message ? `: ${syncLog.message}` : ''}`;
      statusClass = 'text-error';
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className={`text-sm ${statusClass}`}>{statusText}</p>
        <p className="label-mono mt-1">
          {remaining} of {dailyLimit} syncs remaining today
        </p>
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={isRunning || limitReached}
        aria-label={
          limitReached
            ? 'Daily sync limit reached'
            : isRunning
              ? 'Sync in progress'
              : 'Sync now'
        }
        className="hit-target rounded-full bg-bark px-[18px] py-[11px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-bark-dark hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"
      >
        {isRunning ? 'Syncing…' : limitReached ? 'Limit reached' : 'Sync now'}
      </button>
    </div>
  );
}

function formatRelative(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}
