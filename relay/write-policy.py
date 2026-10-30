#!/usr/bin/env python3
"""Политика записи relay Книгописи (плагин strfry, см. docs/plugins.md в strfry).

strfry передаёт по строке JSON на каждое новое событие и ждёт строку с решением.
Принимаем только события, которые нужны Книгописи, и режем частоту по IP:
импорт старого архива — это сотни событий подряд, поэтому запас большой.
Номера kind должны совпадать с src/lib/config.ts.
"""
import json
import sys
import time

KIND_BOOK = 31110
KIND_WISH = 31111
KIND_CLAIM = 31112

ALLOWED_KINDS = {0, 3, 5, 10002, KIND_BOOK, KIND_WISH, KIND_CLAIM}

# Ведро на IP: сколько событий можно отправить разом и сколько добавляется в секунду.
BUCKET_SIZE = 3000
REFILL_PER_SEC = 2.0

MAX_CONTENT = {0: 4000, KIND_BOOK: 20000, KIND_WISH: 20000}

buckets = {}


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

    # Синхронизация между relay и импорт администратором частоту не ограничивают.
    if req.get("sourceType") in ("IP4", "IP6"):
        ip = req.get("sourceInfo", "")
        now = time.monotonic()
        level, last = buckets.get(ip, (BUCKET_SIZE, now))
        level = min(BUCKET_SIZE, level + (now - last) * REFILL_PER_SEC)
        if level < 1:
            buckets[ip] = (level, now)
            return "rate-limited: слишком много событий, попробуйте позже"
        buckets[ip] = (level - 1, now)

    return None


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
