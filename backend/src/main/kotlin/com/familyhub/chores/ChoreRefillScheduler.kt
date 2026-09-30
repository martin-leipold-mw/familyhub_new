package com.familyhub.chores

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Einmal täglich morgens wird auf bis zu fünf offene Aufgaben je Person
 * aufgefüllt — nicht sofort beim Abhaken. Eine leergeräumte Liste soll bis zum
 * nächsten Morgen leer bleiben: sonst entfällt das Erfolgserlebnis und
 * Fertigwerden fühlt sich an wie Strafe.
 */
@Component
class ChoreRefillScheduler(
    private val refillService: ChoreRefillService,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    /** Internal: package-visible for tests to inspect/set the guard. */
    internal val running = AtomicBoolean(false)

    // Die Zone gehört an den Cron-Ausdruck, weil der Container auf UTC läuft:
    // ohne sie liefe "05:00" im Sommer um 07:00 Ortszeit.
    @Scheduled(
        cron = "\${familyhub.chores.refill-cron:0 0 5 * * *}",
        zone = "\${familyhub.chores.refill-zone:Europe/Berlin}",
    )
    fun runScheduledRefill() = runGuarded("geplant")

    // Einmalig kurz nach dem Start: ein über Nacht gestoppter NAS soll nicht bis
    // zum nächsten Morgen ohne Ämtli dastehen. fixedDelay = Long.MAX_VALUE macht
    // daraus einen einmaligen Lauf.
    @Scheduled(initialDelay = STARTUP_DELAY_MS, fixedDelay = Long.MAX_VALUE)
    fun runStartupRefill() = runGuarded("Start")

    private fun runGuarded(trigger: String) {
        if (!running.compareAndSet(false, true)) {
            log.warn("Ämtli-Ausgabe ({}) übersprungen — vorheriger Lauf noch aktiv", trigger)
            return
        }
        try {
            log.info("Starte Ämtli-Ausgabe ({})", trigger)
            refillService.refillAll()
        } finally {
            running.set(false)
        }
    }

    private companion object {
        const val STARTUP_DELAY_MS = 5_000L
    }
}
