package com.familyhub.shared.config

import com.fasterxml.jackson.databind.ObjectMapper
import com.familyhub.pin.PinSessionInterceptor
import com.familyhub.pin.PinSessionService
import com.familyhub.settings.SettingRepository
import org.springframework.beans.factory.ObjectProvider
import org.springframework.context.annotation.Configuration
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

// Registers PinSessionInterceptor on the /api path space.
//
// The interceptor is deliberately NOT a @Component: @WebMvcTest's type filter
// includes HandlerInterceptor beans, so a component-scanned interceptor would be
// instantiated in every controller slice and fail (its PinSessionService and
// SettingRepository dependencies are not present in a web slice). Instead this
// configuration constructs the interceptor itself, pulling those dependencies via
// ObjectProvider: absent in @WebMvcTest slices (so no interceptor is registered
// there), present in the full application context (so PIN enforcement is active).
@Configuration
class InterceptorConfig(
    private val pinSessionServiceProvider: ObjectProvider<PinSessionService>,
    private val settingRepositoryProvider: ObjectProvider<SettingRepository>,
    private val objectMapper: ObjectMapper,
) : WebMvcConfigurer {

    override fun addInterceptors(registry: InterceptorRegistry) {
        val pinSessionService = pinSessionServiceProvider.getIfAvailable() ?: return
        val settingRepository = settingRepositoryProvider.getIfAvailable() ?: return
        registry.addInterceptor(
            PinSessionInterceptor(pinSessionService, settingRepository, objectMapper),
        ).addPathPatterns("/api/**")
    }
}
