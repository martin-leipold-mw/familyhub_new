package com.familyhub.google.calendar

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class SharedCalendarPaletteTest {
    @Test
    fun `colorFor picks the palette entry at the calendar's position in the shared order`() {
        val order = listOf("birthdays", "holidays")

        assertThat(SharedCalendarPalette.colorFor("holidays", order)).isEqualTo(SharedCalendarPalette.COLORS[1])
    }

    @Test
    fun `colorFor falls back to the first palette color when the calendar is not in the shared order`() {
        assertThat(SharedCalendarPalette.colorFor("unknown", emptyList())).isEqualTo(SharedCalendarPalette.COLORS[0])
    }
}
