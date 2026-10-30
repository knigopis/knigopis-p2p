# Relay Книгописи: strfry + плагин политики записи (write-policy.py).
#
# strfry собирается из исходников на закреплённом теге. Сборка долгая (C++ и
# кодогенерация golpe), поэтому на маленьком сервере её не запускать: собрать
# на своей машине (deploy/relay-image.sh) и привезти готовый образ.
# Базовый образ и пакеты — как в Dockerfile самого strfry.

FROM alpine:3.18 AS build

ARG STRFRY_REF=1.1.3

RUN apk --no-cache add \
    linux-headers git g++ make perl pkgconfig libtool ca-certificates \
    libressl-dev zlib-dev lmdb-dev flatbuffers-dev libsecp256k1-dev zstd-dev

WORKDIR /build
RUN git clone --depth 1 --branch "$STRFRY_REF" https://github.com/hoytech/strfry.git . \
 && git submodule update --init
RUN make setup-golpe && make -j"$(nproc)"

FROM alpine:3.18

# python3 — для плагина политики записи.
RUN apk --no-cache add lmdb flatbuffers libsecp256k1 libb2 zstd libressl python3 \
 && adduser -D -h /app -s /bin/sh strfry

WORKDIR /app
COPY --from=build /build/strfry /app/strfry
COPY strfry.conf /app/strfry.conf
COPY write-policy.py /app/write-policy.py
# Каталог базы создаётся заранее: именованный том Docker унаследует владельца.
RUN chmod 755 /app/write-policy.py && mkdir /app/strfry-db && chown strfry:strfry /app/strfry-db

USER strfry
EXPOSE 7777
ENTRYPOINT ["/app/strfry"]
CMD ["relay"]
