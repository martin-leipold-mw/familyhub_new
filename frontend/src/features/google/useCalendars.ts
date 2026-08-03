import {
  useListGoogleCalendars,
  useSaveSelectedCalendars,
  useSyncCalendars,
  useListAllCalendars,
  useUpdateCalendarFlags,
  getListGoogleCalendarsQueryKey,
  getListConnectionsQueryKey,
  getListAllCalendarsQueryKey,
  authorizeGoogle,
  useGoogleCallback,
} from '@/api/generated/endpoints/familyHubAPI'
import type { CalendarResponse, AuthorizeGoogleParams } from '@/api/generated/model'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export function useCalendarsForMember(memberId: string) {
  const query = useListGoogleCalendars({ memberId })
  return {
    calendars: (query.data?.data ?? []) as CalendarResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useSaveSelectedCalendarsMutation() {
  const queryClient = useQueryClient()
  return useSaveSelectedCalendars({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListGoogleCalendarsQueryKey() }),
    },
  })
}

export function useSyncCalendarsMutation() {
  const queryClient = useQueryClient()
  return useSyncCalendars({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListGoogleCalendarsQueryKey() })
        void queryClient.invalidateQueries({ queryKey: getListConnectionsQueryKey() })
      },
    },
  })
}

export function useAllCalendars() {
  const query = useListAllCalendars()
  return {
    calendars: (query.data?.data ?? []) as CalendarResponse[],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

export function useUpdateCalendarFlagsMutation() {
  const queryClient = useQueryClient()
  return useUpdateCalendarFlags({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListGoogleCalendarsQueryKey() })
        void queryClient.invalidateQueries({ queryKey: getListAllCalendarsQueryKey() })
      },
    },
  })
}

export function useStartGoogleAuth() {
  return useMutation({
    mutationFn: (params?: AuthorizeGoogleParams) =>
      authorizeGoogle(params).then((res) => res.data.authUrl),
  })
}

export { useGoogleCallback }
