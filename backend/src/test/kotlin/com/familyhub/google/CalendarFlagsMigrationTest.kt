package com.familyhub.google

import com.familyhub.BaseIntegrationTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.annotation.Transactional

@Transactional
class CalendarFlagsMigrationTest
    @Autowired
    constructor(
        private val jdbc: JdbcTemplate,
    ) : BaseIntegrationTest() {
        @Test
        fun `V10 adds is_shared and is_write_target columns`() {
            val cols =
                jdbc.queryForList(
                    "SELECT column_name FROM information_schema.columns " +
                        "WHERE table_name = 'calendar_subscriptions'",
                    String::class.java,
                )
            assertThat(cols).contains("is_shared", "is_write_target")
        }

        @Test
        fun `V10 creates the partial unique write-target index`() {
            val indexes =
                jdbc.queryForList(
                    "SELECT indexname FROM pg_indexes WHERE tablename = 'calendar_subscriptions'",
                    String::class.java,
                )
            assertThat(indexes).contains("idx_calendar_subscriptions_write_target")
        }
    }
