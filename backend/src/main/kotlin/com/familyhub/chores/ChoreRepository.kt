package com.familyhub.chores

import org.springframework.data.jpa.repository.JpaRepository
import java.time.LocalDate
import java.util.UUID

interface ChoreRepository : JpaRepository<Chore, UUID> {
    fun findAllByOrderByCreatedAtAsc(): List<Chore>

    fun findAllByIsActiveTrueOrderByCreatedAtAsc(): List<Chore>

    /**
     * Die Kandidatenliste des Ausgabelaufs. `<= today` statt `= today` ist der
     * gesamte Nachholmechanismus: stand der NAS drei Tage still, kommt beim
     * nächsten Lauf alles Fällige heraus.
     */
    fun findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today: LocalDate): List<Chore>
}
