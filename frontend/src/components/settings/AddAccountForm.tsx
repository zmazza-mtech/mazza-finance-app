import { useState } from 'react';
import { useCreateAccount } from '@/hooks/useAccounts';
import type { AccountType } from '@/api/types';

/**
 * Inline form to create a manual account (no bank connection required).
 * The account can be linked to SimpleFIN later via a sync.
 */
export function AddAccountForm() {
  const createAccount = useCreateAccount();

  const [institution, setInstitution] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('checking');
  const [open, setOpen] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!institution.trim() || !name.trim()) return;
    createAccount.mutate(
      { institution: institution.trim(), name: name.trim(), type },
      {
        onSuccess: () => {
          setInstitution('');
          setName('');
          setType('checking');
          setOpen(false);
        },
      },
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hit-target text-[13px] text-sage-dark underline decoration-sage-light underline-offset-2 transition-colors duration-150 hover:text-sage-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
      >
        + Add account manually
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-1">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="add-institution"
            className="mb-1 block text-[13px] font-medium text-charcoal"
          >
            Bank / Institution
          </label>
          <input
            id="add-institution"
            type="text"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
            placeholder="e.g. Chase"
            required
            className="hit-target block w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>
        <div>
          <label
            htmlFor="add-name"
            className="mb-1 block text-[13px] font-medium text-charcoal"
          >
            Account name
          </label>
          <input
            id="add-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Checking ****1234"
            required
            className="hit-target block w-full rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-sm text-charcoal placeholder:text-warm-gray focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="add-type"
          className="mb-1 block text-[13px] font-medium text-charcoal"
        >
          Account type
        </label>
        <select
          id="add-type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className="hit-target block w-full max-w-xs rounded-md border border-cream-mid bg-cream px-3.5 py-[11px] text-sm text-charcoal focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="credit">Credit card</option>
        </select>
      </div>

      {createAccount.isError && (
        <p className="text-sm text-error" role="alert">
          Failed to create account — please try again.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={createAccount.isPending || !institution.trim() || !name.trim()}
          className="hit-target rounded-full bg-copper-dark px-[18px] py-[11px] text-sm font-semibold text-cream transition-all duration-150 ease-out hover:-translate-y-px hover:bg-copper-deep hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sage disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {createAccount.isPending ? 'Adding…' : 'Add account'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="hit-target rounded-full border border-cream-mid bg-surface px-[18px] py-[11px] text-sm text-stone transition-colors duration-150 hover:border-sage-light hover:text-bark focus:outline-none focus-visible:ring-2 focus-visible:ring-sage"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
