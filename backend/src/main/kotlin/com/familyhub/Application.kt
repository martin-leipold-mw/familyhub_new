package com.familyhub

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class FamilyHubApplication

fun main(args: Array<String>) {
    runApplication<FamilyHubApplication>(*args)
}
