import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { batchCategorize, getCategorySummary, getCategoryTrend, getUncategorized } from '@/api/client';
import type { Category } from '@/api/types';

/** Query key for the uncategorized review surface. */
const UNCATEGORIZED_KEY = ['uncategorized'];

/**
 * Fetches category summary report for a date range.
 */
export function useCategorySummary(params: {
  accountId: string;
  startDate: string;
  endDate: string;
}) {
  return useQuery({
    queryKey: ['categorySummary', params],
    queryFn: () => getCategorySummary(params),
    enabled: Boolean(params.accountId && params.startDate && params.endDate),
    staleTime: 60 * 1000,
  });
}

/**
 * Fetches trailing category totals over same-day-of-month spans, newest
 * first. Backs the projection panel's biggest-mover and spend-vs-average
 * figures.
 */
export function useCategoryTrend(params: {
  accountId: string;
  asOf: string;
  months: number;
}) {
  return useQuery({
    queryKey: ['categoryTrend', params],
    queryFn: () => getCategoryTrend(params),
    enabled: Boolean(params.accountId && params.asOf && params.months > 0),
    staleTime: 60 * 1000,
  });
}

/**
 * Fetches the uncategorized long tail, grouped by merchant, largest first.
 * Takes no account — the grouping spans all of them, as bulk assignment does.
 */
export function useUncategorized() {
  return useQuery({
    queryKey: UNCATEGORIZED_KEY,
    queryFn: getUncategorized,
    staleTime: 60 * 1000,
  });
}

/**
 * Files every transaction sharing a normalized description under one category.
 *
 * Invalidates the transaction lists as well as the review surface: the same
 * rows are on the Transactions screen and in the calendar, and leaving them
 * cached would show the old category until something else refetched.
 */
export function useAssignUncategorized() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ description, category }: { description: string; category: Category }) =>
      batchCategorize(description, category),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNCATEGORIZED_KEY });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
  });
}
