import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider, useToast } from '@/components/shared/Toast';

/**
 * A minimal consumer. The provider is the unit under test; this exists only to
 * reach `useToast` from inside it, the way a real page does.
 */
function Trigger({ message = 'Could not add transaction' }: { message?: string }) {
  const { showToast } = useToast();
  return (
    <button type="button" onClick={() => showToast(message)}>
      Fail something
    </button>
  );
}

function renderToasts(ui = <Trigger />) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

afterEach(() => {
  vi.useRealTimers();
});

describe('ToastProvider', () => {
  it('renders no alert until something is announced', () => {
    renderToasts();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the message it was given', async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole('button', { name: 'Fail something' }));

    expect(screen.getByText('Could not add transaction')).toBeInTheDocument();
  });

  it('puts the message in a live region, so a rollback is announced and not only drawn', async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole('button', { name: 'Fail something' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not add transaction');
  });

  it('lets the user dismiss it', async () => {
    const user = userEvent.setup();
    renderToasts();

    await user.click(screen.getByRole('button', { name: 'Fail something' }));
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears itself after the timeout, so a stale failure does not sit on screen', () => {
    vi.useFakeTimers();
    renderToasts();

    // fireEvent rather than userEvent: userEvent's own waiting does not
    // cooperate with fake timers, and the timeout is the whole point here.
    fireEvent.click(screen.getByRole('button', { name: 'Fail something' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(8000);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows several failures rather than replacing one with the next', async () => {
    const user = userEvent.setup();

    function TwoTriggers() {
      const { showToast } = useToast();
      return (
        <>
          <button type="button" onClick={() => showToast('First failure')}>
            First
          </button>
          <button type="button" onClick={() => showToast('Second failure')}>
            Second
          </button>
        </>
      );
    }

    renderToasts(<TwoTriggers />);

    await user.click(screen.getByRole('button', { name: 'First' }));
    await user.click(screen.getByRole('button', { name: 'Second' }));

    expect(screen.getByText('First failure')).toBeInTheDocument();
    expect(screen.getByText('Second failure')).toBeInTheDocument();
  });

  it('throws a useful error when used outside the provider', () => {
    // Silence React's error boundary logging for this expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<Trigger />)).toThrow(/ToastProvider/);

    spy.mockRestore();
  });
});
