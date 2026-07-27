package com.familyhub

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.testcontainers.containers.PostgreSQLContainer

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@AutoConfigureMockMvc
@ActiveProfiles("integration")
abstract class BaseIntegrationTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    companion object {
        // Singleton container: started once for the whole test JVM and never
        // stopped (Ryuk reaps it at JVM exit). Using @Testcontainers/@Container
        // gives a per-class lifecycle — the container is stopped after the first
        // integration class's afterAll, so later classes reuse the cached Spring
        // context whose datasource points at a now-dead port and fail to connect.
        val postgres: PostgreSQLContainer<Nothing> =
            PostgreSQLContainer<Nothing>("postgres:16-alpine").apply {
                withDatabaseName("familyhub")
                withUsername("familyhub")
                withPassword("familyhub_test")
                start()
            }

        @JvmStatic
        @DynamicPropertySource
        fun configureProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
