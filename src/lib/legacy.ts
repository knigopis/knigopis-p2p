// Архив старой Книгописи: статические JSON из scripts/pack-legacy.mjs, только чтение.
import type { ReadDate } from './dates';

export interface LegacyIndexUser {
  id: string;
  nickname: string;
  books: number;
  wishes: number;
  updatedAt: string;
}

export interface LegacyBook extends ReadDate {
  id: string;
  title: string;
  author: string;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LegacyWish {
  id: string;
  title: string;
  author: string;
  priority: number | null;
  notes: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LegacyUser {
  id: string;
  nickname: string;
  createdAt: string | null;
  updatedAt: string | null;
  subscriptions: string[];
  books: LegacyBook[];
  wishes: LegacyWish[];
}

export interface LegacyLatest extends LegacyBook {
  userId: string;
  nickname: string;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Архив не ответил (${res.status})`);
  return res.json();
}

let indexPromise: Promise<LegacyIndexUser[]> | null = null;
export function legacyIndex(): Promise<LegacyIndexUser[]> {
  indexPromise ??= getJson<{ users: [string, string, number, number, string][] }>('/legacy/index.json')
    .then((d) => d.users.map(([id, nickname, books, wishes, updatedAt]) => ({ id, nickname, books, wishes, updatedAt })))
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

const userCache = new Map<string, Promise<LegacyUser | null>>();
export function legacyUser(id: string): Promise<LegacyUser | null> {
  if (!userCache.has(id)) {
    userCache.set(
      id,
      fetch(`/legacy/users/${encodeURIComponent(id)}.json`).then(async (res) => {
        if (res.status === 404) return null;
        // Без файла dev-сервер и Service Worker отдают index.html — это тоже «нет такого».
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
          if (res.ok) return null;
          userCache.delete(id);
          throw new Error(`Архив не ответил (${res.status})`);
        }
        return res.json();
      }),
    );
  }
  return userCache.get(id)!;
}

let booksPromise: Promise<[string, string, number][]> | null = null;
function legacyBooksIndex() {
  booksPromise ??= getJson<[string, string, number][]>('/legacy/books-index.json').catch((e) => {
    booksPromise = null;
    throw e;
  });
  return booksPromise;
}

export const legacyLatest = () => getJson<LegacyLatest[]>('/legacy/latest.json');

export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

// Старая ссылка на профиль: …/#/<ник>/books?u=<id>&y=… → id.
export function legacyIdFromUrl(text: string): string | null {
  const m = text.match(/[?&]u=([^&#\s]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

export async function searchLegacyUsers(q: string, limit = 50): Promise<LegacyIndexUser[]> {
  const users = await legacyIndex();
  const fromUrl = legacyIdFromUrl(q);
  if (fromUrl) return users.filter((u) => u.id === fromUrl);
  const n = norm(q);
  if (!n) return [];
  const exact: LegacyIndexUser[] = [];
  const partial: LegacyIndexUser[] = [];
  for (const u of users) {
    const nick = norm(u.nickname);
    if (nick === n || u.id === q.trim()) exact.push(u);
    else if (nick.includes(n)) partial.push(u);
  }
  partial.sort((a, b) => b.books - a.books);
  return [...exact, ...partial].slice(0, limit);
}

export interface LegacyBookHit {
  user: LegacyIndexUser;
  title: string;
  author: string;
}

export async function searchLegacyBooks(q: string, limit = 100): Promise<LegacyBookHit[]> {
  const n = norm(q);
  if (n.length < 3) return [];
  const [users, books] = await Promise.all([legacyIndex(), legacyBooksIndex()]);
  const hits: LegacyBookHit[] = [];
  for (const [title, author, idx] of books) {
    if (norm(title).includes(n) || norm(author).includes(n)) {
      hits.push({ user: users[idx], title, author });
      if (hits.length >= limit) break;
    }
  }
  return hits;
}
