package com.familyhub.google.sync

import com.familyhub.google.calendar.CalendarSyncService
import com.familyhub.google.connection.GoogleConnectionRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicBoolean

@Component
class CalendarSyncScheduler(
    private val connectionRepository: GoogleConnectionRepository,
    private val calendarSyncService: CalendarSyncService,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    /** Internal: package-visible for tests to inspect/set the guard. */
    internal val running = AtomicBoolean(false)

    @Scheduled(fixedDelayString = "\${google.sync.fixed-delay-ms:900000}")
    fun runScheduledSync() {
        if (!running.compareAndSet(false, true)) {
            log.warn("Scheduled calendar sync skipped — previous run still in progress")
            return
        }
        try {
            val connections = connectionRepository.findAllByStatus("active")
            log.info("Starting scheduled calendar sync for {} active connection(s)", connections.size)
            for (connection in connections) {
                try {
                    val result = calendarSyncService.syncConnection(connection)
                    log.info(
                        "Synced connection {} (member={}): created={}, updated={}, deleted={}",
                        connection.id,
                        connection.familyMemberId,
                        result.created,
                        result.updated,
                        result.deleted,
                    )
                } catch (ex: Exception) {
                    log.error(
                        "Failed to sync connection {} (member={}): {}",
                        connection.id,
                        connection.familyMemberId,
                        ex.message,
                        ex,
                    )
                }
            }
        } finally {
            running.set(false)
        }
    }
}
