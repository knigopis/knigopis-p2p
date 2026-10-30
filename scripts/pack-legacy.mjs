#!/usr/bin/env node
// Упаковывает старое хранилище repo2.knigopis.com в статический архив для PWA.
//
//   node scripts/pack-legacy.mjs <путь к клону repo2> <каталог вывода>
//
// Берётся только текущее состояние (HEAD), не история. Из пользователя
// выкидываются photo/profile/identity: ссылки на соцсети мертвы, да и незачем
// их тиражировать. auth.csv (хэши паролей) не читается вообще.
//
// Результат:
//   index.json         — все пользователи: [id, ник, книг, желаний, обновлён]
//   users/<id>.json    — пользователь целиком: книги, желания, подписки
//   books-index.json   — название и автор каждой книги → номер пользователя в index
//   latest.json        — последние книги с заметками (для главной)
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: pack-legacy.mjs <repo2> <out>');
  process.exit(1);
}

const num = (v, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

async function readDir(dir) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
}

function book(b) {
  return {
    id: b.id,
    title: (b.title ?? '').trim(),
    author: (b.author ?? '').trim(),
    readYear: num(b.readYear, 1, 3000),
    readMonth: num(b.readMonth, 1, 12),
    readDay: num(b.readDay, 1, 31),
    notes: b.notes ?? '',
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

function wish(w) {
  return {
    id: w.id,
    title: (w.title ?? '').trim(),
    author: (w.author ?? '').trim(),
    priority: num(w.priority, 0, 100),
    notes: w.notes ?? '',
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

const byReadDate = (a, b) =>
  (b.readYear ?? 0) - (a.readYear ?? 0) ||
  (b.readMonth ?? 0) - (a.readMonth ?? 0) ||
  (b.readDay ?? 0) - (a.readDay ?? 0) ||
  String(b.createdAt).localeCompare(String(a.createdAt));

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'users'), { recursive: true });

const index = [];
const booksIndex = [];
const latest = [];

const usersRoot = join(src, 'users');
for (const prefix of (await readdir(usersRoot)).sort()) {
  for (const id of (await readdir(join(usersRoot, prefix))).sort()) {
    const dir = join(usersRoot, prefix, id);
    let u;
    try {
      u = await readJson(join(dir, `${id}.json`));
    } catch {
      continue;
    }

    const books = [];
    for (const f of await readDir(join(dir, 'books'))) books.push(book(await readJson(join(dir, 'books', f))));
    books.sort(byReadDate);

    const wishes = [];
    for (const f of await readDir(join(dir, 'wishes'))) wishes.push(wish(await readJson(join(dir, 'wishes', f))));
    wishes.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || String(b.createdAt).localeCompare(String(a.createdAt)));

    const user = {
      id,
      nickname: (u.nickname ?? '').trim() || id,
      lang: u.lang ?? null,
      createdAt: u.createdAt ?? null,
      updatedAt: u.updatedAt ?? null,
      subscriptions: Object.keys(u.subscriptions ?? {}),
      books,
      wishes,
    };
    await writeFile(join(out, 'users', `${id}.json`), JSON.stringify(user));

    const userIdx = index.length;
    index.push([id, user.nickname, books.length, wishes.length, (user.updatedAt ?? '').slice(0, 10)]);
    for (const b of books) {
      booksIndex.push([b.title, b.author, userIdx]);
      if (b.notes.trim()) latest.push({ userId: id, nickname: user.nickname, ...b });
    }
  }
}

latest.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

let commit = null;
try {
  commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}

await writeFile(
  join(out, 'index.json'),
  JSON.stringify({ builtAt: new Date().toISOString(), source: 'knigopis/repo2.knigopis.com', commit, users: index }),
);
await writeFile(join(out, 'books-index.json'), JSON.stringify(booksIndex));
await writeFile(join(out, 'latest.json'), JSON.stringify(latest.slice(0, 30)));

console.log(`users: ${index.length}, books: ${booksIndex.length}, wishes: ${index.reduce((s, u) => s + u[3], 0)}`);
