import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { ThresholdSettings } from '@/components/settings/ThresholdSettings';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { ConnectBankButton } from '@/components/settings/ConnectBankButton';
import { SyncStatus } from '@/components/settings/SyncStatus';
import { CsvImportSection } from '@/components/settings/CsvImportSection';
import { AddAccountForm } from '@/components/settings/AddAccountForm';
import { useSettings, useUpdateSetting, SETTING_KEYS } from '@/hooks/useSettings';
import { useAccounts, useUpdateAccount } from '@/hooks/useAccounts';
import { useSyncStatus, useTriggerSync } from '@/hooks/useSync';

/**
 * Settings page — theme, thresholds, account toggles, sync controls.
 */
export function SettingsPage() {
  const { settingsMap, isLoading: settingsLoading } = useSettings();
  const updateSetting = useUpdateSetting();

  const { data: accounts = [], isLoading: accountsLoading } = useAccounts();
  const updateAccount = useUpdateAccount();

  const { data: syncLog } = useSyncStatus();
  const triggerSync = useTriggerSync();

  const greenThreshold = settingsMap[SETTING_KEYS.GREEN_THRESHOLD] ?? '1000';
  const yellowThreshold = settingsMap[SETTING_KEYS.YELLOW_THRESHOLD] ?? '200';

  function handleSaveThresholds(green: string, yellow: string) {
    updateSetting.mutate({ key: SETTING_KEYS.GREEN_THRESHOLD, value: green });
    updateSetting.mutate({ key: SETTING_KEYS.YELLOW_THRESHOLD, value: yellow });
  }

  function handleToggleAccount(id: string, include: boolean) {
    updateAccount.mutate({ id, body: { includeInView: include } });
  }

  if (settingsLoading || accountsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div
          className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"
          role="status"
          aria-label="Loading settings"
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
        Settings
      </h1>

      {/* Theme */}
      <section aria-labelledby="theme-section">
        <h2
          id="theme-section"
          className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4"
        >
          Appearance
        </h2>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <ThemeToggle />
        </div>
      </section>

      {/* Sync */}
      <section aria-labelledby="sync-section">
        <h2
          id="sync-section"
          className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4"
        >
          Bank Sync
        </h2>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <SyncStatus
            syncLog={syncLog ?? null}
            isSyncing={triggerSync.isPending}
            onSync={() => triggerSync.mutate()}
          />
        </div>
      </section>

      {/* Balance thresholds */}
      <section aria-labelledby="threshold-section">
        <h2
          id="threshold-section"
          className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4"
        >
          Balance Health
        </h2>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <ThresholdSettings
            greenThreshold={greenThreshold}
            yellowThreshold={yellowThreshold}
            onSave={handleSaveThresholds}
            isSaving={updateSetting.isPending}
          />
        </div>
      </section>

      {/* CSV Import */}
      <section aria-labelledby="import-section">
        <h2
          id="import-section"
          className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4"
        >
          Import Transactions
        </h2>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <CsvImportSection />
        </div>
      </section>

      {/* Accounts */}
      <section aria-labelledby="accounts-section">
        <h2
          id="accounts-section"
          className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4"
        >
          Accounts
        </h2>
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
          <div className="p-4">
            <AccountSettings
              accounts={accounts}
              onToggleInclude={handleToggleAccount}
            />
          </div>
          <div className="p-4 space-y-3">
            <AddAccountForm />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Or connect via Teller:
            </p>
            <ConnectBankButton />
          </div>
        </div>
      </section>
    </div>
  );
}
