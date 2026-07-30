import { useQueryClient } from '@tanstack/react-query'
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  getListEventsQueryKey,
} from '@/api/generated/endpoints/familyHubAPI'
import type { EventResponse } from '@/api/generated/model'
import { visibleRange, agendaRange, rangeParams, type CalendarViewMode } from './dates'

export interface CalendarEvent {
  id: string
  title: string
  memberId: string
  isAllDay: boolean
  start: Date | null
  end: Date | null
  allDayStart: string | null
  allDayEnd: string | null
  location: string | null
  description: string | null
  reminderUseDefault: boolean
  reminderMinutes: number | null
  recurringEventId: string | null
}

export function toCalendarEvent(e: EventResponse): CalendarEvent {
  return {
    id: e.id,
    title: e.title,
    memberId: e.memberId,
    isAllDay: e.isAllDay,
    start: e.start ? new Date(e.start) : null,
    end: e.end ? new Date(e.end) : null,
    allDayStart: e.allDayStart ?? null,
    allDayEnd: e.allDayEnd ?? null,
    location: e.location ?? null,
    description: e.description ?? null,
    reminderUseDefault: e.reminderUseDefault ?? true,
    reminderMinutes: e.reminderMinutes ?? null,
    recurringEventId: e.recurringEventId ?? null,
  }
}

export function useCalendarEvents(anchor: Date, view: CalendarViewMode) {
  const range = view === 'agenda' ? agendaRange(anchor) : visibleRange(anchor, view)
  const params = rangeParams(range)
  const query = useListEvents(params)
  const events: CalendarEvent[] = (query.data?.data ?? []).map(toCalendarEvent)
  return {
    events,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}

export function useCreateEventMutation() {
  const queryClient = useQueryClient()
  return useCreateEvent({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  })
}

export function useUpdateEventMutation() {
  const queryClient = useQueryClient()
  return useUpdateEvent({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  })
}

export function useDeleteEventMutation() {
  const queryClient = useQueryClient()
  return useDeleteEvent({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() }),
    },
  })
}
