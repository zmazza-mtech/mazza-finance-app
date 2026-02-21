import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSetting } from '@/api/client';

export const SETTINGS_KEY = ['settings'] as const;

// Known settings keys
export const SETTING_KEYS = {
  GREEN_THRESHOLD: 'balance_threshold_green',
  YELLOW_THRESHOLD: 'balance_threshold_yellow',
  THEME: 'theme',
  LAST_SYNC_AT: 'last_sync_at',
} as const;

/**
 * Fetches all settings and exposes them as a key→value map.
 */
export function useSettings() {
  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getSettings,
    staleTime: 5 * 60 * 1000,
  });

  const settingsMap: Record<string, string> = {};
  for (const setting of query.data ?? []) {
    settingsMap[setting.key] = setting.value;
  }

  return { ...query, settingsMap };
}

/**
 * Helper to get specific threshold values from settings.
 * Falls back to defaults if not configured.
 */
export function useThresholds() {
  const { settingsMap, isLoading } = useSettings();
  return {
    isLoading,
    greenThreshold: settingsMap[SETTING_KEYS.GREEN_THRESHOLD] ?? '1000',
    yellowThreshold: settingsMap[SETTING_KEYS.YELLOW_THRESHOLD] ?? '200',
  };
}

/**
 * Mutation to update a single setting value.
 */
export function useUpdateSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      updateSetting(key, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}
