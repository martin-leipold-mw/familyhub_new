package com.familyhub.google.sync

import com.familyhub.google.tasks.TaskSyncService
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Eigener Scheduler neben [CalendarSyncScheduler] — nicht in diesen hineingebaut,
 * damit ein hängender Aufgaben-Lauf den Kalender nicht blockiert und beide
 * Intervalle getrennt konfigurierbar bleiben.
 *
 * Delegiert vollständig an [TaskSyncService.syncAll] — die Iteration über aktive
 * Verbindungen inkl. Fehlerbehandlung pro Verbindung lebt dort, nicht hier, damit
 * es nur eine Stelle mit dieser Logik gibt.
 */
@Component
class TaskSyncScheduler(
    private val taskSyncService: TaskSyncService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** Internal: package-visible for tests to inspect/set the guard. */
    internal val running = AtomicBoolean(false)

    @Scheduled(fixedDelayString = "\${google.sync.tasks-fixed-delay-ms:900000}")
    fun runScheduledSync() {
        if (!running.compareAndSet(false, true)) {
            log.warn("Geplanter Aufgaben-Sync übersprungen — vorheriger Lauf noch aktiv")
            return
        }
        try {
            log.info("Starte geplanten Aufgaben-Sync")
            taskSyncService.syncAll()
        } catch (ex: Exception) {
            log.error("Geplanter Aufgaben-Sync fehlgeschlagen: {}", ex.message, ex)
        } finally {
            running.set(false)
        }
    }
}
