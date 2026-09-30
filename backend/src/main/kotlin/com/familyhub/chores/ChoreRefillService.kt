package com.familyhub.chores

import com.familyhub.members.FamilyMemberRepository
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.time.LocalDate
import java.util.UUID

data class RefillResult(
    val assigned: Int,
    val waiting: Int,
)

/**
 * Der Ausgabelauf. Kein Laufprotokoll, kein "letzter erfolgreicher Lauf"-
 * Zeitstempel: die Bedingung lautet `next_due_on <= heute`, also holt jeder
 * Lauf automatisch alles nach, was liegengeblieben ist.
 */
@Service
class ChoreRefillService(
    private val choreRepository: ChoreRepository,
    private val assignmentRepository: ChoreAssignmentRepository,
    private val memberRepository: FamilyMemberRepository,
    private val choreClock: ChoreClock,
    private val transactionTemplate: TransactionTemplate,
    @Value("\${familyhub.chores.max-open-per-member:5}") private val maxOpenPerMember: Int,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun refillAll(): RefillResult {
        val today = choreClock.today()
        releaseOrphanedAssignments()

        val due =
            choreRepository
                .findAllByIsActiveTrueAndNextDueOnLessThanEqualOrderByNextDueOnAscCreatedAtAsc(today)
                .filter { !assignmentRepository.existsByChoreIdAndStatus(it.id!!, STATUS_OPEN) }

        // Zeiger je Gruppe, innerhalb dieses einen Laufs: werden mehrere Vorlagen
        // derselben Gruppe am selben Tag fällig, rotiert die Ausgabe trotzdem
        // durch den Pool, statt alle an das erste Poolmitglied zu häufen (dessen
        // je-Vorlage-Feld `lastAssignedMemberId` ja für jede der Vorlagen noch
        // auf dem alten Stand ist).
        val lastAssignedInRun = mutableMapOf<String, UUID>()

        var assigned = 0
        var waiting = 0
        for (chore in due) {
            // Eigene Transaktion je Vorlage: ein Fehler in einer einzigen
            // Vorlage darf nicht den kompletten Lauf zurückrollen — und darf auch
            // nicht die Vorlagen überspringen, die danach in der Liste stehen.
            // Eine gescheiterte Vorlage zählt als "wartend": ihr `nextDueOn` hat
            // sich nicht verändert, sie ist also weiterhin fällig und kommt beim
            // nächsten Lauf erneut dran — exakt das Verhalten, das "wartend"
            // schon für einen leeren Pool oder ein volles Limit beschreibt.
            try {
                if (assignInOwnTransaction(chore, today, lastAssignedInRun)) assigned++ else waiting++
            } catch (ex: Exception) {
                log.error("Ämtli '{}' ({}) im Ausgabelauf fehlgeschlagen", chore.name, chore.id, ex)
                waiting++
            }
        }
        log.info("Ämtli-Ausgabe: {} ausgegeben, {} wartend", assigned, waiting)
        return RefillResult(assigned = assigned, waiting = waiting)
    }

    /**
     * Sofortausgabe für genau eine Vorlage — beim Anlegen und beim Reaktivieren.
     * Sonst müsste man bis zum nächsten Morgen warten, um zu sehen, ob die
     * Aufgabe funktioniert.
     */
    fun refillChore(chore: Chore): Boolean = assignInOwnTransaction(chore, choreClock.today(), mutableMapOf())

    private fun assignInOwnTransaction(
        chore: Chore,
        today: LocalDate,
        lastAssignedInRun: MutableMap<String, UUID>,
    ): Boolean = transactionTemplate.execute { assignIfPossible(chore, today, lastAssignedInRun) } == true

    private fun assignIfPossible(
        chore: Chore,
        today: LocalDate,
        lastAssignedInRun: MutableMap<String, UUID>,
    ): Boolean {
        // Erneute Prüfung innerhalb der Transaktion: zwei gleichzeitige Läufe
        // würden sonst am partiellen Unique-Index scheitern statt hier sauber
        // abzubrechen.
        if (assignmentRepository.existsByChoreIdAndStatus(chore.id!!, STATUS_OPEN)) return false
        // Auch die Sofortausgabe (Anlegen, Reaktivieren) gibt nur Fälliges aus:
        // sonst käme eine gestern erledigte Wochenaufgabe nach Pausieren und
        // Reaktivieren sechs Tage zu früh zurück — Intervall ab letzter Erledigung.
        if (!chore.isActive || chore.nextDueOn.isAfter(today)) return false

        val pool = ChoreRotation.poolFor(chore.assignmentGroup, memberRepository.findByIsActiveTrueOrderByCreatedAtAsc())
        val openCounts =
            pool.associate { it.id!! to assignmentRepository.countByMemberIdAndStatus(it.id!!, STATUS_OPEN).toInt() }
        val memberId =
            ChoreRotation.selectNext(
                pool = pool.map { it.id!! },
                lastAssignedMemberId = lastAssignedInRun[chore.assignmentGroup] ?: chore.lastAssignedMemberId,
                openCounts = openCounts,
                maxOpen = maxOpenPerMember,
            ) ?: run {
                log.info("Ämtli '{}' wartet — kein freies Mitglied in Gruppe '{}'", chore.name, chore.assignmentGroup)
                return false
            }

        assignmentRepository.save(
            ChoreAssignment(
                choreId = chore.id!!,
                memberId = memberId,
                status = STATUS_OPEN,
                points = chore.points,
                assignedOn = today,
            ),
        )
        chore.lastAssignedMemberId = memberId
        lastAssignedInRun[chore.assignmentGroup] = memberId
        choreRepository.save(chore)
        return true
    }

    /**
     * Schritt 0 des Laufs: offene Zuweisungen deaktivierter Mitglieder geben die
     * Vorlage wieder frei. Das geschieht hier statt in `members`, damit das
     * Mitglieder-Modul nichts über Ämtli wissen muss.
     */
    private fun releaseOrphanedAssignments() {
        val activeIds = memberRepository.findByIsActiveTrueOrderByCreatedAtAsc().mapNotNull { it.id }.toSet()
        val orphaned = assignmentRepository.findAllByStatus(STATUS_OPEN).filter { it.memberId !in activeIds }
        if (orphaned.isNotEmpty()) {
            log.info("Ämtli-Ausgabe: {} Zuweisung(en) inaktiver Mitglieder freigegeben", orphaned.size)
            assignmentRepository.deleteAll(orphaned)
        }
    }
}
