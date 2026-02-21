import { useState } from 'react';
import type { Account } from '@/api/types';
import { useUpdateAccount } from '@/hooks/useAccounts';

interface AccountSettingsProps {
  accounts: Account[];
  onToggleInclude: (id: string, include: boolean) => void;
}

/**
 * Toggle whether each account is included in the forecast view,
 * and set the current balance used as the forecast seed.
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
      <ul className="space-y-4">
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            onToggleInclude={onToggleInclude}
          />
        ))}
      </ul>
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// AccountRow — toggle + inline balance editor
// ---------------------------------------------------------------------------

interface AccountRowProps {
  account: Account;
  onToggleInclude: (id: string, include: boolean) => void;
}

function AccountRow({ account, onToggleInclude }: AccountRowProps) {
  const updateAccount = useUpdateAccount();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEditing() {
    setDraft(account.lastBalance ?? '');
    setEditing(true);
  }

  function handleSave() {
    const trimmed = draft.trim();
    if (trimmed !== '' && !/^-?\d+(\.\d{1,2})?$/.test(trimmed)) return;
    updateAccount.mutate(
      { id: account.id, body: { lastBalance: trimmed || undefined } },
      { onSuccess: () => setEditing(false) },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') setEditing(false);
  }

  const displayBalance =
    account.lastBalance != null
      ? `$${parseFloat(account.lastBalance).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null;

  return (
    <li className="space-y-1.5">
      <div className="flex items-center justify-between">
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
      </div>

      {/* Inline balance editor */}
      <div className="flex items-center gap-2 pl-0.5">
        {editing ? (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-400">Current balance: $</span>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="0.00"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="w-28 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 py-0.5 px-1.5"
            />
            <button
              onClick={handleSave}
              disabled={updateAccount.isPending}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              {updateAccount.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Current balance:{' '}
              <span className={displayBalance ? 'text-gray-700 dark:text-gray-300 font-medium' : 'italic'}>
                {displayBalance ?? 'not set'}
              </span>
            </span>
            <button
              onClick={startEditing}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </li>
  );
}
