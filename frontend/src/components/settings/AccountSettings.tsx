import type { Account } from '@/api/types';

interface AccountSettingsProps {
  accounts: Account[];
  onToggleInclude: (id: string, include: boolean) => void;
}

/**
 * Toggle whether each account is included in the forecast view.
 */
export function AccountSettings({ accounts, onToggleInclude }: AccountSettingsProps) {
  if (accounts.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No accounts connected. Sync to import accounts.
      </p>
    );
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
        Accounts in forecast view
      </legend>
      <ul className="space-y-3">
        {accounts.map((account) => (
          <li key={account.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {account.institution} — {account.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                {account.type}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={account.includeInView}
                onChange={(e) => onToggleInclude(account.id, e.target.checked)}
                aria-label={`Include ${account.institution} ${account.name} in forecast`}
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600" />
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
