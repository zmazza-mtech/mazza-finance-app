import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScanResultMessage } from '@/components/recurring/ScanResultMessage';

describe('ScanResultMessage', () => {
  it('renders nothing before a scan has run', () => {
    const { container } = render(
      <ScanResultMessage status="idle" detected={0} expired={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('reports newly detected patterns in sage', () => {
    render(<ScanResultMessage status="success" detected={3} expired={0} />);
    const message = screen.getByText('Found 3 new patterns.');
    expect(message).toHaveClass('text-sage-dark');
  });

  it('singularizes a lone pattern', () => {
    render(<ScanResultMessage status="success" detected={1} expired={0} />);
    expect(screen.getByText('Found 1 new pattern.')).toBeInTheDocument();
  });

  it('reports expired series alongside detected ones', () => {
    render(<ScanResultMessage status="success" detected={2} expired={1} />);
    expect(
      screen.getByText('Found 2 new patterns. Ended 1 stale series.'),
    ).toBeInTheDocument();
  });

  it('reports expired series on their own', () => {
    render(<ScanResultMessage status="success" detected={0} expired={4} />);
    expect(screen.getByText('Ended 4 stale series.')).toBeInTheDocument();
  });

  it('renders an empty result in stone', () => {
    render(<ScanResultMessage status="none" detected={0} expired={0} />);
    expect(screen.getByText('No new patterns detected.')).toHaveClass('text-stone');
  });

  it('renders a failure in the error color and announces it', () => {
    render(<ScanResultMessage status="error" detected={0} expired={0} />);
    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('Scan failed — try again.');
    expect(message).toHaveClass('text-error');
  });
});
