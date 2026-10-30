import { signal } from '@preact/signals';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, type Event, type EventTemplate } from 'nostr-tools/pure';
import type { Filter } from 'nostr-tools/filter';
import { normalizeURL } from 'nostr-tools/utils';
import { account } from './account';
import { defaultRelays } from './config';

const RELAYS_KEY = 'knigopis.relays';

function loadRelays(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RELAYS_KEY) ?? 'null');
    if (Array.isArray(saved) && saved.length) return saved;
  } catch {}
  return defaultRelays();
}

export const relays = signal<string[]>(loadRelays());

export function setRelays(list: string[]) {
  relays.value = list;
  localStorage.setItem(RELAYS_KEY, JSON.stringify(list));
}

export function resetRelays() {
  localStorage.removeItem(RELAYS_KEY);
  relays.value = defaultRelays();
}

export const pool = new SimplePool();

function dedupe(events: Event[]): Event[] {
  const seen = new Map<string, Event>();
  for (const ev of events) seen.set(ev.id, ev);
  return [...seen.values()];
}

export async function query(filter: Filter, maxWait = 5000): Promise<Event[]> {
  const events = await pool.querySync(relays.value, filter, { maxWait });
  // Без связи querySync молча вернёт пустой список — и страница покажет «записей нет».
  if (!events.length) {
    const status = pool.listConnectionStatus();
    if (!relays.value.some((r) => status.get(normalizeURL(r)))) {
      throw new Error('Нет связи ни с одним сервером. Проверьте интернет или список серверов в настройках.');
    }
  }
  return dedupe(events);
}

// Все события по фильтру. Relay отдают не больше своего maxFilterLimit
// (у strfry по умолчанию 500), поэтому идём страницами назад по времени,
// пока не перестанут приходить новые события.
export async function queryAll(filter: Filter, page = 1000): Promise<Event[]> {
  const seen = new Map<string, Event>();
  let until = filter.until;
  for (let i = 0; i < 100; i++) {
    const batch = await query({ ...filter, limit: page, ...(until ? { until } : {}) });
    let fresh = 0;
    let oldest = Infinity;
    for (const ev of batch) {
      if (!seen.has(ev.id)) {
        seen.set(ev.id, ev);
        fresh++;
      }
      oldest = Math.min(oldest, ev.created_at);
    }
    if (!fresh) break;
    until = oldest;
  }
  return [...seen.values()];
}

// Из нескольких версий адресуемого события оставляет последнюю (как NIP-01).
export function latestByAddress(events: Event[]): Event[] {
  const best = new Map<string, Event>();
  for (const ev of events) {
    const d = ev.tags.find((t) => t[0] === 'd')?.[1] ?? '';
    const key = `${ev.kind}:${ev.pubkey}:${d}`;
    const cur = best.get(key);
    if (!cur || ev.created_at > cur.created_at || (ev.created_at === cur.created_at && ev.id < cur.id)) {
      best.set(key, ev);
    }
  }
  return [...best.values()];
}

export function sign(template: EventTemplate): Event {
  const sk = account.value?.sk;
  if (!sk) throw new Error('Нужно войти');
  return finalizeEvent(template, sk);
}

// Публикует на все relay. Успех — если принял хотя бы один.
export async function publishEvent(ev: Event): Promise<Event> {
  const results = await Promise.allSettled(pool.publish(relays.value, ev, { maxWait: 10000 }));
  if (!results.some((r) => r.status === 'fulfilled')) {
    const reason = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
    throw new Error(`Ни один сервер не принял запись${reason ? `: ${reason instanceof Error ? reason.message : reason}` : ''}`);
  }
  return ev;
}

export function publish(template: EventTemplate): Promise<Event> {
  return publishEvent(sign(template));
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}
