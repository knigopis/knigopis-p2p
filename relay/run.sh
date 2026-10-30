#!/bin/sh
# Точка входа контейнера relay.
#
#   без аргументов — relay и, если задан UPSTREAM, периодическая синхронизация
#                    (negentropy, в обе стороны) с другими узлами Книгописи;
#   с аргументами  — любая команда strfry: export, sync, scan…
#
# Синхронизация идёт в том же контейнере, что и relay: LMDB проверяет живость
# читателей по PID, и в отдельном контейнере (другое пространство PID) это
# работало бы ненадёжно.
#
# Переменные: UPSTREAM — адреса узлов через пробел (wss://…),
#             SYNC_INTERVAL — пауза между проходами в секундах (по умолчанию 600).
set -u

if [ $# -gt 0 ] && [ "$1" != relay ]; then
	exec /app/strfry "$@"
fi

/app/strfry relay &
RELAY=$!
trap 'kill -TERM "$RELAY" 2>/dev/null; wait "$RELAY"; exit 0' TERM INT

if [ -n "${UPSTREAM:-}" ]; then
	sleep 5 & wait $!
	while kill -0 "$RELAY" 2>/dev/null; do
		for url in $UPSTREAM; do
			/app/strfry sync "$url" --dir both 2>&1 | grep -E 'Writer:|DOWN:|UP:|error|Error' | tail -3 || true
		done
		sleep "${SYNC_INTERVAL:-600}" & wait $!
	done
fi

wait "$RELAY"
