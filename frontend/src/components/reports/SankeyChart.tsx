import { Sankey, Tooltip, Layer, Rectangle } from 'recharts';
import type { CategorySummaryResponse } from '@/api/types';

interface SankeyChartProps {
  data: CategorySummaryResponse;
}

// Colors for expense categories
const CATEGORY_COLORS: Record<string, string> = {
  Income: '#22c55e',
  Housing: '#3b82f6',
  Utilities: '#06b6d4',
  Groceries: '#84cc16',
  Transportation: '#f59e0b',
  Insurance: '#6366f1',
  Healthcare: '#f43f5e',
  Entertainment: '#8b5cf6',
  Dining: '#f97316',
  Shopping: '#ec4899',
  Subscriptions: '#a855f7',
  Transfers: '#6b7280',
  Other: '#9ca3af',
};

function SankeyNode({ x, y, width, height, payload }: {
  x: number;
  y: number;
  width: number;
  height: number;
  payload: { name: string };
}) {
  const color = CATEGORY_COLORS[payload.name] ?? '#6b7280';
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.9} />
      <text
        x={x + width + 6}
        y={y + height / 2}
        textAnchor="start"
        dominantBaseline="middle"
        className="text-xs fill-gray-700 dark:fill-gray-300"
      >
        {payload.name}
      </text>
    </Layer>
  );
}

/**
 * Sankey diagram showing income flowing to expense categories.
 * Uses parseFloat for chart layout positioning only — not financial arithmetic.
 */
export function SankeyChart({ data }: SankeyChartProps) {
  const totalIncome = data.income.reduce(
    (sum, item) => sum + parseFloat(item.total),
    0,
  );

  if (totalIncome === 0 && data.expenses.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
        No data for the selected date range.
      </p>
    );
  }

  // Build Sankey nodes: [Income, ...expense categories]
  const nodes: { name: string }[] = [{ name: 'Income' }];
  const links: { source: number; target: number; value: number }[] = [];

  for (const expense of data.expenses) {
    const nodeIndex = nodes.length;
    nodes.push({ name: expense.category });
    links.push({
      source: 0,
      target: nodeIndex,
      value: Math.abs(parseFloat(expense.total)),
    });
  }

  // If no expense links, nothing to render
  if (links.length === 0) {
    return (
      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
        No expenses to display.
      </p>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <Sankey
        width={700}
        height={400}
        data={{ nodes, links }}
        node={SankeyNode}
        nodePadding={24}
        nodeWidth={10}
        linkCurvature={0.5}
        margin={{ top: 20, right: 120, bottom: 20, left: 20 }}
      >
        <Tooltip
          formatter={(value: number | undefined) =>
            value != null
              ? `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : ''
          }
        />
      </Sankey>
    </div>
  );
}
