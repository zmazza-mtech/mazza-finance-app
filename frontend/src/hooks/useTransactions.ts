import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTransactions, updateTransaction, batchCategorize } from '@/api/client';
import type { Transaction, Category } from '@/api/types';

export function transactionsKey(params: Record<string, string | undefined>) {
  return ['transactions', params] as const;
}

/**
 * Fetches transactions with flexible filtering and sorting.
 */
export function useTransactions(params: {
  accountId?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortDir?: string;
  category?: string;
}) {
  return useQuery({
    queryKey: transactionsKey(params),
    queryFn: () => getTransactions(params),
    enabled: Boolean(params.startDate && params.endDate),
    staleTime: 60 * 1000,
  });
}

/**
 * Mutation to update a transaction's category with optimistic update.
 */
export function useUpdateTransactionCategory(queryParams: Record<string, string | undefined>) {
  const queryClient = useQueryClient();
  const key = transactionsKey(queryParams);

  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: Category | null }) =>
      updateTransaction(id, { category }),
    onMutate: async ({ id, category }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Transaction[]>(key);

      queryClient.setQueryData<Transaction[]>(key, (old) => {
        if (!old) return old;
        return old.map((t) => (t.id === id ? { ...t, category } : t));
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/**
 * Mutation to batch-update category for all transactions with the same description.
 */
export function useBatchCategorize(queryParams: Record<string, string | undefined>) {
  const queryClient = useQueryClient();
  const key = transactionsKey(queryParams);

  return useMutation({
    mutationFn: ({ description, category }: { description: string; category: Category | null }) =>
      batchCategorize(description, category),
    onMutate: async ({ description, category }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Transaction[]>(key);

      queryClient.setQueryData<Transaction[]>(key, (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.description === description ? { ...t, category } : t,
        );
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(key, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}
