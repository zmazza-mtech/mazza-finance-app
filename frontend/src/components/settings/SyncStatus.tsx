import type { SyncLog } from '@/api/types';

interface SyncStatusProps {
  syncLog: SyncLog | null;
  isSyncing: boolean;
  onSync: () => void;
}

/**
 * Displays last sync status and a "Sync Now" button.
 */
export function SyncStatus({ syncLog, isSyncing, onSync }: SyncStatusProps) {
  const isRunning = syncLog?.status === 'running' || isSyncing;

  let statusText = 'Never synced';
  let statusClass = 'text-gray-500 dark:text-gray-400';

  if (syncLog) {
    if (syncLog.status === 'running') {
      statusText = 'Sync in progress...';
      statusClass = 'text-blue-600 dark:text-blue-400';
    } else if (syncLog.status === 'success' && syncLog.completedAt) {
      statusText = `Last synced: ${formatRelative(syncLog.completedAt)}`;
      statusClass = 'text-green-700 dark:text-green-400';
    } else if (syncLog.status === 'error') {
      statusText = `Sync failed${syncLog.message ? `: ${syncLog.message}` : ''}`;
      statusClass = 'text-red-700 dark:text-red-400';
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Bank sync
        </p>
        <p className={`text-sm ${statusClass}`}>{statusText}</p>
      </div>
      <button
        type="button"
        onClick={onSync}
        disabled={isRunning}
        aria-label={isRunning ? 'Sync in progress' : 'Sync now'}
        className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {isRunning ? 'Syncing...' : 'Sync Now'}
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
