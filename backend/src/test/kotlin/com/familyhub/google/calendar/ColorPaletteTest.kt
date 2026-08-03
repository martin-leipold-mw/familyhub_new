package com.familyhub.google.calendar

import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test

class ColorPaletteTest {
    @Test
    fun `member palette maps known token to its hsl`() {
        assertThat(MemberColorPalette.hex("green")).isEqualTo("hsl(140 60% 65%)")
    }

    @Test
    fun `member palette falls back to blue for null or unknown token`() {
        assertThat(MemberColorPalette.hex(null)).isEqualTo("hsl(210 80% 70%)")
        assertThat(MemberColorPalette.hex("chartreuse")).isEqualTo("hsl(210 80% 70%)")
    }

    @Test
    fun `shared palette picks by position in the sorted shared order`() {
        val order = listOf("a-cal", "b-cal", "c-cal")
        assertThat(SharedCalendarPalette.colorFor("a-cal", order)).isEqualTo(SharedCalendarPalette.COLORS[0])
        assertThat(SharedCalendarPalette.colorFor("b-cal", order)).isEqualTo(SharedCalendarPalette.COLORS[1])
    }

    @Test
    fun `shared palette wraps around with modulo`() {
        val order = (0..SharedCalendarPalette.COLORS.size).map { "cal-$it" }
        // the (size+1)-th shared calendar wraps back to COLORS[0]
        val wrapping = order.last()
        assertThat(SharedCalendarPalette.colorFor(wrapping, order))
            .isEqualTo(SharedCalendarPalette.COLORS[SharedCalendarPalette.COLORS.size % SharedCalendarPalette.COLORS.size])
    }

    @Test
    fun `shared palette is deterministic for the same calendar id across callers`() {
        val order = listOf("holidays", "birthdays", "school")
        assertThat(SharedCalendarPalette.colorFor("birthdays", order))
            .isEqualTo(SharedCalendarPalette.colorFor("birthdays", order))
    }
}
