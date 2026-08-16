import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExportControls } from '@/components/reports/ExportControls';

const RANGE = { accountId: 'acct-1', startDate: '2026-08-01', endDate: '2026-08-31' };

describe('ExportControls', () => {
  it('offers the transactions as a download', () => {
    render(<ExportControls {...RANGE} />);
    const link = screen.getByRole('link', { name: /transactions/i });
    expect(link).toHaveAttribute('download');
  });

  it('offers the category summary as a download', () => {
    render(<ExportControls {...RANGE} />);
    expect(screen.getByRole('link', { name: /category summary/i })).toHaveAttribute('download');
  });

  it('exports the range on screen, not some other one', () => {
    render(<ExportControls {...RANGE} />);
    const href = screen.getByRole('link', { name: /transactions/i }).getAttribute('href')!;

    expect(href).toContain('accountId=acct-1');
    expect(href).toContain('startDate=2026-08-01');
    expect(href).toContain('endDate=2026-08-31');
  });

  it('points each link at its own endpoint', () => {
    render(<ExportControls {...RANGE} />);

    expect(screen.getByRole('link', { name: /transactions/i }).getAttribute('href')).toContain(
      '/reports/transactions.csv',
    );
    expect(screen.getByRole('link', { name: /category summary/i }).getAttribute('href')).toContain(
      '/reports/category-summary.csv',
    );
  });

  it('offers nothing to export without an account to export from', () => {
    const { container } = render(<ExportControls {...RANGE} accountId="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('escapes a range into the query rather than pasting it in raw', () => {
    render(<ExportControls {...RANGE} accountId="a b" />);
    const href = screen.getByRole('link', { name: /transactions/i }).getAttribute('href')!;

    expect(href).toContain('accountId=a+b');
  });
});
