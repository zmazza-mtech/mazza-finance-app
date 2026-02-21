import { useMutation, useQueryClient } from '@tanstack/react-query';
import { importTransactions } from '@/api/client';
import type { ImportBody, ImportResult } from '@/api/types';
import { ACCOUNTS_KEY } from './useAccounts';

/**
 * Mutation hook for bulk CSV transaction import.
 * On success, invalidates forecast and accounts queries so the UI refreshes.
 * No optimistic update — batch imports are not instant operations.
 */
export function useImportTransactions() {
  const queryClient = useQueryClient();

  return useMutation<ImportResult, Error, ImportBody>({
    mutationFn: importTransactions,
    onSettled: () => {
      // Invalidate all forecast queries (any account, any date range)
      void queryClient.invalidateQueries({ queryKey: ['forecast'] });
      // Invalidate accounts in case balance display updates
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}
