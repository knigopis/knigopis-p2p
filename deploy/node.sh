#!/usr/bin/env bash
# Главный узел www.knigopis.com на сервере: selfhost/compose.proxy.yml в /opt/knigopis,
# узел слушает 127.0.0.1:8080, снаружи — Caddy сервера (deploy/knigopis.caddy,
# deploy/apply-caddy.sh). Записи — в томе knigopis_relay-data.
#
#   deploy/node.sh           свежий образ из ghcr.io (после релиза) и перезапуск
#   deploy/node.sh --local   образ собрать здесь и отвезти на сервер — без релиза
#                            или пока пакет в реестре приватный
set -euo pipefail

SERVER="${SERVER:-root@bizibah.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE=ghcr.io/knigopis/knigopis-p2p/node:latest

old="$(ssh "$SERVER" "docker images -q $IMAGE")"

if [ "${1:-}" = --local ]; then
	echo "==> Сборка образа"
	docker build -q -t "$IMAGE" "$ROOT" >/dev/null
	echo "==> Отправка образа"
	docker save "$IMAGE" | gzip | ssh "$SERVER" 'gunzip | docker load'
fi

echo "==> Настройки"
ssh "$SERVER" 'mkdir -p /opt/knigopis'
scp -q "$ROOT/selfhost/compose.proxy.yml" "$SERVER:/opt/knigopis/compose.yml"
ssh "$SERVER" 'cd /opt/knigopis && { [ -f .env ] || echo "DOMAIN=www.knigopis.com" > .env; }'

echo "==> Запуск"
if [ "${1:-}" != --local ]; then
	ssh "$SERVER" 'cd /opt/knigopis && docker compose pull -q'
fi
ssh "$SERVER" 'cd /opt/knigopis && docker compose up -d --remove-orphans && docker compose ps'

# Прежний образ узла больше не нужен (чужие образы не трогаем).
new="$(ssh "$SERVER" "docker images -q $IMAGE")"
if [ -n "$old" ] && [ "$old" != "$new" ]; then
	ssh "$SERVER" "docker rmi $old >/dev/null && echo '    удалён прежний образ $old'" || true
fi
echo "Готово."
