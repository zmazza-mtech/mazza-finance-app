import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryFilterPills } from '@/components/transactions/CategoryFilterPills';

const categories = ['Income', 'Groceries', 'uncategorized'] as const;

describe('CategoryFilterPills', () => {
  it('leads with an all-categories pill', () => {
    render(
      <CategoryFilterPills categories={[...categories]} value="all" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'All categories' })).toBeInTheDocument();
  });

  it('renders a pill for each category present in the range', () => {
    render(
      <CategoryFilterPills categories={[...categories]} value="all" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Income' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Groceries' })).toBeInTheDocument();
  });

  it('names the uncategorized pill in prose', () => {
    render(
      <CategoryFilterPills categories={[...categories]} value="all" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Uncategorized' })).toBeInTheDocument();
  });

  it('marks only the active pill as pressed', () => {
    render(
      <CategoryFilterPills categories={[...categories]} value="Income" onChange={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Income' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All categories' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the chosen category', async () => {
    const onChange = vi.fn();
    render(
      <CategoryFilterPills categories={[...categories]} value="all" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Groceries' }));
    expect(onChange).toHaveBeenCalledWith('Groceries');
  });

  it('reports the uncategorized selection by its filter value', async () => {
    const onChange = vi.fn();
    render(
      <CategoryFilterPills categories={[...categories]} value="all" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Uncategorized' }));
    expect(onChange).toHaveBeenCalledWith('uncategorized');
  });

  it('clears the filter from the all-categories pill', async () => {
    const onChange = vi.fn();
    render(
      <CategoryFilterPills categories={[...categories]} value="Income" onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'All categories' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('still offers the all-categories pill when the range is empty', () => {
    render(<CategoryFilterPills categories={[]} value="all" onChange={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
