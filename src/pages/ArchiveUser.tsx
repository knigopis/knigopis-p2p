import { useEffect, useMemo } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { account } from '../lib/account';
import { legacyIndex, legacyUser } from '../lib/legacy';
import { ensureProfiles } from '../lib/profiles';
import { fetchClaimsFor } from '../lib/records';
import { BookList, WishList, type ListItem, type WishItem } from '../components/BookList';
import { ErrorAlert, Loading, useAsync } from '../components/Status';
import { archivePath, UserLink, userPath } from '../components/UserLink';
import { NotFound } from './NotFound';

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

export function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function ArchiveUser() {
  const { params } = useRoute();
  const id = decodeParam(params.id);
  const tab = params.tab ?? 'books';
  const acc = account.value;

  const user = useAsync(() => legacyUser(id), [id]);
  const claims = useAsync(() => fetchClaimsFor([id]), [id]);
  const subs = useAsync(async () => {
    const u = await legacyUser(id);
    if (!u?.subscriptions.length) return [];
    const index = await legacyIndex();
    const byId = new Map(index.map((x) => [x.id, x]));
    return u.subscriptions.map((sid) => byId.get(sid)).filter((x) => !!x);
  }, [id]);

  useEffect(() => {
    if (claims.data) ensureProfiles(claims.data.map((c) => c.pubkey));
  }, [claims.data]);

  const bookItems = useMemo<ListItem[]>(
    () =>
      (user.data?.books ?? []).map((b) => ({
        key: b.id,
        title: b.title,
        author: b.author,
        notes: b.notes,
        readYear: b.readYear,
        readMonth: b.readMonth,
        readDay: b.readDay,
        actions: acc
          ? [
              { href: `/book/add?${q({ title: b.title, author: b.author })}`, label: 'прочитал' },
              { href: `/wish/add?${q({ title: b.title, author: b.author })}`, label: 'прочитать позже' },
            ]
          : [],
      })),
    [user.data, acc],
  );

  const wishItems = useMemo<WishItem[]>(
    () =>
      (user.data?.wishes ?? []).map((w) => ({
        key: w.id,
        title: w.title,
        author: w.author,
        notes: w.notes,
        actions: acc ? [{ href: `/wish/add?${q({ title: w.title, author: w.author })}`, label: 'прочитать позже' }] : [],
      })),
    [user.data, acc],
  );

  if (user.error) return <ErrorAlert error={user.error} onRetry={user.reload} />;
  if (user.loading && !user.data) return <Loading />;
  if (!user.data) return <NotFound />;

  const u = user.data;
  const base = archivePath(u.id);
  const mine = acc && claims.data?.some((c) => c.pubkey === acc.pk);
  const importHref = acc ? `/import/${encodeURIComponent(u.id)}` : `/login?next=${encodeURIComponent(`/import/${encodeURIComponent(u.id)}`)}`;

  return (
    <div>
      <div class="page-title">
        <h1>
          Список прочитанных книг пользователя {u.nickname} <span class="label-archive">архив</span>
        </h1>
      </div>

      <div class="alert alert-warning">
        <p>
          Это архив старой Книгописи: записи сохранены как были и доступны только для чтения
          {u.updatedAt ? ` (последнее изменение — ${u.updatedAt.slice(0, 10)})` : ''}.
        </p>
        {claims.error ? (
          <p>Не удалось узнать, перенесены ли эти записи: {String(claims.error)}</p>
        ) : claims.data && claims.data.length > 0 ? (
          <p>
            Перенесено в {claims.data.length > 1 ? 'аккаунты' : 'аккаунт'}:{' '}
            {claims.data.map((c, i) => (
              <span key={c.pubkey}>
                {i > 0 && ', '}
                <UserLink pubkey={c.pubkey} />
              </span>
            ))}
            .
          </p>
        ) : claims.data ? (
          <p>Ещё никто не перенёс эти записи в новую Книгопись.</p>
        ) : null}
        <div class="page-tools">
          {mine ? (
            <>
              <a class="btn btn-success" href={userPath(acc!.pk)}>
                Вы уже перенесли эти записи — к моим книгам
              </a>
              <a class="btn btn-default" href={importHref}>
                Перенести недостающие
              </a>
            </>
          ) : (
            <a class="btn btn-primary" href={importHref}>
              Это мои записи — перенести в новую Книгопись
            </a>
          )}
        </div>
      </div>

      <ul class="nav-tabs">
        <li>
          <a href={base} class={tab === 'books' ? 'active' : ''}>
            Прочитано <sup>{u.books.length}</sup>
          </a>
        </li>
        <li>
          <a href={`${base}/wishes`} class={tab === 'wishes' ? 'active' : ''}>
            Хочу прочитать <sup>{u.wishes.length}</sup>
          </a>
        </li>
        {u.subscriptions.length > 0 && (
          <li>
            <a href={`${base}/subscriptions`} class={tab === 'subscriptions' ? 'active' : ''}>
              Подписки <sup>{u.subscriptions.length}</sup>
            </a>
          </li>
        )}
      </ul>

      {tab === 'books' && <BookList items={bookItems} />}
      {tab === 'wishes' && <WishList items={wishItems} />}
      {tab === 'subscriptions' &&
        (subs.data ? (
          <ul class="list-inline">
            {subs.data.map((s) => (
              <li key={s.id}>
                <a href={archivePath(s.id)}>{s.nickname}</a>
                <sup>{s.books}</sup>
              </li>
            ))}
          </ul>
        ) : (
          <Loading />
        ))}
    </div>
  );
}
