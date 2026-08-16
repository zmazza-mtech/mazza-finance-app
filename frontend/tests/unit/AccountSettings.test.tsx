import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AccountSettings } from '@/components/settings/AccountSettings';
import type { Account } from '@/api/types';

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: 'acct-1',
    institution: 'Ally',
    name: 'Joint Checking',
    type: 'checking',
    lastBalance: '3142.00',
    includeInView: true,
    ...overrides,
  } as Account;
}

/**
 * The row's save path is a mutation, so nothing fetches on render — the
 * provider is here only to satisfy the hook.
 */
function renderAccounts(accounts: Account[], onToggleInclude = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AccountSettings accounts={accounts} onToggleInclude={onToggleInclude} />
    </QueryClientProvider>,
  );
}

describe('AccountSettings', () => {
  it('says so when no accounts are connected', () => {
    renderAccounts([]);
    expect(
      screen.getByText('No accounts connected. Sync to import accounts.'),
    ).toBeInTheDocument();
  });

  it('names each account and states its type and balance', () => {
    renderAccounts([account()]);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Ally — Joint Checking')).toBeInTheDocument();
    expect(within(row).getByText('CHECKING · BALANCE $3,142.00')).toBeInTheDocument();
  });

  it('says when a balance has not been set', () => {
    renderAccounts([account({ lastBalance: null })]);
    expect(screen.getByText('CHECKING · BALANCE NOT SET')).toBeInTheDocument();
  });

  it('toggles the account in and out of the forecast', async () => {
    const onToggleInclude = vi.fn();
    const user = userEvent.setup();
    renderAccounts([account()], onToggleInclude);

    await user.click(
      screen.getByRole('switch', {
        name: 'Include Ally Joint Checking in forecast',
      }),
    );
    expect(onToggleInclude).toHaveBeenCalledWith('acct-1', false);
  });

  it('reflects an excluded account in the switch state', () => {
    renderAccounts([account({ includeInView: false })]);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('opens the inline balance editor', async () => {
    const user = userEvent.setup();
    renderAccounts([account()]);

    await user.click(screen.getByRole('button', { name: 'Edit balance' }));
    expect(screen.getByLabelText('Current balance')).toHaveValue('3142.00');
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('closes the editor on cancel', async () => {
    const user = userEvent.setup();
    renderAccounts([account()]);

    await user.click(screen.getByRole('button', { name: 'Edit balance' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Current balance')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit balance' })).toBeInTheDocument();
  });

  it('closes the editor on Escape', async () => {
    const user = userEvent.setup();
    renderAccounts([account()]);

    await user.click(screen.getByRole('button', { name: 'Edit balance' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Current balance')).not.toBeInTheDocument();
  });
});
