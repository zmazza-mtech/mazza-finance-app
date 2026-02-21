import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SourceBadge } from '@/components/shared/SourceBadge';

describe('SourceBadge', () => {
  it('renders "Actual" label for actual source', () => {
    render(<SourceBadge source="actual" />);
    expect(screen.getByText('Actual')).toBeInTheDocument();
  });

  it('renders "Forecasted" label for forecast source', () => {
    render(<SourceBadge source="forecast" />);
    expect(screen.getByText('Forecasted')).toBeInTheDocument();
  });

  it('renders "Manual" label for manual source', () => {
    render(<SourceBadge source="manual" />);
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('has a role of "status" or is visually distinct (has aria-label)', () => {
    render(<SourceBadge source="actual" />);
    const badge = screen.getByText('Actual').closest('[aria-label]');
    expect(badge).not.toBeNull();
  });

  it('aria-label includes the source type for actual', () => {
    render(<SourceBadge source="actual" />);
    expect(screen.getByLabelText('Transaction source: actual')).toBeInTheDocument();
  });

  it('aria-label includes the source type for forecast', () => {
    render(<SourceBadge source="forecast" />);
    expect(screen.getByLabelText('Transaction source: forecast')).toBeInTheDocument();
  });

  it('aria-label includes the source type for manual', () => {
    render(<SourceBadge source="manual" />);
    expect(screen.getByLabelText('Transaction source: manual')).toBeInTheDocument();
  });
});
