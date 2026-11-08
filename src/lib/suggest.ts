// Подсказки в формах книги и желания: авторы и книги из архива (legacy/suggest.json,
// см. scripts/pack-legacy.mjs) плюс свои прошлые авторы. Всё ищется в браузере:
// что человек печатает, никуда не уходит.
import { signal } from '@preact/signals';
import { fetchBooks } from './records';

// Слова для сравнения — как в pack-legacy.mjs: регистр, ё/е и знаки не важны.
export const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

export const sameText = (a: string, b: string) => words(a).join(' ') === words(b).join(' ');

interface Entry {
  text: string;
  words: string[];
}

interface BookEntry extends Entry {
  author: string;
  authorWords: string[];
}

interface Data {
  authors: Entry[];
  books: BookEntry[];
}

const data = signal<Data | null>(null);
let loading = false;

// Грузится при первом фокусе на поле; без файла (старый узел) подсказок просто нет.
export function loadSuggest() {
  if (data.value || loading) return;
  loading = true;
  fetch('/legacy/suggest.json')
    .then(async (res) => {
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) throw new Error(`suggest.json: ${res.status}`);
      const raw = (await res.json()) as { authors: [string, number][]; books: [string, number, number][] };
      const authors = raw.authors.map(([text]) => ({ text, words: words(text) }));
      const books = raw.books.map(([text, ai]) => ({
        text,
        words: words(text),
        author: authors[ai]?.text ?? '',
        authorWords: authors[ai]?.words ?? [],
      }));
      data.value = { authors, books };
    })
    .catch(() => {
      loading = false;
    });
}

// Свои авторы — по частоте; грузятся один раз на ключ.
const own = signal<{ pk: string; authors: string[] } | null>(null);
let loadingOwn: string | null = null;

export function loadOwnAuthors(pk: string) {
  if (own.value?.pk === pk || loadingOwn === pk) return;
  loadingOwn = pk;
  fetchBooks(pk)
    .then((books) => {
      const count = new Map<string, number>();
      for (const b of books) if (b.author.trim()) count.set(b.author.trim(), (count.get(b.author.trim()) ?? 0) + 1);
      own.value = { pk, authors: [...count.entries()].sort((a, b) => b[1] - a[1]).map(([a]) => a) };
    })
    .catch(() => {})
    .finally(() => {
      loadingOwn = null;
    });
}

// Только что сохранённый автор — сразу в свои, без перезагрузки.
export function rememberOwnAuthor(pk: string, author: string) {
  const a = author.trim();
  if (!a || own.value?.pk !== pk || own.value.authors.some((x) => sameText(x, a))) return;
  own.value = { pk, authors: [a, ...own.value.authors] };
}

// Каждое слово запроса — начало какого-нибудь слова варианта: «н в гог» → «Н. В. Гоголь».
const matches = (query: string[], target: string[]) => query.every((q) => target.some((t) => t.startsWith(q)));

const MIN_CHARS = 2;
const LIMIT = 8;

const query = (s: string) => (s.trim().length >= MIN_CHARS ? words(s) : []);

export function suggestAuthors(input: string, pk?: string): string[] {
  const q = query(input);
  if (!q.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (text: string, w: string[]) => {
    const key = [...w].sort().join(' ');
    if (!seen.has(key) && matches(q, w)) {
      seen.add(key);
      out.push(text);
    }
  };
  if (pk && own.value?.pk === pk) for (const a of own.value.authors) add(a, words(a));
  for (const a of data.value?.authors ?? []) {
    if (out.length >= LIMIT) break;
    add(a.text, a.words);
  }
  return out.slice(0, LIMIT).filter((a) => !sameText(a, input));
}

export interface BookSuggestion {
  title: string;
  author: string;
}

// Одна книга, записанная по-разному: то же название и общее слово в авторе
// («Дэниел Киз» и «Дэниэл Киз»). Остаётся первая — самая частая.
const sameBook = (x: BookEntry, y: BookEntry) =>
  x.words.join(' ') === y.words.join(' ') && x.authorWords.some((w) => w.length > 2 && y.authorWords.includes(w));

// Книги по началу слов названия; если автор уже введён — сначала его книги.
export function suggestBooks(input: string, author = ''): BookSuggestion[] {
  const q = query(input);
  if (!q.length) return [];
  const a = words(author);
  const hits = (data.value?.books ?? []).filter((b) => matches(q, b.words));
  if (a.length) hits.sort((x, y) => Number(matches(a, y.authorWords)) - Number(matches(a, x.authorWords)));
  const kept: BookEntry[] = [];
  for (const b of hits) {
    if (kept.length >= LIMIT) break;
    if (!kept.some((k) => sameBook(k, b))) kept.push(b);
  }
  return kept.map((b) => ({ title: b.text, author: b.author })).filter((b) => !(sameText(b.title, input) && author.trim()));
}
