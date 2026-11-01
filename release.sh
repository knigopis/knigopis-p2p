#!/usr/bin/env bash
# Обновить главный узел на сервере: свежий compose, готовые образы из ghcr.io
# (их собирает GitHub Actions после push в master), перезапуск изменившихся контейнеров.
set -e
cd "$(dirname "$0")"
compose="docker-compose -p knigopis -f deployments/docker-compose.prod.yml"
git pull
$compose pull
$compose up -d
# Старые версии образов — в мусор, иначе диск кончается.
docker image prune -f
