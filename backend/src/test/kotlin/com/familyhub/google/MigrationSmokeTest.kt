package com.familyhub.google

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional

@Transactional
class MigrationSmokeTest
    @Autowired
    constructor(
        private val jdbc: JdbcTemplate,
    ) : BaseIntegrationTest() {
        @Test
        fun `google tables exist and settings seeded`() {
            val tables =
                jdbc.queryForList(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
                    String::class.java,
                )
            assertThat(tables).contains(
                "google_credentials",
                "google_connections",
                "calendar_subscriptions",
                "events",
            )
            val interval =
                jdbc.queryForObject(
                    "SELECT value FROM settings WHERE key='google.sync.interval.minutes'",
                    String::class.java,
                )
            assertThat(interval).isEqualTo("15")
        }
    }
