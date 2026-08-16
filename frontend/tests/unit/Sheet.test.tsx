import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sheet } from '@/components/shared/Sheet';

/**
 * A trigger plus a sheet, wired the way real callers wire them. Focus restore
 * only means anything if there is a real element that held focus first.
 */
function Harness({
  withInitialFocus = false,
  onClose,
}: {
  withInitialFocus?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const secondRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    onClose?.();
  }

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <Sheet
        isOpen={open}
        onClose={close}
        labelledBy="sheet-title"
        initialFocusRef={withInitialFocus ? secondRef : undefined}
      >
        <h2 id="sheet-title">Sheet title</h2>
        <button type="button">First</button>
        <button type="button" ref={secondRef}>
          Second
        </button>
        <button type="button" onClick={close}>
          Done
        </button>
      </Sheet>
    </div>
  );
}

describe('Sheet', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders nothing while closed', () => {
    render(<Harness />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is a modal dialog named by its title', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Open' }));

    const dialog = screen.getByRole('dialog', { name: 'Sheet title' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  describe('closing', () => {
    it('closes on Escape', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Open' }));

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes on a backdrop click', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Open' }));

      await user.click(screen.getByTestId('sheet-backdrop'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not close when the panel itself is clicked', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Open' }));

      await user.click(screen.getByRole('heading', { name: 'Sheet title' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('focus', () => {
    it('moves focus into the sheet on open', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Open' }));

      expect(screen.getByRole('dialog')).toContainElement(
        document.activeElement as HTMLElement,
      );
      expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    });

    it('honours initialFocusRef over the first focusable', async () => {
      const user = userEvent.setup();
      render(<Harness withInitialFocus />);
      await user.click(screen.getByRole('button', { name: 'Open' }));

      expect(screen.getByRole('button', { name: 'Second' })).toHaveFocus();
    });

    it('traps Tab at the end of the sheet', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Open' }));

      await user.tab(); // First -> Second
      await user.tab(); // Second -> Done
      expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();

      await user.tab(); // wraps, rather than escaping to the Open button
      expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    });

    it('traps Shift+Tab at the start of the sheet', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();

      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    });

    it('restores focus to whatever opened it', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Open' });

      await user.click(trigger);
      await user.keyboard('{Escape}');

      // Without this the reader is dropped at the top of the document and has
      // to find their place again.
      expect(trigger).toHaveFocus();
    });

    it('restores focus after closing from inside the sheet', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Open' });

      await user.click(trigger);
      await user.click(screen.getByRole('button', { name: 'Done' }));

      expect(trigger).toHaveFocus();
    });
  });

  describe('body scroll lock', () => {
    it('locks the body while open and restores it on close', async () => {
      const user = userEvent.setup();
      render(<Harness />);

      expect(document.body.style.overflow).toBe('');

      await user.click(screen.getByRole('button', { name: 'Open' }));
      expect(document.body.style.overflow).toBe('hidden');

      await user.keyboard('{Escape}');
      expect(document.body.style.overflow).toBe('');
    });

    it('restores the body after two sheets open in sequence', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const trigger = screen.getByRole('button', { name: 'Open' });

      await user.click(trigger);
      await user.keyboard('{Escape}');
      await user.click(trigger);
      expect(document.body.style.overflow).toBe('hidden');

      await user.keyboard('{Escape}');
      expect(document.body.style.overflow).toBe('');
    });

    it('keeps the body locked while a nested sheet is open', () => {
      function Nested() {
        return (
          <Sheet isOpen onClose={vi.fn()} label="Outer">
            <button type="button">outer</button>
            <Sheet isOpen onClose={vi.fn()} label="Inner">
              <button type="button">inner</button>
            </Sheet>
          </Sheet>
        );
      }
      const { rerender } = render(<Nested />);
      expect(document.body.style.overflow).toBe('hidden');

      // Closing only the inner sheet must not unlock the body underneath the
      // outer one — a naive set/clear pair does exactly that.
      rerender(
        <Sheet isOpen onClose={vi.fn()} label="Outer">
          <button type="button">outer</button>
        </Sheet>,
      );
      expect(document.body.style.overflow).toBe('hidden');
    });
  });

  it('accepts a plain string label when there is no visible title', () => {
    render(
      <Sheet isOpen onClose={vi.fn()} label="Day detail">
        <button type="button">ok</button>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Day detail' })).toBeInTheDocument();
  });
});
