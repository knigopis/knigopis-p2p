#!/bin/sh
# Точка входа узла Книгописи: relay (strfry с синхронизацией) и Caddy в одном
# контейнере. Если любой из них завершился, выходит и контейнер, а Docker его
# перезапускает (restart: unless-stopped).
#
# Переменные (.env):
#   DOMAIN        адрес узла, например books.example.org (обязательно);
#   REDIRECT_FROM адреса через запятую, которые перенаправляются на DOMAIN;
#   BEHIND_PROXY  1 — HTTPS делает внешний веб-сервер (nginx, Caddy, nginx-proxy):
#                 Caddy слушает только HTTP на 80 и берёт адрес клиента из
#                 X-Forwarded-For, но только от прокси с частного адреса;
#   UPSTREAM      узлы для синхронизации через пробел. По умолчанию — все известные
#                 на момент сборки образа, кроме себя; none — не синхронизироваться;
#   SYNC_INTERVAL пауза между синхронизациями, секунд (600).
set -eu

DOMAIN=$(printf '%s' "${DOMAIN:-}" | sed -e 's#^[a-zA-Z]*://##' -e 's#/.*##')
if [ -z "$DOMAIN" ]; then
	echo "Задайте DOMAIN в .env — адрес узла, например books.example.org" >&2
	exit 1
fi
REDIRECT_FROM=$(printf '%s' "${REDIRECT_FROM:-}" | tr ',' ' ' | xargs)

case "${UPSTREAM:-}" in
	none) UPSTREAM= ;;
	'') UPSTREAM=$(python3 -c '
import json, sys
own = "wss://" + sys.argv[1]
print(" ".join(u for u in json.load(open("/app/known-relays.json")) if u.rstrip("/") != own))
' "$DOMAIN") ;;
esac
export UPSTREAM

CONFIG=/config/Caddyfile
case "${BEHIND_PROXY:-}" in
	1 | true | yes)
		mode="за прокси: HTTP на порту 80 контейнера"
		{
			echo '{'
			echo '	auto_https off'
			echo '	servers {'
			# Адрес клиента — из X-Forwarded-For, но только от прокси из частной сети
			# (Docker, localhost). strict — самый правый недоверенный адрес: левые
			# значения клиент может подставить сам.
			echo '		trusted_proxies static private_ranges'
			echo '		trusted_proxies_strict'
			echo '		client_ip_headers X-Forwarded-For'
			echo '	}'
			echo '}'
			# Любой Host: внешний прокси может его и не передать.
			echo ':80 {'
			if [ -n "$REDIRECT_FROM" ]; then
				echo "	@redirect host $REDIRECT_FROM"
				echo "	redir @redirect https://$DOMAIN{uri} permanent"
			fi
			echo '	import /app/routes.caddy'
			echo '}'
		} >"$CONFIG"
		;;
	*)
		mode="свой HTTPS, сертификат Caddy получит сам"
		{
			echo "$DOMAIN {"
			echo '	import /app/routes.caddy'
			echo '}'
			if [ -n "$REDIRECT_FROM" ]; then
				echo "$(echo "$REDIRECT_FROM" | sed 's/ /, /g') {"
				echo "	redir https://$DOMAIN{uri} permanent"
				echo '}'
			fi
		} >"$CONFIG"
		;;
esac

echo "Узел Книгописи: $DOMAIN, $mode."
echo "Синхронизация: ${UPSTREAM:-выключена}."

# Дальше без set -e: прерванные сигналом sleep и wait не должны обрывать скрипт.
set +e
su-exec strfry /app/run.sh &
RELAY=$!
caddy run --config "$CONFIG" --adapter caddyfile &
CADDY=$!

stopping=0
trap 'stopping=1; kill -TERM "$RELAY" "$CADDY" 2>/dev/null || true' TERM INT
while kill -0 "$RELAY" 2>/dev/null && kill -0 "$CADDY" 2>/dev/null; do
	sleep 2
done
kill -TERM "$RELAY" "$CADDY" 2>/dev/null || true
wait
[ "$stopping" = 1 ] && exit 0
echo "Relay или Caddy завершился — контейнер выходит, Docker его перезапустит." >&2
exit 1
