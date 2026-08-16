import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/settings/ThemeToggle';
import { ThresholdSettings } from '@/components/settings/ThresholdSettings';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { SyncStatus } from '@/components/settings/SyncStatus';
import { CsvImportSection } from '@/components/settings/CsvImportSection';
import { AddAccountForm } from '@/components/settings/AddAccountForm';
import { UncategorizedReview } from '@/components/settings/UncategorizedReview';
import { useSettings, useUpdateSetting, SETTING_KEYS } from '@/hooks/useSettings';
import { useAccounts, useUpdateAccount } from '@/hooks/useAccounts';
import { useSyncStatus, useTriggerSync } from '@/hooks/useSync';
import { useUncategorized, useAssignUncategorized } from '@/hooks/useReports';

/**
 * Settings page — sync, thresholds, accounts, imports and appearance.
 */
export function SettingsPage() {
  const { settingsMap, isLoading: settingsLoading } = useSettings();
  const updateSetting = useUpdateSetting();

  const { data: accounts = [], isLoading: accountsLoading } = useAccounts();
  const updateAccount = useUpdateAccount();

  const { data: syncStatus } = useSyncStatus();
  const triggerSync = useTriggerSync();

  const { data: uncategorized } = useUncategorized();
  const assignUncategorized = useAssignUncategorized();

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
      <div className="flex h-64 items-center justify-center">
        <div className="spinner-sage" role="status" aria-label="Loading settings" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <h1 className="font-display text-4xl text-bark-dark">Settings</h1>
      <p className="mt-1 text-[15px] text-stone">
        Sync, thresholds, accounts and imports.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        {/*
          Renders itself, or nothing at all when there is nothing to review —
          so it is not wrapped in a SettingsCard, which would leave an empty
          bordered box on a fully categorized ledger.
        */}
        <UncategorizedReview
          groups={uncategorized?.groups ?? []}
          total={uncategorized?.total ?? '0.00'}
          onAssign={(description, category) =>
            assignUncategorized.mutate({ description, category })
          }
          isAssigning={assignUncategorized.isPending}
        />

        <SettingsCard id="sync" title="Bank sync">
          <SyncStatus
            syncStatus={syncStatus ?? null}
            isSyncing={triggerSync.isPending}
            onSync={() => triggerSync.mutate()}
          />
        </SettingsCard>

        <SettingsCard id="thresholds" title="Balance health">
          <ThresholdSettings
            greenThreshold={greenThreshold}
            yellowThreshold={yellowThreshold}
            onSave={handleSaveThresholds}
            isSaving={updateSetting.isPending}
          />
        </SettingsCard>

        <SettingsCard id="accounts" title="Accounts in the forecast">
          <AccountSettings accounts={accounts} onToggleInclude={handleToggleAccount} />
          <div className="mt-4">
            <AddAccountForm />
          </div>
        </SettingsCard>

        <SettingsCard id="import" title="Import transactions">
          <CsvImportSection />
        </SettingsCard>

        <SettingsCard id="appearance" title="Appearance">
          <ThemeToggle />
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  const headingId = `${id}-title`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-lg border border-cream-mid bg-surface p-[22px]"
    >
      <h2 id={headingId} className="mb-3 font-display text-xl text-bark-dark">
        {title}
      </h2>
      {children}
    </section>
  );
}
