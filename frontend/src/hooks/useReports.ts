import { useQuery } from '@tanstack/react-query';
import { getCategorySummary } from '@/api/client';

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
