import { useQuery } from '@tanstack/react-query';
import { getCategorySummary, getCategoryTrend } from '@/api/client';

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
