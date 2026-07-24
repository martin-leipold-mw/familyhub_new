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
)

private fun Event.toView() = EventView(
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
)

private fun CreateEventCommand.toEventCommand() = EventCommand(
    title = title,
    description = description,
    location = location,
    start = start,
    end = end,
    allDayStart = allDayStart,
    allDayEnd = allDayEnd,
    isAllDay = isAllDay,
)

@Service
class EventService(
    private val eventRepository: EventRepository,
    private val subscriptionRepository: CalendarSubscriptionRepository,
    private val connectionRepository: GoogleConnectionRepository,
    private val calendarClient: GoogleCalendarClient,
    private val mapper: EventMapper,
) {

    fun list(start: Instant?, end: Instant?, memberId: UUID?, calendarId: String?): List<EventView> {
        val events = if (start != null && end != null) {
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
        val connection = connectionRepository.findByFamilyMemberId(cmd.memberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

        val target: CalendarSubscription = if (cmd.calendarId != null) {
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

    fun update(id: UUID, cmd: CreateEventCommand): EventView {
        val local = eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Termin nicht gefunden")
        }
        val connection = connectionRepository.findByFamilyMemberId(local.ownerMemberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")
        val subscription = subscriptionRepository.findByConnectionIdAndGoogleCalendarId(connection.id!!, local.googleCalendarId)
            ?: throw ResourceNotFoundException("Kalender-Abonnement nicht gefunden")

        val googleEvent = mapper.toGoogleEvent(cmd.toEventCommand())
        googleEvent.id = local.googleEventId
        val updated = calendarClient.updateEvent(connection, local.googleCalendarId, googleEvent)
        val entity = mapper.toEntity(updated, subscription, local.ownerMemberId)
        entity.id = local.id
        return eventRepository.save(entity).toView()
    }

    fun delete(id: UUID) {
        val local = eventRepository.findById(id).orElseThrow {
            ResourceNotFoundException("Termin nicht gefunden")
        }
        val connection = connectionRepository.findByFamilyMemberId(local.ownerMemberId)
            ?: throw ResourceNotFoundException("Keine Google-Verbindung für dieses Mitglied gefunden")

        calendarClient.deleteEvent(connection, local.googleCalendarId, local.googleEventId)
        eventRepository.delete(local)
    }
}
