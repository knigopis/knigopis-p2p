// Книги, желания и заявки на старые аккаунты как события Nostr.
//
// Книга (KIND_BOOK) и желание (KIND_WISH) — адресуемые события, d = id записи.
// У перенесённых из архива d = старый id, поэтому повторный перенос не плодит дубли.
// Удаление: событие перезаписывается «надгробием» (тег deleted) — это работает
// на любом relay — и вдобавок отправляется запрос удаления NIP-09.
import type { Event, EventTemplate } from 'nostr-tools/pure';
import { KIND_BOOK, KIND_CLAIM, KIND_WISH } from './config';
import { compareReadDesc, parseReadTag, readTag, type ReadDate } from './dates';
import { latestByAddress, now, publish, query, queryAll } from './nostr';

export interface Legacy {
  userId: string;
  recordId: string;
  createdAt: string | null;
}

export interface Book extends ReadDate {
  d: string;
  pubkey: string;
  title: string;
  author: string;
  notes: string;
  legacy: Legacy | null;
  createdAt: number;
}

export interface Wish {
  d: string;
  pubkey: string;
  title: string;
  author: string;
  notes: string;
  priority: number | null;
  legacy: Legacy | null;
  createdAt: number;
}

const tag = (ev: Event, name: string) => ev.tags.find((t) => t[0] === name);
const tagValue = (ev: Event, name: string) => tag(ev, name)?.[1];
const isDeleted = (ev: Event) => !!tag(ev, 'deleted');

function legacyOf(ev: Event): Legacy | null {
  const t = tag(ev, 'legacy');
  return t ? { userId: t[1], recordId: t[2] ?? '', createdAt: t[3] || null } : null;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Короткий случайный id, как у записей старой Книгописи.
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function bookFromEvent(ev: Event): Book {
  return {
    d: tagValue(ev, 'd') ?? '',
    pubkey: ev.pubkey,
    title: tagValue(ev, 'title') ?? '',
    author: tagValue(ev, 'author') ?? '',
    notes: ev.content,
    ...parseReadTag(tagValue(ev, 'read')),
    legacy: legacyOf(ev),
    createdAt: ev.created_at,
  };
}

export function wishFromEvent(ev: Event): Wish {
  const p = Number(tagValue(ev, 'priority'));
  return {
    d: tagValue(ev, 'd') ?? '',
    pubkey: ev.pubkey,
    title: tagValue(ev, 'title') ?? '',
    author: tagValue(ev, 'author') ?? '',
    notes: ev.content,
    priority: Number.isFinite(p) && tag(ev, 'priority') ? p : null,
    legacy: legacyOf(ev),
    createdAt: ev.created_at,
  };
}

function legacyTag(l: Legacy | null): string[][] {
  return l ? [['legacy', l.userId, l.recordId, l.createdAt ?? '']] : [];
}

export function bookTemplate(b: Omit<Book, 'pubkey' | 'createdAt'>, createdAt = now()): EventTemplate {
  const read = readTag(b);
  return {
    kind: KIND_BOOK,
    created_at: createdAt,
    content: b.notes,
    tags: [
      ['d', b.d],
      ['title', b.title],
      ...(b.author ? [['author', b.author]] : []),
      ...(read ? [['read', read]] : []),
      ...legacyTag(b.legacy),
      ['alt', `Прочитанная книга: «${b.title}»${b.author ? ` — ${b.author}` : ''}`],
    ],
  };
}

export function wishTemplate(w: Omit<Wish, 'pubkey' | 'createdAt'>, createdAt = now()): EventTemplate {
  return {
    kind: KIND_WISH,
    created_at: createdAt,
    content: w.notes,
    tags: [
      ['d', w.d],
      ['title', w.title],
      ...(w.author ? [['author', w.author]] : []),
      ...(w.priority != null ? [['priority', String(w.priority)]] : []),
      ...legacyTag(w.legacy),
      ['alt', `Хочу прочитать: «${w.title}»${w.author ? ` — ${w.author}` : ''}`],
    ],
  };
}

async function remove(kind: number, pubkey: string, d: string) {
  await publish({ kind, created_at: now(), content: '', tags: [['d', d], ['deleted', '1']] });
  // NIP-09 — вежливая просьба relay удалить; не все её выполняют, поэтому ошибки не важны.
  publish({
    kind: 5,
    created_at: now(),
    content: '',
    tags: [['a', `${kind}:${pubkey}:${d}`], ['k', String(kind)]],
  }).catch(() => {});
}

async function fetchKind(kind: number, pubkey: string): Promise<Event[]> {
  return latestByAddress(await queryAll({ kinds: [kind], authors: [pubkey] })).filter((ev) => !isDeleted(ev));
}

export async function fetchBooks(pubkey: string): Promise<Book[]> {
  return (await fetchKind(KIND_BOOK, pubkey)).map(bookFromEvent).sort((a, b) => compareReadDesc(a, b) || b.createdAt - a.createdAt);
}

export async function fetchWishes(pubkey: string): Promise<Wish[]> {
  return (await fetchKind(KIND_WISH, pubkey))
    .map(wishFromEvent)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || b.createdAt - a.createdAt);
}

async function fetchOne(kind: number, pubkey: string, d: string): Promise<Event | null> {
  const [ev] = latestByAddress(await query({ kinds: [kind], authors: [pubkey], '#d': [d] }));
  return ev && !isDeleted(ev) ? ev : null;
}

export async function fetchBook(pubkey: string, d: string): Promise<Book | null> {
  const ev = await fetchOne(KIND_BOOK, pubkey, d);
  return ev && bookFromEvent(ev);
}

export async function fetchWish(pubkey: string, d: string): Promise<Wish | null> {
  const ev = await fetchOne(KIND_WISH, pubkey, d);
  return ev && wishFromEvent(ev);
}

export const saveBook = (b: Omit<Book, 'pubkey' | 'createdAt'>) => publish(bookTemplate(b));
export const saveWish = (w: Omit<Wish, 'pubkey' | 'createdAt'>) => publish(wishTemplate(w));
export const deleteBook = (b: Book) => remove(KIND_BOOK, b.pubkey, b.d);
export const deleteWish = (w: Wish) => remove(KIND_WISH, w.pubkey, w.d);

// Последние новые (не перенесённые из архива) книги всех пользователей.
export async function fetchLatestBooks(limit = 300): Promise<Book[]> {
  return latestByAddress(await query({ kinds: [KIND_BOOK], limit }))
    .filter((ev) => !isDeleted(ev))
    .map(bookFromEvent)
    .filter((b) => !b.legacy)
    .sort((a, b) => b.createdAt - a.createdAt);
}

// --- Заявки: «старый аккаунт <id> перенесён в этот ключ» ---

export interface Claim {
  pubkey: string;
  legacyId: string;
  nickname: string;
  createdAt: number;
}

function claimFromEvent(ev: Event): Claim {
  return {
    pubkey: ev.pubkey,
    legacyId: tagValue(ev, 'd') ?? '',
    nickname: tagValue(ev, 'nickname') ?? '',
    createdAt: ev.created_at,
  };
}

export function claimTemplate(legacyId: string, nickname: string): EventTemplate {
  return {
    kind: KIND_CLAIM,
    created_at: now(),
    content: '',
    tags: [
      ['d', legacyId],
      ['nickname', nickname],
      ['alt', `Перенос записей «${nickname}» из архива старой Книгописи`],
    ],
  };
}

async function fetchClaims(filter: { authors?: string[]; '#d'?: string[] }): Promise<Claim[]> {
  return latestByAddress(await query({ kinds: [KIND_CLAIM], ...filter }))
    .filter((ev) => !isDeleted(ev))
    .map(claimFromEvent)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// Кто забрал эти старые аккаунты.
export async function fetchClaimsFor(legacyIds: string[]): Promise<Claim[]> {
  if (!legacyIds.length) return [];
  const out: Claim[] = [];
  for (let i = 0; i < legacyIds.length; i += 100) out.push(...(await fetchClaims({ '#d': legacyIds.slice(i, i + 100) })));
  return out;
}

// Какие старые аккаунты забрал этот ключ.
export const fetchClaimsBy = (pubkey: string) => fetchClaims({ authors: [pubkey] });

export async function fetchLatestClaims(limit = 50): Promise<Claim[]> {
  return latestByAddress(await query({ kinds: [KIND_CLAIM], limit }))
    .filter((ev) => !isDeleted(ev))
    .map(claimFromEvent)
    .sort((a, b) => b.createdAt - a.createdAt);
}
