package com.familyhub.google.calendar

/**
 * Personenfarben je Mitglieds-Token. Die HSL-Werte MÜSSEN identisch zu
 * `frontend/src/features/members/colors.ts` (MEMBER_COLORS) sein, damit ein
 * persönlicher Kalender exakt die Avatarfarbe seines Mitglieds trägt.
 */
object MemberColorPalette {
    val COLORS =
        mapOf(
            "blue" to "hsl(210 80% 70%)",
            "pink" to "hsl(340 75% 75%)",
            "green" to "hsl(140 60% 65%)",
            "purple" to "hsl(270 60% 70%)",
            "orange" to "hsl(30 85% 65%)",
            "teal" to "hsl(180 55% 60%)",
        )

    fun hex(token: String?): String = COLORS[token] ?: COLORS.getValue("blue")
}
