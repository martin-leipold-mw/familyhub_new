package com.familyhub.google.calendar

/**
 * Farben für geteilte/Familien-Kalender. Bewusst kräftiger/anders als die
 * pastellige Mitglieds-Palette, damit "nicht Person" sofort erkennbar ist.
 * Die Zuordnung ist deterministisch: geteilte Kalender werden global stabil
 * nach google_calendar_id sortiert; der Index (modulo Palettengröße) wählt die
 * Farbe. Derselbe geteilte Kalender bekommt so bei jedem Konto dieselbe Farbe.
 */
object SharedCalendarPalette {
    val COLORS =
        listOf(
            "hsl(45 90% 55%)", // Bernstein
            "hsl(0 0% 62%)", // Neutralgrau
            "hsl(255 35% 58%)", // Indigo
            "hsl(160 45% 45%)", // Smaragd
            "hsl(15 68% 55%)", // Terrakotta
            "hsl(205 25% 52%)", // Stahlblau
        )

    fun colorFor(
        calendarId: String,
        sharedOrder: List<String>,
    ): String {
        val idx = sharedOrder.indexOf(calendarId).let { if (it < 0) 0 else it }
        return COLORS[idx % COLORS.size]
    }
}
