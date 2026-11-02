#!/usr/bin/env python3
"""Политика записи relay Книгописи (плагин strfry, см. docs/plugins.md в strfry).

strfry передаёт по строке JSON на каждое новое событие и ждёт строку с решением.
Принимаем только события, которые нужны Книгописи, и режем частоту по адресу:
импорт старого архива — это сотни событий подряд, поэтому запас большой.
Когда на диске кончается место, новые события не принимаем вовсе — иначе спам
уронил бы и relay, и всё остальное на сервере.
Номера kind должны совпадать с src/lib/config.ts.

Переменные: MIN_FREE_MB — сколько места оставлять свободным (по умолчанию 500).
"""
import ipaddress
import json
import os
import sys
import time

KIND_BOOK = 31110
KIND_WISH = 31111
KIND_CLAIM = 31112

ALLOWED_KINDS = {0, 3, 5, 10002, KIND_BOOK, KIND_WISH, KIND_CLAIM}

# Ведро на адрес: сколько событий можно отправить разом и сколько добавляется в секунду.
# У IPv6 ведро одно на сеть /64: столько адресов провайдер обычно выдаёт одному
# клиенту, и с отдельным ведром на адрес лимита не было бы вовсе.
BUCKET_SIZE = 3000
REFILL_PER_SEC = 2.0
# Ведро, к которому не обращались дольше, чем оно наполняется с нуля, — полное:
# его можно забыть, иначе словарь растёт с каждым новым адресом.
FORGET_AFTER = BUCKET_SIZE / REFILL_PER_SEC
CLEANUP_EVERY = 300

DB_DIR = "./strfry-db"
MIN_FREE_BYTES = int(os.environ.get("MIN_FREE_MB", "500")) * 1024 * 1024
DISK_CHECK_EVERY = 10

MAX_CONTENT = {0: 4000, KIND_BOOK: 20000, KIND_WISH: 20000}

buckets = {}
last_cleanup = time.monotonic()
disk = {"checked": 0.0, "full": False}


def bucket_key(ip):
    """Адрес IPv4 как есть, IPv6 — его сеть /64."""
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return ip
    if addr.version == 6:
        if addr.ipv4_mapped:
            return str(addr.ipv4_mapped)
        return str(ipaddress.ip_network(f"{addr}/64", strict=False))
    return str(addr)


def take(key, now):
    """Списать одно событие из ведра; False — ведро пустое."""
    global last_cleanup
    if now - last_cleanup > CLEANUP_EVERY:
        for k in [k for k, (_, last) in buckets.items() if now - last > FORGET_AFTER]:
            del buckets[k]
        last_cleanup = now
    level, last = buckets.get(key, (BUCKET_SIZE, now))
    level = min(BUCKET_SIZE, level + (now - last) * REFILL_PER_SEC)
    if level < 1:
        buckets[key] = (level, now)
        return False
    buckets[key] = (level - 1, now)
    return True


def disk_full(now):
    if now - disk["checked"] > DISK_CHECK_EVERY:
        disk["checked"] = now
        try:
            st = os.statvfs(DB_DIR if os.path.isdir(DB_DIR) else ".")
            disk["full"] = st.f_bavail * st.f_frsize < MIN_FREE_BYTES
        except OSError:
            disk["full"] = False
    return disk["full"]


def tag_value(event, name):
    for tag in event.get("tags", []):
        if len(tag) >= 2 and tag[0] == name:
            return tag[1]
    return None


def check(req):
    event = req["event"]
    kind = event.get("kind")

    if kind not in ALLOWED_KINDS:
        return "blocked: этот relay принимает только события Книгописи"

    if len(event.get("content", "")) > MAX_CONTENT.get(kind, 2000):
        return "invalid: слишком длинный текст"

    if kind in (KIND_BOOK, KIND_WISH, KIND_CLAIM) and not tag_value(event, "d"):
        return "invalid: нет тега d"

    if kind in (KIND_BOOK, KIND_WISH):
        deleted = tag_value(event, "deleted") is not None
        if not deleted and not (tag_value(event, "title") or "").strip():
            return "invalid: у книги нет названия"

    now = time.monotonic()
    if disk_full(now):
        return "blocked: на сервере кончается место, запись временно закрыта"

    # Синхронизация между relay и импорт администратором частоту не ограничивают.
    if req.get("sourceType") in ("IP4", "IP6"):
        if not take(bucket_key(req.get("sourceInfo", "")), now):
            return "rate-limited: слишком много событий, попробуйте позже"

    return None


def main():
    for line in sys.stdin:
        try:
            req = json.loads(line)
        except ValueError:
            print("write-policy: не JSON", file=sys.stderr, flush=True)
            continue

        if req.get("type") != "new":
            continue

        reason = check(req)
        res = {"id": req["event"]["id"], "action": "accept" if reason is None else "reject"}
        if reason is not None:
            res["msg"] = reason
        print(json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
