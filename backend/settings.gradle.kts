pluginManagement {
    repositories {
        gradlePluginPortal()
        maven("https://repo.maven.apache.org/maven2/")
    }
    resolutionStrategy {
        eachPlugin {
            if (requested.id.id == "org.openapi.generator") {
                useModule("org.openapitools:openapi-generator-gradle-plugin:${requested.version}")
            }
        }
    }
}

dependencyResolutionManagement {
    repositories {
        maven("https://repo.maven.apache.org/maven2/")
        mavenCentral()
    }
}

rootProject.name = "familyhub-backend"
