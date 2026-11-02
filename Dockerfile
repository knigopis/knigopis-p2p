# Образы Книгописи из одного файла (контекст — корень репозитория):
#
#   docker build -t knigopis-node .                    узел: сайт, архив, relay и Caddy
#   docker build --target relay -t knigopis-relay:dev .  только relay (npm run relay)
#
# Готовый узел собирает GitHub Actions на каждый релиз (.github/workflows/node.yml)
# и кладёт в ghcr.io/knigopis/knigopis-p2p/node. Как ставить — selfhost/README.md.

# --- strfry из исходников на закреплённом теге. Пакеты — как в Dockerfile самого strfry.
FROM alpine:3.18 AS strfry
ARG STRFRY_REF=1.1.3
RUN apk --no-cache add \
    linux-headers git g++ make perl pkgconfig libtool ca-certificates \
    libressl-dev zlib-dev lmdb-dev flatbuffers-dev libsecp256k1-dev zstd-dev
WORKDIR /build
RUN git clone --depth 1 --branch "$STRFRY_REF" https://github.com/hoytech/strfry.git . \
 && git submodule update --init
RUN make setup-golpe && make -j"$(nproc)"

# --- Relay: strfry + плагин политики записи + синхронизация с другими узлами (run.sh).
FROM alpine:3.18 AS relay
# python3 — для плагина политики записи.
RUN apk --no-cache add lmdb flatbuffers libsecp256k1 libb2 zstd libressl python3 \
 && adduser -D -h /app -s /bin/sh strfry
WORKDIR /app
COPY --from=strfry /build/strfry /app/strfry
COPY relay/strfry.conf /app/strfry.conf
COPY relay/write-policy.py relay/run.sh /app/
# Каталог базы создаётся заранее: именованный том Docker унаследует владельца.
RUN chmod 755 /app/write-policy.py /app/run.sh && mkdir /app/strfry-db && chown strfry:strfry /app/strfry-db
USER strfry
EXPOSE 7777
# run.sh: relay + синхронизация с UPSTREAM; с аргументами — просто команда strfry.
ENTRYPOINT ["/app/run.sh"]

# --- Архив старой Книгописи из repo2. Данные заморожены, слой берётся из кеша,
# пока не поменялся pack-legacy.mjs.
FROM node:24-slim AS legacy
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /build
COPY scripts/pack-legacy.mjs ./
RUN git clone -q --depth 1 https://github.com/knigopis/repo2.knigopis.com.git /tmp/repo2 \
 && node pack-legacy.mjs /tmp/repo2 /build/legacy \
 && rm -rf /tmp/repo2

# --- Сайт (PWA).
FROM node:24-slim AS site
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# --- Узел: всё вместе в одном контейнере. Caddy работает от root (порты 80/443),
# strfry — от своего пользователя (su-exec), tini передаёт сигналы обоим.
FROM relay AS node
USER root
RUN apk --no-cache add tini su-exec \
 # strfry снаружи контейнера не виден: к нему ходит только Caddy.
 && sed -i 's/bind = "0.0.0.0"/bind = "127.0.0.1"/' /app/strfry.conf \
 && mkdir -p /data /config
COPY --from=caddy:2 /usr/bin/caddy /usr/bin/caddy
COPY --from=site /app/dist /srv
COPY --from=legacy /build/legacy /srv/legacy
COPY src/known-relays.json node/routes.caddy node/start.sh /app/
RUN chmod 755 /app/start.sh
# Сертификаты и состояние Caddy — в /data (том).
ENV XDG_DATA_HOME=/data XDG_CONFIG_HOME=/config
EXPOSE 80 443 443/udp
ENTRYPOINT ["/sbin/tini", "-g", "--", "/app/start.sh"]
