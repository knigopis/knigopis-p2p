#!/usr/bin/env python3
"""Проверки политики записи relay: python3 relay/test_write_policy.py"""
import importlib.util
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("policy", os.path.join(HERE, "write-policy.py"))
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


def req(ip, kind=31110, source="IP6", tags=None):
    tags = tags if tags is not None else [["d", "x"], ["title", "Книга"]]
    return {"type": "new", "sourceType": source, "sourceInfo": ip,
            "event": {"id": "e", "kind": kind, "content": "", "tags": tags}}


def reset():
    policy.buckets.clear()
    policy.disk.update(checked=0.0, full=False)


# Ключ ведра: IPv6 — сеть /64, IPv4 — адрес.
k = policy.bucket_key
assert k("2001:db8:1:2::5") == k("2001:db8:1:2:ffff:ffff:ffff:1") == "2001:db8:1:2::/64"
assert k("2001:db8:1:3::1") != k("2001:db8:1:2::1")
assert k("1.2.3.4") == "1.2.3.4"
assert k("::ffff:1.2.3.4") == "1.2.3.4"
assert k("мусор") == "мусор"

# Вся сеть /64 делит одно ведро; соседняя сеть и IPv4 — свои.
reset()
for i in range(policy.BUCKET_SIZE):
    assert policy.check(req(f"2001:db8:1:2::{i:x}")) is None
assert policy.check(req("2001:db8:1:2:abcd::1")).startswith("rate-limited")
assert policy.check(req("2001:db8:1:3::1")) is None
assert policy.check(req("1.2.3.4", source="IP4")) is None
# Синхронизация и импорт частоту не ограничивают.
assert policy.check(req("2001:db8:1:2::1", source="Sync")) is None

# Ведро наполняется со временем.
now = policy.time.monotonic()
assert policy.take("2001:db8:1:2::/64", now + 1) is True

# Давно не тронутые вёдра забываются при очередной чистке.
reset()
policy.buckets["old"] = (10.0, now - policy.FORGET_AFTER - 1)
policy.buckets["fresh"] = (10.0, now)
policy.last_cleanup = now - policy.CLEANUP_EVERY - 1
policy.take("new", now)
assert "old" not in policy.buckets and "fresh" in policy.buckets and "new" in policy.buckets

# Мало места — отказ любому, включая синхронизацию.
reset()
policy.MIN_FREE_BYTES = 1 << 62
assert policy.check(req("1.2.3.4", source="IP4")).startswith("blocked: на сервере кончается место")
assert policy.check(req("1.2.3.4", source="Sync")).startswith("blocked")
policy.MIN_FREE_BYTES = 0
reset()
assert policy.check(req("1.2.3.4", source="IP4")) is None

# Прежние правила на месте.
reset()
assert policy.check(req("1.2.3.4", kind=1)).startswith("blocked: этот relay")
assert policy.check(req("1.2.3.4", tags=[["title", "Без d"]])) == "invalid: нет тега d"
assert policy.check(req("1.2.3.4", tags=[["d", "x"]])) == "invalid: у книги нет названия"
assert policy.check(req("1.2.3.4", tags=[["d", "x"], ["deleted", "1"]])) is None

# Целиком, как его запускает strfry: строка на входе — строка на выходе.
line = json.dumps(req("1.2.3.4", source="IP4")) + "\n"
env = dict(os.environ, MIN_FREE_MB="999999999")
out = subprocess.run([sys.executable, os.path.join(HERE, "write-policy.py")], input=line,
                     capture_output=True, text=True, cwd=HERE, env=env).stdout
assert json.loads(out)["action"] == "reject", out

print("все проверки прошли")
