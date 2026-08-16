import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SyncStatus } from '@/components/settings/SyncStatus';
import type { SyncLog, SyncStatusResponse } from '@/api/types';

function log(overrides: Partial<SyncLog> = {}): SyncLog {
  return {
    id: 'log-1',
    startedAt: '2026-08-16T11:14:00.000Z',
    completedAt: null,
    status: 'running',
    message: null,
    ...overrides,
  };
}

function status(overrides: Partial<SyncStatusResponse> = {}): SyncStatusResponse {
  return {
    lastSync: null,
    syncsToday: 3,
    dailyLimit: 24,
    ...overrides,
  };
}

const baseProps = { isSyncing: false, onSync: vi.fn() };

describe('SyncStatus — status line', () => {
  it('says so when there has never been a sync', () => {
    render(<SyncStatus {...baseProps} syncStatus={status()} />);
    expect(screen.getByText('Never synced')).toHaveClass('text-stone');
  });

  it('reports a successful sync in sage', () => {
    render(
      <SyncStatus
        {...baseProps}
        syncStatus={status({
          lastSync: log({ status: 'success', completedAt: new Date().toISOString() }),
        })}
      />,
    );
    expect(screen.getByText(/^Last synced:/)).toHaveClass('text-sage-dark');
  });

  it('reports a running sync in sage', () => {
    render(
      <SyncStatus {...baseProps} syncStatus={status({ lastSync: log() })} />,
    );
    expect(screen.getByText('Sync in progress...')).toHaveClass('text-sage');
  });

  it('reports a failure in the error color, with the reason', () => {
    render(
      <SyncStatus
        {...baseProps}
        syncStatus={status({
          lastSync: log({ status: 'error', message: 'token rejected' }),
        })}
      />,
    );
    expect(screen.getByText('Sync failed: token rejected')).toHaveClass('text-error');
  });
});

describe('SyncStatus — daily limit', () => {
  it('counts the syncs left today', () => {
    render(<SyncStatus {...baseProps} syncStatus={status({ syncsToday: 3 })} />);
    expect(screen.getByText('21 of 24 syncs remaining today')).toBeInTheDocument();
  });

  it('never counts below zero', () => {
    render(<SyncStatus {...baseProps} syncStatus={status({ syncsToday: 30 })} />);
    expect(screen.getByText('0 of 24 syncs remaining today')).toBeInTheDocument();
  });

  it('disables the button at the limit', () => {
    render(<SyncStatus {...baseProps} syncStatus={status({ syncsToday: 24 })} />);
    const button = screen.getByRole('button', { name: 'Daily sync limit reached' });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent('Limit reached');
  });

  it('disables the button while a sync runs', () => {
    render(<SyncStatus {...baseProps} isSyncing syncStatus={status()} />);
    expect(screen.getByRole('button', { name: 'Sync in progress' })).toBeDisabled();
  });

  it('triggers a sync when there is headroom', async () => {
    const onSync = vi.fn();
    const user = userEvent.setup();
    render(<SyncStatus {...baseProps} onSync={onSync} syncStatus={status()} />);

    await user.click(screen.getByRole('button', { name: 'Sync now' }));
    expect(onSync).toHaveBeenCalled();
  });
});
