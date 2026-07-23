package com.familyhub.google.oauth

import com.google.api.client.http.javanet.NetHttpTransport
import com.google.api.client.json.gson.GsonFactory
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class GoogleApiClientFactory {

    /** Plain transport; per-request timeouts (connect 5 s / read 30 s) are set on each HttpRequest. */
    @Bean
    fun netHttpTransport(): NetHttpTransport = NetHttpTransport()

    @Bean
    fun gsonFactory(): GsonFactory = GsonFactory.getDefaultInstance()
}
