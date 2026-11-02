#!/usr/bin/env bash
# Выпускает релиз на GitHub.
#
#   scripts/release.sh v0.3.0
#
# Файлы релиза — для зеркал сайта на статическом хостинге:
#   knigopis-site.tar.gz   — собранный сайт вместе с архивом
#   knigopis-legacy.tar.gz — только архив старой Книгописи (public/legacy)
# Образ узла по опубликованному релизу собирает GitHub Actions (.github/workflows/node.yml)
# и кладёт в ghcr.io/knigopis/knigopis-p2p/node с тегами версии и latest.
#
# Код должен быть закоммичен и запушен: тег ставится на HEAD.
set -euo pipefail

TAG="${1:?usage: release.sh <tag>}"
REPO="${REPO:-knigopis/knigopis-p2p}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git diff --quiet HEAD; then
	echo "Есть незакоммиченные изменения." >&2
	exit 1
fi
if [ "$(git rev-parse HEAD)" != "$(git rev-parse '@{u}')" ]; then
	echo "HEAD не запушен." >&2
	exit 1
fi
[ -f public/legacy/index.json ] || scripts/legacy.sh

out="$(mktemp -d -p "${XDG_CACHE_HOME:-$HOME/.cache}" knigopis-release.XXXXXX)"
trap 'rm -rf "$out" "$ROOT/dist"' EXIT

echo "==> Сайт"
npm run build
tar -czf "$out/knigopis-site.tar.gz" -C dist .
tar -czf "$out/knigopis-legacy.tar.gz" -C public legacy

ls -lh "$out"

echo "==> Релиз $TAG"
gh release create "$TAG" -R "$REPO" --target "$(git rev-parse HEAD)" --title "$TAG" \
	--notes "Узел Книгописи — образ ghcr.io/knigopis/knigopis-p2p/node:$TAG, см. selfhost/README.md. Архив старой Книгописи — состояние repo2.knigopis.com на $(jq -r .builtAt public/legacy/index.json | cut -c1-10) (коммит $(jq -r .commit public/legacy/index.json | cut -c1-8))." \
	"$out"/*.tar.gz
git fetch -q --tags
echo "Готово."
