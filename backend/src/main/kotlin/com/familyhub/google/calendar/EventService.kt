package com.familyhub.google.calendar

import com.familyhub.google.connection.GoogleConnectionRepository
import com.familyhub.shared.exceptions.ResourceNotFoundException
import com.familyhub.shared.exceptions.ValidationException
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

data class CreateEventCommand(
    val memberId: UUID,
    val calendarId: String?,
    val title: String,
    val description: String? = null,
    val location: String? = null,
    val start: Instant? = null,
    val end: Instant? = null,
    val allDayStart: LocalDate? = null,
    val allDayEnd: LocalDate? = null,
    val isAllDay: Boolean,
    val reminderUseDefault: Boolean = true,
    val reminderMinutes: Int? = null,
    val recurrenceRule: String? = null,
)

data class EventView(
    val id: UUID,
    val title: String,
    val description: String?,
    val location: String?,
    val start: Instant?,
    val end: Instant?,
    val isAllDay: Boolean,
    val allDayStart: LocalDate?,
    val allDayEnd: LocalDate?,
    val memberId: UUID,
    val calendarId: String,
    val reminderUseDefault: Boolean,
    val reminderMinutes: Int?,
    val recurringEventId: String?,
    val recurrenceRule: String? = null,
)

private fun Event.toView() =
    EventView(
        id = id!!,
        title = title,
        description = description,
        location = location,
        start = startTime,
        end = endTime,
        isAllDay = isAllDay,
        allDayStart = allDayStart,
        allDayEnd = allDayEnd,
        memberId = ownerMemberId,
        calendarId = googleCalendarId,
        reminderUseDefault = reminderUseDefault,
        reminderMinutes = reminderMinutes,
        recurringEventId = recurrenceId,
    )

private fun CreateEventCommand.toEventCommand() =
    EventCommand(
        title = title,
        description = description,
        location = location,
        start = start,
        end = end,
        allDayStart = allDayStart,
        allDayEnd = allDayEnd,
        isAllDay = isAllDay,
        reminderUseDefault = reminderUseDefault,
        reminderMinutes = reminderMinutes,
        recurrenceRule = recurrenceRule,
    )

@Service
class EventService(
    private val eventRepository: EventRepository,
    private val subscriptionRepository: CalendarSubscriptionRepository,
    private val connectionRepository: GoogleConnectionRepository,
    private val calendarClient: GoogleCalendarClient,
    private val mapper: EventMapper,
) {
    fun list(
        start: Instant?,
        end: Instant?,
        memberId: UUID?,
        calendarId: String?,
    ): List<EventView> {
        val events =
            if (start != null && end != null) {
                eventRepository.findByStartTimeBetween(start, end)
            } else {
                eventRepository.findAll()
            }
        return events
            .let { list -> if (memberId != null) list.filter { it.ownerMemberId == memberId } else list }
            .let { list -> if (calendarId != null) list.filter { it.googleCalendarId == calendarId } else list }
            .map { it.toView() }
    }

    fun get(id: UUID): EventView {
        return eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Termin nicht gefunden")
        }.toView()
    }

    fun create(cmd: CreateEventCommand): EventView {
        requireValidTiming(cmd)
        val connection =
            connectionRepository.findByFamilyMemberId(cmd.memberId)
                ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

        val target: CalendarSubscription =
            if (cmd.calendarId != null) {
                subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connection.id!!, cmd.calendarId)
                    ?: throw ValidationException("Kalender nicht gefunden")
            } else {
                subscriptionRepository.findAllByConnectionId(connection.id!!).firstOrNull { it.isPrimary }
                    ?: throw ValidationException("Kein Zielkalender vorhanden")
            }

        val googleEvent = mapper.toGoogleEvent(cmd.toEventCommand())
        val inserted = calendarClient.insertEvent(connection, target.googleCalendarId, googleEvent)
        val entity = mapper.toEntity(inserted, target, cmd.memberId)
        return eventRepository.save(entity).toView()
    }

    fun update(
        id: UUID,
        cmd: CreateEventCommand,
        scope: String = "instance",
    ): EventView {
        requireValidTiming(cmd)
        val local =
            eventRepository.findById(id).orElseThrow {
                ResourceNotFoundException("Termin nicht gefunden")
            }
        val connection = requireConnection(local.ownerMemberId)
        val subscription = requireSubscription(connection.id!!, local.googleCalendarId)

        val googleEvent = mapper.toGoogleEvent(cmd.toEventCommand())
        googleEvent.id = resolveTargetGoogleId(local, scope)
        val updated = calendarClient.updateEvent(connection, local.googleCalendarId, googleEvent)
        val entity = mapper.toEntity(updated, subscription, local.ownerMemberId)
        return if (scope == "series") {
            // `updated` is the Google MASTER event (googleEvent.id was the parent), not the
            // instance the caller addressed. Persisting it over the instance row would rewrite
            // that row's googleEventId/recurrenceId to the master's — a ghost that sync (which
            // only ever sees expanded instance ids) could never reconcile. Drop the instance
            // instead; the next sync re-expands the series into fresh instance rows.
            eventRepository.delete(local)
            entity.id = local.id
            entity.toView()
        } else {
            entity.id = local.id
            eventRepository.save(entity).toView()
        }
    }

    fun delete(
        id: UUID,
        scope: String = "instance",
    ) {
        val local =
            eventRepository.findById(id).orElseThrow {
                ResourceNotFoundException("Termin nicht gefunden")
            }
        val connection = requireConnection(local.ownerMemberId)

        val targetGoogleId = resolveTargetGoogleId(local, scope)
        calendarClient.deleteEvent(connection, local.googleCalendarId, targetGoogleId)
        eventRepository.delete(local)
        // Remaining series instances are pruned on the next sync (cancelled entries).
    }

    fun getSeries(id: UUID): EventView {
        val local =
            eventRepository.findById(id).orElseThrow {
                ResourceNotFoundException("Termin nicht gefunden")
            }
        val parentId = local.recurrenceId ?: throw ValidationException("Termin gehört zu keiner Serie")
        val connection = requireConnection(local.ownerMemberId)
        val subscription = requireSubscription(connection.id!!, local.googleCalendarId)

        val master = calendarClient.getEvent(connection, local.googleCalendarId, parentId)
        val entity = mapper.toEntity(master, subscription, local.ownerMemberId)
        // This is a projection, not a persisted row: reuse the requesting instance's id
        // (mapper.toEntity never sets one) so entity.toView()'s id!! doesn't NPE.
        entity.id = local.id
        return entity.toView().copy(
            recurringEventId = parentId,
            recurrenceRule = master.recurrence?.firstOrNull { it.startsWith("RRULE") },
        )
    }

    private fun requireConnection(memberId: UUID) =
        connectionRepository.findByFamilyMemberId(memberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

    private fun requireSubscription(
        connectionId: UUID,
        calendarId: String,
    ) = subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connectionId, calendarId)
        ?: throw ResourceNotFoundException("Kalender-Abonnement nicht gefunden")

    /**
     * Resolves which Google event id an update/delete should target:
     * scope "series" targets the parent recurring event (requires [Event.recurrenceId]);
     * scope "instance" (default) targets the event itself.
     */
    private fun resolveTargetGoogleId(
        local: Event,
        scope: String,
    ) = if (scope == "series") {
        local.recurrenceId ?: throw ValidationException("Termin gehört zu keiner Serie")
    } else {
        local.googleEventId
    }

    private fun requireValidTiming(cmd: CreateEventCommand) {
        if (cmd.isAllDay) {
            if (cmd.allDayStart == null || cmd.allDayEnd == null) {
                throw ValidationException("Ganztägige Termine benötigen ein Start- und Enddatum.")
            }
        } else {
            if (cmd.start == null || cmd.end == null) {
                throw ValidationException("Termine benötigen eine Start- und Endzeit.")
            }
        }
    }
}
