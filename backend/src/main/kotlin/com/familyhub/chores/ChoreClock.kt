package com.familyhub.chores

import com.familyhub.settings.SettingsService
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Die einzige Stelle im Ämtli-Modul, die Zeit liest. Alle Tagesberechnungen
 * laufen über die Haushaltszeitzone (`family.timezone`), nicht über UTC und
 * nicht über die Systemzeit des Containers — sonst zeigt die Ansicht abends
 * bereits den Folgetag.
 */
@Component
class ChoreClock(
    private val clock: Clock,
    private val settingsService: SettingsService,
) {
    private fun zone(): ZoneId = ZoneId.of(settingsService.timezone())

    fun today(): LocalDate = LocalDate.now(clock.withZone(zone()))

    fun now(): Instant = clock.instant()

    fun startOfToday(): Instant = today().atStartOfDay(zone()).toInstant()
}
