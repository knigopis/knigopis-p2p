#!/usr/bin/env bash
# Пересобирает архив public/legacy из repo2.knigopis.com.
#
#   scripts/legacy.sh              — клонирует repo2 во временный каталог вне проекта
#                                    и удаляет его после упаковки;
#   scripts/legacy.sh <путь>       — берёт уже имеющийся клон.
#
# Клон repo2 — 44 тыс. файлов. Внутри проекта его держать нельзя: Vite и редакторы
# следят за файлами через inotify, а лимит на машине ~61 тыс. наблюдений.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-}"

if [ -z "$SRC" ]; then
	base="${XDG_CACHE_HOME:-$HOME/.cache}"
	mkdir -p "$base"
	tmp="$(mktemp -d -p "$base" knigopis-repo2.XXXXXX)"
	trap 'rm -rf "$tmp"' EXIT
	echo "==> Клонирую repo2 в $tmp"
	git clone -q --depth 1 https://github.com/knigopis/repo2.knigopis.com.git "$tmp/repo2"
	SRC="$tmp/repo2"
fi

echo "==> Упаковка"
node "$ROOT/scripts/pack-legacy.mjs" "$SRC" "$ROOT/public/legacy"
