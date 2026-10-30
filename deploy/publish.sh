#!/usr/bin/env bash
# Собирает PWA (вместе с архивом из public/legacy) и выкладывает на сервер.
# rsync идёт с --delete: в /var/www/knigopis-site ничего постороннего не держать.
set -euo pipefail

SERVER="${SERVER:-root@bizibah.com}"
DEST="${DEST:-/var/www/knigopis-site}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f public/legacy/index.json ]; then
	echo "Нет архива: сначала npm run legacy." >&2
	exit 1
fi

echo "==> Сборка"
npm run build

echo "==> Выкладка в $SERVER:$DEST"
ssh "$SERVER" "mkdir -p '$DEST'"
rsync -az --delete --chmod=D755,F644 dist/ "$SERVER:$DEST/"

# dist/ — копия архива на 4 тыс. файлов; после выкладки она не нужна.
rm -rf dist
echo "Готово."
