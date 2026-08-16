import { useState } from 'react';
import { PillToggle } from '@/components/shared/PillToggle';
import { formatCurrency } from '@/lib/balance';
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
      <p className="text-sm text-stone">
        No accounts connected. Sync to import accounts.
      </p>
    );
  }

  return (
    <>
      <p className="mb-2 text-sm text-stone">
        Only the accounts switched on here feed the running balance.
      </p>
      <ul>
        {accounts.map((account) => (
          <AccountRow
            key={account.id}
            account={account}
            onToggleInclude={onToggleInclude}
          />
        ))}
      </ul>
    </>
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

  const balanceLabel =
    account.lastBalance != null ? formatCurrency(account.lastBalance) : 'NOT SET';

  return (
    <li className="border-b border-cream-mid py-3.5 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[15px] text-charcoal">
            {account.institution} — {account.name}
          </p>
          <p className="label-mono mt-0.5">
            {account.type.toUpperCase()} · BALANCE {balanceLabel}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="hit-target text-[13px] text-sage-dark underline decoration-sage-light underline-offset-2 transition-colors duration-150 hover:text-sage-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
            >
              Edit balance
            </button>
          )}
          <PillToggle
            checked={account.includeInView}
            onChange={(next) => onToggleInclude(account.id, next)}
            label={`Include ${account.institution} ${account.name} in forecast`}
          />
        </div>
      </div>

      {editing && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label="Current balance"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0.00"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            className="w-32 rounded-md border border-cream-mid bg-cream px-3 py-1.5 font-mono text-[13px] text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={updateAccount.isPending}
            className="hit-target rounded-full bg-sage-dark px-3.5 py-1.5 text-[13px] font-semibold text-cream transition-colors duration-150 hover:bg-sage-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:opacity-50"
          >
            {updateAccount.isPending ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="hit-target rounded-full border border-cream-mid bg-surface px-3.5 py-1.5 text-[13px] text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          >
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
