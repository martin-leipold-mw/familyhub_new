import {
  useListGoogleCalendars,
  useSaveSelectedCalendars,
  useSyncCalendars,
  getListGoogleCalendarsQueryKey,
  getListConnectionsQueryKey,
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

export function useStartGoogleAuth() {
  return useMutation({
    mutationFn: (params?: AuthorizeGoogleParams) =>
      authorizeGoogle(params).then((res) => res.data.authUrl),
  })
}

export { useGoogleCallback }
