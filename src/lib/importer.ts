// Перенос записей из архива в свой аккаунт.
//
// Проверить, что архив ваш, нельзя (старый вход мёртв), поэтому перенос — это
// копия, подписанная вашим ключом, плюс публичная заявка: кто угодно видит,
// в какие аккаунты перенесён старый профиль.
import { account } from './account';
import { updateFollows } from './follows';
import type { LegacyUser } from './legacy';
import { now, publish, publishEvent, sign } from './nostr';
import { bookTemplate, claimTemplate, fetchBooks, fetchClaimsFor, fetchWishes, wishTemplate } from './records';

export interface ImportOptions {
  books: boolean;
  wishes: boolean;
  subscriptions: boolean;
}

export interface ImportProgress {
  total: number;
  done: number;
  failed: number;
}

export interface ImportResult {
  books: number;
  wishes: number;
  skipped: number;
  failed: number;
  followed: number;
  pendingFollows: number;
}

const CONCURRENCY = 8;

export async function importLegacy(
  user: LegacyUser,
  opts: ImportOptions,
  onProgress: (p: ImportProgress) => void,
): Promise<ImportResult> {
  const acc = account.value;
  if (!acc) throw new Error('Нужно войти');

  // Сначала заявка: если перенос прервётся, его можно повторить, и связь уже видна.
  await publish(claimTemplate(user.id, user.nickname));

  const [haveBooks, haveWishes] = await Promise.all([
    opts.books ? fetchBooks(acc.pk) : Promise.resolve([]),
    opts.wishes ? fetchWishes(acc.pk) : Promise.resolve([]),
  ]);
  const haveBookIds = new Set(haveBooks.map((b) => b.d));
  const haveWishIds = new Set(haveWishes.map((w) => w.d));

  const books = opts.books ? user.books.filter((b) => !haveBookIds.has(b.id)) : [];
  const wishes = opts.wishes ? user.wishes.filter((w) => !haveWishIds.has(w.id)) : [];
  const skipped =
    (opts.books ? user.books.length - books.length : 0) + (opts.wishes ? user.wishes.length - wishes.length : 0);

  // У каждого события своя секунда: при постраничном чтении по времени
  // сотни событий с одинаковым created_at читались бы плохо.
  let t = now() - books.length - wishes.length;
  const events = [
    ...books.map((b) =>
      sign(
        bookTemplate(
          {
            d: b.id,
            title: b.title || 'Без названия',
            author: b.author,
            notes: b.notes,
            readYear: b.readYear,
            readMonth: b.readMonth,
            readDay: b.readDay,
            legacy: { userId: user.id, recordId: b.id, createdAt: b.createdAt },
          },
          t++,
        ),
      ),
    ),
    ...wishes.map((w) =>
      sign(
        wishTemplate(
          {
            d: w.id,
            title: w.title || 'Без названия',
            author: w.author,
            notes: w.notes,
            priority: w.priority,
            legacy: { userId: user.id, recordId: w.id, createdAt: w.createdAt },
          },
          t++,
        ),
      ),
    ),
  ];

  const progress: ImportProgress = { total: events.length, done: 0, failed: 0 };
  onProgress({ ...progress });
  let next = 0;
  const worker = async () => {
    while (next < events.length) {
      const ev = events[next++];
      try {
        await publishEvent(ev);
      } catch {
        progress.failed++;
      }
      progress.done++;
      onProgress({ ...progress });
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  let followed = 0;
  let pendingFollows = 0;
  if (opts.subscriptions && user.subscriptions.length) {
    const { found, pending } = await resolveLegacyFollows(user.subscriptions);
    if (found.length) {
      await updateFollows(found);
      followed = found.length;
    }
    pendingFollows = pending;
  }

  return {
    books: books.length,
    wishes: wishes.length,
    skipped,
    failed: progress.failed,
    followed,
    pendingFollows,
  };
}

// Старые подписки → ключи тех, кто уже перенёс эти аккаунты.
export async function resolveLegacyFollows(legacyIds: string[]): Promise<{ found: string[]; pending: number }> {
  const claims = await fetchClaimsFor(legacyIds);
  const claimed = new Set(claims.map((c) => c.legacyId));
  return {
    found: [...new Set(claims.map((c) => c.pubkey))],
    pending: legacyIds.filter((id) => !claimed.has(id)).length,
  };
}
