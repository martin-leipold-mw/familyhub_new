package com.familyhub.chores

import com.familyhub.members.FamilyMember
import java.util.UUID

/**
 * Reihum-Rotation, ohne Spring und ohne Datenbank — damit sie erschöpfend
 * testbar bleibt. Der Aufrufer liefert den Pool in stabiler Reihenfolge
 * (`findByIsActiveTrueOrderByCreatedAtAsc`) und die Zahl der offenen
 * Zuweisungen je Mitglied.
 */
object ChoreRotation {
    fun poolFor(
        group: String,
        activeMembers: List<FamilyMember>,
    ): List<FamilyMember> =
        when (group) {
            GROUP_PARENTS -> activeMembers.filter { it.role == "parent" }
            GROUP_CHILDREN -> activeMembers.filter { it.role == "child" }
            else -> activeMembers
        }

    /**
     * Liefert das nächste Mitglied der Rotation oder `null`, wenn der Pool leer
     * ist oder alle am Limit stehen. Wer am Limit steht, wird übersprungen —
     * das ist kein entgangener Turnus, sondern der Lastausgleich selbst: der
     * Zeiger rückt nur bei tatsächlicher Ausgabe weiter.
     */
    fun selectNext(
        pool: List<UUID>,
        lastAssignedMemberId: UUID?,
        openCounts: Map<UUID, Int>,
        maxOpen: Int,
    ): UUID? {
        if (pool.isEmpty()) return null
        // indexOfFirst liefert -1, wenn der Zeiger null ist oder das Mitglied
        // nicht mehr im Pool steht — beides landet über (-1 + 1) auf Position 0.
        val start = (pool.indexOfFirst { it == lastAssignedMemberId } + 1) % pool.size
        for (offset in pool.indices) {
            val candidate = pool[(start + offset) % pool.size]
            if ((openCounts[candidate] ?: 0) < maxOpen) return candidate
        }
        return null
    }
}
