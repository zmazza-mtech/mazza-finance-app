import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getRecurring,
  createRecurring,
  updateRecurring,
  deleteRecurring,
  detectRecurringPatterns,
  getOverrides,
  createOverride,
  deleteOverride,
} from '@/api/client';
import type {
  CreateRecurringBody,
  UpdateRecurringBody,
  CreateOverrideBody,
} from '@/api/types';

export const recurringKey = (accountId: string) =>
  ['recurring', accountId] as const;

export const overridesKey = (recurringId: string) =>
  ['overrides', recurringId] as const;

/**
 * Fetches all recurring transactions for an account.
 */
export function useRecurring(accountId: string) {
  return useQuery({
    queryKey: recurringKey(accountId),
    queryFn: () => getRecurring(accountId),
    enabled: Boolean(accountId),
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Returns only recurring in 'pending_review' status.
 */
export function usePendingReview(accountId: string) {
  const query = useRecurring(accountId);
  return {
    ...query,
    data: query.data?.filter((r) => r.status === 'pending_review'),
  };
}

export function useCreateRecurring(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRecurringBody) => createRecurring(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringKey(accountId) });
    },
  });
}

export function useUpdateRecurring(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateRecurringBody }) =>
      updateRecurring(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringKey(accountId) });
      // Also invalidate forecast since recurring changes affect it
      void queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
  });
}

export function useDetectRecurring(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => detectRecurringPatterns(accountId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringKey(accountId) });
    },
  });
}

export function useDeleteRecurring(accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRecurring(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: recurringKey(accountId) });
      void queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
  });
}

export function useOverrides(recurringId: string) {
  return useQuery({
    queryKey: overridesKey(recurringId),
    queryFn: () => getOverrides(recurringId),
    enabled: Boolean(recurringId),
  });
}

export function useCreateOverride(recurringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      originalDate,
      body,
    }: {
      originalDate: string;
      body: CreateOverrideBody;
    }) => createOverride(recurringId, originalDate, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: overridesKey(recurringId),
      });
      void queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
  });
}

export function useDeleteOverride(recurringId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (originalDate: string) =>
      deleteOverride(recurringId, originalDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: overridesKey(recurringId),
      });
      void queryClient.invalidateQueries({ queryKey: ['forecast'] });
    },
  });
}
