#!/bin/sh
# Ставит или обновляет узел Книгописи из релиза на GitHub: скачивает сайт
# (вместе с архивом старой Книгописи) и готовый образ relay, затем перезапускает.
#
#   ./update.sh            — последний релиз
#   ./update.sh v0.2.0     — конкретный
#
# Ничего не собирает: ни Node, ни компилятор на сервере не нужны.
set -eu
cd "$(dirname "$0")"

REPO="${REPO:-gurov/knigopis-p2p}"
TAG="${1:-latest}"
SITE=knigopis-site.tar.gz
IMAGE=knigopis-relay-image-amd64.tar.gz

[ -f .env ] || { echo "Нет .env: скопируйте .env.example в .env и поправьте." >&2; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "==> Скачивание релиза ($TAG)"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
	# gh умеет и приватные репозитории.
	if [ "$TAG" = latest ]; then
		gh release download -R "$REPO" -p "$SITE" -p "$IMAGE" -D "$tmp"
	else
		gh release download "$TAG" -R "$REPO" -p "$SITE" -p "$IMAGE" -D "$tmp"
	fi
else
	if [ "$TAG" = latest ]; then base="https://github.com/$REPO/releases/latest/download"; else base="https://github.com/$REPO/releases/download/$TAG"; fi
	curl -fL --progress-bar -o "$tmp/$SITE" "$base/$SITE"
	curl -fL --progress-bar -o "$tmp/$IMAGE" "$base/$IMAGE"
fi

echo "==> Сайт → ./site"
rm -rf site.new
mkdir site.new
tar -xzf "$tmp/$SITE" -C site.new
rm -rf site
mv site.new site
# Каталоги — 755, файлы — 644: чтобы чужой веб-сервер (nginx) мог их читать.
chmod -R u=rwX,go=rX site

echo "==> Образ relay"
gunzip -c "$tmp/$IMAGE" | docker load

echo "==> Перезапуск"
docker compose up -d --no-build
docker compose ps
echo "Готово."
