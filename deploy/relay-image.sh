#!/usr/bin/env bash
# Собирает образ relay здесь, отвозит его на сервер и (пере)запускает relay.
# На сервере образ не собирается: strfry — это долгая сборка C++,
# а у сервера 1 vCPU и мало памяти.
#
# На сервере: /opt/knigopis/compose.yml (= selfhost/compose.yml без профиля web:
# веб-сервер там свой, Caddy) + том knigopis_relay-data с базой.
set -euo pipefail

SERVER="${SERVER:-root@bizibah.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Сборка образа"
docker build -t knigopis-relay:latest "$ROOT/relay"

echo "==> Отправка образа"
old="$(ssh "$SERVER" 'docker images -q knigopis-relay:latest')"
docker save knigopis-relay:latest | gzip | ssh "$SERVER" 'gunzip | docker load'

echo "==> Запуск"
ssh "$SERVER" 'mkdir -p /opt/knigopis'
scp -q "$ROOT/selfhost/compose.yml" "$SERVER:/opt/knigopis/compose.yml"
ssh "$SERVER" 'cd /opt/knigopis && docker compose up -d --no-build && docker compose ps'

# Прежний образ больше не нужен (чужие висячие образы не трогаем).
new="$(ssh "$SERVER" 'docker images -q knigopis-relay:latest')"
if [ -n "$old" ] && [ "$old" != "$new" ]; then
	ssh "$SERVER" "docker rmi $old >/dev/null && echo '    удалён прежний образ $old'" || true
fi
echo "Готово."
