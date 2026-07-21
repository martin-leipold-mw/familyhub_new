FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /workspace

COPY backend/gradle/ gradle/
COPY backend/gradlew backend/settings.gradle.kts backend/build.gradle.kts ./
RUN ./gradlew dependencies --no-daemon

COPY api/ /workspace/../api/
COPY backend/src/ src/
RUN ./gradlew bootJar --no-daemon -x test

FROM eclipse-temurin:21-jre-alpine AS runtime
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=build /workspace/build/libs/*.jar app.jar
RUN chown appuser:appgroup app.jar
USER appuser
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://localhost:8081/api/health || exit 1
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
