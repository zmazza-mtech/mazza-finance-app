import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSyncStatus, triggerSync } from '@/api/client';

export const SYNC_STATUS_KEY = ['sync-status'] as const;

/**
 * Polls sync status every 10 seconds while a sync is in progress.
 * Returns the full status response (lastSync, syncsToday, dailyLimit).
 */
export function useSyncStatus() {
  return useQuery({
    queryKey: SYNC_STATUS_KEY,
    queryFn: getSyncStatus,
    staleTime: 10 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll more frequently while sync is running
      if (data?.lastSync?.status === 'running') return 3000;
      return 30 * 1000;
    },
  });
}

/**
 * Triggers a bank sync and invalidates all queries on completion.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triggerSync,
    onSuccess: () => {
      // Invalidate everything — sync may have changed accounts, transactions, forecast
      void queryClient.invalidateQueries();
    },
  });
}

/**
 * Auto-triggers a sync on the first page load of the day.
 * Fires once when syncsToday === 0 and no sync is currently running.
 */
export function useAutoSync() {
  const { data: status } = useSyncStatus();
  const trigger = useTriggerSync();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (!status) return;
    if (status.syncsToday > 0) return;
    if (status.lastSync?.status === 'running') return;
    if (trigger.isPending) return;

    firedRef.current = true;
    trigger.mutate();
  }, [status, trigger]);
}
