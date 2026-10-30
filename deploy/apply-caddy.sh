#!/usr/bin/env bash
# Ставит блок knigopis из deploy/knigopis.caddy в /etc/caddy/Caddyfile,
# проверяет конфиг и перезагружает Caddy. Перед правкой рядом кладётся бэкап
# Caddyfile с меткой времени.
#
# Блок ограничен маркерами
#   # >>> knigopis ...
#   # <<< knigopis <<<
# и при повторных запусках заменяется целиком. При первом запуске маркеров ещё
# нет — блок дописывается в конец. Остальной Caddyfile не трогается.
# Идея та же, что у bizibah-com/deploy/apply-caddy.sh.
set -euo pipefail

SERVER="${SERVER:-root@bizibah.com}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> Отправка блока"
scp -q "$ROOT/deploy/knigopis.caddy" "$SERVER:/tmp/knigopis.caddy"

ssh "$SERVER" 'python3 - <<"PY"
import pathlib, shutil

cf = pathlib.Path("/etc/caddy/Caddyfile")
lines = cf.read_text(encoding="utf-8").split("\n")
new = pathlib.Path("/tmp/knigopis.caddy").read_text(encoding="utf-8").rstrip("\n").split("\n")

start = next((i for i, l in enumerate(lines) if l.startswith("# >>> knigopis")), None)
end = next((i for i, l in enumerate(lines) if l.startswith("# <<< knigopis")), None)
if start is not None and end is not None:
    result = lines[:start] + new + lines[end + 1:]
    print(f"    заменены строки {start + 1}..{end + 1}")
else:
    while lines and lines[-1] == "":
        lines.pop()
    result = lines + [""] + new + [""]
    print("    блок дописан в конец")

# Сначала рядом, в Caddyfile.new: на место он встанет только после проверки.
out = pathlib.Path("/etc/caddy/Caddyfile.new")
out.write_text("\n".join(result), encoding="utf-8")
shutil.copymode(cf, out)
PY'

echo "==> Проверка конфига"
# pipefail: без него код возврата был бы от tail, и ошибка проверки проходила бы.
if ! ssh "$SERVER" 'set -o pipefail; caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile.new 2>&1 | tail -3'; then
	ssh "$SERVER" 'rm -f /etc/caddy/Caddyfile.new'
	echo "СТОП: конфиг не прошёл проверку. Caddyfile не тронут, Caddy не перезагружался." >&2
	exit 1
fi

echo "==> Замена Caddyfile"
ssh "$SERVER" 'backup=/etc/caddy/Caddyfile.bak-$(date +%Y%m%d-%H%M%S) && cp -p /etc/caddy/Caddyfile "$backup" && mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile && echo "    бэкап: $backup"'

echo "==> Перезагрузка Caddy"
ssh "$SERVER" 'systemctl reload caddy && systemctl is-active caddy'
echo "Готово."
