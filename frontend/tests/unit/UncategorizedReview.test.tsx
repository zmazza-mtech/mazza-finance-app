import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UncategorizedReview } from '@/components/settings/UncategorizedReview';
import type { UncategorizedGroup } from '@/api/types';

function group(overrides: Partial<UncategorizedGroup> = {}): UncategorizedGroup {
  return {
    description: 'TSTDRIP KITCHEN',
    count: 3,
    total: '-64.20',
    ...overrides,
  };
}

describe('UncategorizedReview', () => {
  it('renders nothing when there is nothing to review', () => {
    const { container } = render(
      <UncategorizedReview groups={[]} total="0.00" onAssign={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('reports how much money is sitting uncategorized', () => {
    render(
      <UncategorizedReview groups={[group()]} total="-482.19" onAssign={vi.fn()} />,
    );
    expect(screen.getByText('-$482.19')).toBeInTheDocument();
  });

  it('shows each merchant with what it costs', () => {
    render(
      <UncategorizedReview groups={[group()]} total="-999.00" onAssign={vi.fn()} />,
    );
    expect(screen.getByText('TSTDRIP KITCHEN')).toBeInTheDocument();
    expect(screen.getByText('-$64.20')).toBeInTheDocument();
  });

  it('counts the transactions in a group', () => {
    render(
      <UncategorizedReview groups={[group()]} total="-64.20" onAssign={vi.fn()} />,
    );
    expect(screen.getByText('3 transactions')).toBeInTheDocument();
  });

  it('says transaction, not transactions, for a group of one', () => {
    render(
      <UncategorizedReview
        groups={[group({ count: 1 })]}
        total="-64.20"
        onAssign={vi.fn()}
      />,
    );
    expect(screen.getByText('1 transaction')).toBeInTheDocument();
  });

  it('keeps the order the server sent, which is largest first', () => {
    render(
      <UncategorizedReview
        groups={[
          group({ description: 'BIG CO', total: '-500.00' }),
          group({ description: 'SMALL CO', total: '-5.00' }),
        ]}
        total="-505.00"
        onAssign={vi.fn()}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('BIG CO');
    expect(items[1]).toHaveTextContent('SMALL CO');
  });

  it('assigns the whole group under the description the API grouped it by', async () => {
    const onAssign = vi.fn();
    render(
      <UncategorizedReview groups={[group()]} total="-64.20" onAssign={onAssign} />,
    );

    await userEvent.selectOptions(
      screen.getByLabelText('Category for TSTDRIP KITCHEN'),
      'Dining',
    );

    expect(onAssign).toHaveBeenCalledWith('TSTDRIP KITCHEN', 'Dining');
  });

  it('offers every category to assign', () => {
    render(
      <UncategorizedReview groups={[group()]} total="-64.20" onAssign={vi.fn()} />,
    );
    const picker = screen.getByLabelText('Category for TSTDRIP KITCHEN');
    expect(picker).toHaveTextContent('Groceries');
    expect(picker).toHaveTextContent('Dining');
  });

  it('does not offer Uncategorized, which would assign nothing', () => {
    render(
      <UncategorizedReview groups={[group()]} total="-64.20" onAssign={vi.fn()} />,
    );
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).not.toContain('Uncategorized');
  });

  it('disables the pickers while an assignment is in flight', () => {
    render(
      <UncategorizedReview
        groups={[group()]}
        total="-64.20"
        onAssign={vi.fn()}
        isAssigning
      />,
    );
    expect(screen.getByLabelText('Category for TSTDRIP KITCHEN')).toBeDisabled();
  });
});
