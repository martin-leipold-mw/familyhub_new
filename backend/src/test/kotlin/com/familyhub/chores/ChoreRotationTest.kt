package com.familyhub.chores

import com.familyhub.members.FamilyMember
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import java.util.UUID

class ChoreRotationTest {
    private fun member(
        name: String,
        role: String,
    ) = FamilyMember(name = name, role = role, color = "blue").also { it.id = UUID.randomUUID() }

    private val papa = member("Papa", "parent")
    private val mama = member("Mama", "parent")
    private val anna = member("Anna", "child")
    private val ben = member("Ben", "child")

    // Reihenfolge = Anlagedatum; die Repository-Abfrage liefert genau diese.
    private val all = listOf(papa, mama, anna, ben)

    // ─── poolFor ──────────────────────────────────────────────────────────────

    @Test
    fun `parents liefert nur Eltern`() {
        assertThat(ChoreRotation.poolFor(GROUP_PARENTS, all)).containsExactly(papa, mama)
    }

    @Test
    fun `children liefert nur Kinder`() {
        assertThat(ChoreRotation.poolFor(GROUP_CHILDREN, all)).containsExactly(anna, ben)
    }

    @Test
    fun `all liefert alle aktiven Mitglieder in unveraenderter Reihenfolge`() {
        assertThat(ChoreRotation.poolFor(GROUP_ALL, all)).containsExactly(papa, mama, anna, ben)
    }

    // ─── selectNext ───────────────────────────────────────────────────────────

    private fun ids(vararg m: FamilyMember) = m.map { it.id!! }

    @Test
    fun `ohne Zeiger beginnt die Rotation vorne`() {
        val chosen = ChoreRotation.selectNext(ids(papa, mama), null, emptyMap(), 5)

        assertThat(chosen).isEqualTo(papa.id)
    }

    @Test
    fun `der Zeiger rueckt eine Position weiter`() {
        val chosen = ChoreRotation.selectNext(ids(papa, mama, anna), papa.id, emptyMap(), 5)

        assertThat(chosen).isEqualTo(mama.id)
    }

    @Test
    fun `hinter dem letzten Mitglied beginnt die Rotation wieder vorne`() {
        val chosen = ChoreRotation.selectNext(ids(papa, mama), mama.id, emptyMap(), 5)

        assertThat(chosen).isEqualTo(papa.id)
    }

    @Test
    fun `ein nicht mehr im Pool stehender Zeiger beginnt wieder vorne`() {
        val gone = UUID.randomUUID()

        val chosen = ChoreRotation.selectNext(ids(papa, mama), gone, emptyMap(), 5)

        assertThat(chosen).isEqualTo(papa.id)
    }

    @Test
    fun `ein volles Mitglied wird uebersprungen`() {
        val counts = mapOf(mama.id!! to 5)

        val chosen = ChoreRotation.selectNext(ids(papa, mama, anna), papa.id, counts, 5)

        assertThat(chosen).isEqualTo(anna.id)
    }

    @Test
    fun `ein Mitglied knapp unter dem Limit kommt dran`() {
        val counts = mapOf(mama.id!! to 4)

        val chosen = ChoreRotation.selectNext(ids(papa, mama), papa.id, counts, 5)

        assertThat(chosen).isEqualTo(mama.id)
    }

    @Test
    fun `sind alle voll gibt es keine Zuweisung`() {
        val counts = mapOf(papa.id!! to 5, mama.id!! to 5)

        val chosen = ChoreRotation.selectNext(ids(papa, mama), null, counts, 5)

        assertThat(chosen).isNull()
    }

    @Test
    fun `ein leerer Pool gibt keine Zuweisung`() {
        val chosen = ChoreRotation.selectNext(emptyList(), null, emptyMap(), 5)

        assertThat(chosen).isNull()
    }
}
