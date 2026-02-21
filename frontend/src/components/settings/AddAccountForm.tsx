import { useState } from 'react';
import { useCreateAccount } from '@/hooks/useAccounts';
import type { AccountType } from '@/api/types';

/**
 * Inline form to create a manual account (no bank connection required).
 * The account can be linked to SimpleFin/Teller later via a future sync.
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
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
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
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
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
            className="block w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 py-1.5 px-2"
          />
        </div>
        <div>
          <label
            htmlFor="add-name"
            className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
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
            className="block w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 py-1.5 px-2"
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="add-type"
          className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
        >
          Account type
        </label>
        <select
          id="add-type"
          value={type}
          onChange={(e) => setType(e.target.value as AccountType)}
          className="block w-full max-w-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 py-1.5 px-2"
        >
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
          <option value="credit">Credit card</option>
        </select>
      </div>

      {createAccount.isError && (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          Failed to create account — please try again.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={createAccount.isPending || !institution.trim() || !name.trim()}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {createAccount.isPending ? 'Adding…' : 'Add account'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
