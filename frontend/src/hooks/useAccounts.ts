import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccounts, createAccount, updateAccount } from '@/api/client';
import type { Account, CreateAccountBody } from '@/api/types';

export const ACCOUNTS_KEY = ['accounts'] as const;

/**
 * Fetches all accounts. Filters to checking/savings for account selector
 * (credit accounts are excluded from the nav selector, per spec).
 */
export function useAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: getAccounts,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Returns only checking and savings accounts (for the nav account selector).
 */
export function useBankAccounts() {
  const query = useAccounts();
  return {
    ...query,
    data: query.data?.filter(
      (a) => a.type === 'checking' || a.type === 'savings',
    ),
  };
}

/**
 * Mutation to create a manual account (no external bank connection).
 */
export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateAccountBody) => createAccount(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}

/**
 * Mutation to toggle whether an account is included in the forecast view.
 */
export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<Pick<Account, 'includeInView' | 'isActive' | 'lastBalance'>>;
    }) => updateAccount(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}
