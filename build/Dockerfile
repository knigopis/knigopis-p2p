# Сайт Книгописи: сборка PWA и архива старой Книгописи + Caddy, который раздаёт
# статику и разводит WebSocket/NIP-11 на relay. Работает за nginx-proxy (HTTPS там),
# сам слушает только HTTP:80. Собирается из deployments/docker-compose.*.yml.

# Архив старой Книгописи из repo2. Данные заморожены (старый API мёртв), поэтому
# слой кешируется и пересобирается, только если поменялся pack-legacy.mjs.
# Принудительно обновить: docker-compose ... build --no-cache web
FROM node:22-slim AS legacy
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY scripts/pack-legacy.mjs ./
RUN git clone -q --depth 1 https://github.com/knigopis/repo2.knigopis.com.git /tmp/repo2 \
 && node pack-legacy.mjs /tmp/repo2 /build/legacy \
 && rm -rf /tmp/repo2

# PWA.
FROM node:22-slim AS site
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM caddy:2
COPY selfhost/Caddyfile.nginx-proxy /etc/caddy/Caddyfile
COPY selfhost/Caddyfile /etc/caddy/site.caddy
COPY --from=site /app/dist /srv
COPY --from=legacy /build/legacy /srv/legacy
EXPOSE 80
