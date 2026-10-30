#!/usr/bin/env bash
# Собирает образ relay здесь, отвозит его на сервер и (пере)запускает relay.
# На сервере образ не собирается: strfry — это долгая сборка C++,
# а у сервера 1 vCPU и мало памяти.
#
# На сервере: /opt/knigopis/compose.yml + том knigopis_relay-data с базой.
set -euo pipefail

SERVER="${SERVER:-root@bizibah.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Сборка образа"
docker build -t knigopis-relay:latest "$ROOT/relay"

echo "==> Отправка образа"
docker save knigopis-relay:latest | gzip | ssh "$SERVER" 'gunzip | docker load'

echo "==> Запуск"
ssh "$SERVER" 'mkdir -p /opt/knigopis'
scp -q "$ROOT/deploy/compose.yml" "$SERVER:/opt/knigopis/compose.yml"
ssh "$SERVER" 'cd /opt/knigopis && docker compose up -d --no-build && docker compose ps'
echo "Готово."
