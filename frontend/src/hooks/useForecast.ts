import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  getForecast,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '@/api/client';
import type {
  ForecastDay,
  CreateTransactionBody,
  UpdateTransactionBody,
} from '@/api/types';

export function forecastKey(
  accountId: string,
  startDate: string,
  endDate: string,
) {
  return ['forecast', accountId, startDate, endDate] as const;
}

/**
 * Fetches the forecast for a date range.
 */
export function useForecast(
  accountId: string,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: forecastKey(accountId, startDate, endDate),
    queryFn: () => getForecast({ accountId, startDate, endDate }),
    enabled: Boolean(accountId && startDate && endDate),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Mutation to add a transaction with optimistic update.
 * On error: rolls back the optimistic state and surfaces an error.
 */
export function useAddTransaction(
  accountId: string,
  startDate: string,
  endDate: string,
) {
  const queryClient = useQueryClient();
  const key = forecastKey(accountId, startDate, endDate);

  return useMutation({
    mutationFn: (body: CreateTransactionBody) => createTransaction(body),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ForecastDay[]>(key);

      // Optimistic: insert transaction into the matching forecast day
      queryClient.setQueryData<ForecastDay[]>(key, (old) => {
        if (!old) return old;
        return old.map((day) => {
          if (day.date !== body.date) return day;
          return {
            ...day,
            transactions: [
              ...day.transactions,
              {
                id: `optimistic-${Date.now()}`,
                date: body.date,
                description: body.description,
                amount: body.amount,
                source: 'manual' as const,
              },
            ],
          };
        });
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
 * Mutation to update a manual transaction with optimistic update.
 */
export function useUpdateTransaction(
  accountId: string,
  startDate: string,
  endDate: string,
) {
  const queryClient = useQueryClient();
  const key = forecastKey(accountId, startDate, endDate);

  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateTransactionBody;
    }) => updateTransaction(id, body),
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ForecastDay[]>(key);

      queryClient.setQueryData<ForecastDay[]>(key, (old) => {
        if (!old) return old;
        return old.map((day) => ({
          ...day,
          transactions: day.transactions.map((t) =>
            t.id === id ? { ...t, ...body } : t,
          ),
        }));
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
 * Mutation to delete a manual transaction with optimistic update.
 */
export function useDeleteTransaction(
  accountId: string,
  startDate: string,
  endDate: string,
) {
  const queryClient = useQueryClient();
  const key = forecastKey(accountId, startDate, endDate);

  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ForecastDay[]>(key);

      queryClient.setQueryData<ForecastDay[]>(key, (old) => {
        if (!old) return old;
        return old.map((day) => ({
          ...day,
          transactions: day.transactions.filter((t) => t.id !== id),
        }));
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
