#!/usr/bin/env bash
# Обновить главный узел на сервере: свежий код и пересборка изменившихся образов.
# Первая сборка relay (компиляция strfry) — 10–30 минут, дальше — из кеша Docker.
set -e
cd "$(dirname "$0")"
git pull && docker-compose -p knigopis -f deployments/docker-compose.prod.yml up -d --build
