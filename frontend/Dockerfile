FROM node:20-alpine AS build
WORKDIR /app

COPY frontend/package*.json ./
RUN npm ci

COPY api/ /api/
COPY frontend/ .
RUN npm run generate:api
RUN npm run build

FROM nginx:1.27-alpine AS runtime
RUN addgroup -S nginx-app && adduser -S nginx-user -G nginx-app
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1
