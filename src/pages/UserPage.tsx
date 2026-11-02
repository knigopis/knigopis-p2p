import { useEffect, useMemo, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import * as nip19 from 'nostr-tools/nip19';
import { account } from '../lib/account';
import { myFollows, updateFollows } from '../lib/follows';
import { displayName, ensureProfiles, isShortId, resolveShortId } from '../lib/profiles';
import { fetchBooks, fetchClaimsBy, fetchWishes } from '../lib/records';
import { markSeen } from '../lib/util';
import { Avatar } from '../components/Avatar';
import { BookList, WishList, type ListItem, type WishItem } from '../components/BookList';
import { ErrorAlert, Loading, useAsync } from '../components/Status';
import { archivePath, userPath } from '../components/UserLink';
import { NotFound } from './NotFound';

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

// Полный ключ: npub1… (старые ссылки) или 64 hex.
function decodeKey(id: string): string | null {
  if (/^[0-9a-f]{64}$/.test(id)) return id;
  try {
    const d = nip19.decode(id);
    return d.type === 'npub' ? d.data : null;
  } catch {
    return null;
  }
}

export function UserPage() {
  const { params } = useRoute();
  const tab = params.tab ?? 'books';
  const direct = decodeKey(params.id);
  const short = !direct && isShortId(params.id) ? params.id : null;
  const found = useAsync(() => (short ? resolveShortId(short) : Promise.resolve(null)), [short]);

  if (direct) return <UserView pk={direct} tab={tab} />;
  if (!short) return <NotFound />;
  if (found.error) return <ErrorAlert error={found.error} onRetry={found.reload} />;
  if (!found.data) return <Loading />;
  if (found.data.length === 1) return <UserView pk={found.data[0]} tab={tab} />;
  if (!found.data.length) return <NotFound />;
  // Два ключа с одинаковым началом — только если кто-то подбирал ключ нарочно.
  return (
    <div>
      <h1>По этой ссылке несколько пользователей</h1>
      <ul>
        {found.data.map((pk) => (
          <li key={pk}>
            <a href={`/u/${nip19.npubEncode(pk)}`}>{displayName(pk)}</a> <code>{nip19.npubEncode(pk)}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FollowStar({ pk }: { pk: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const follows = myFollows.value;
  if (follows === null) return null;
  const following = follows.includes(pk);
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await (following ? updateFollows([], [pk]) : updateFollows([pk]));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        class="subscribe-btn"
        onClick={toggle}
        disabled={busy}
        title={following ? 'Отписаться' : 'Подписаться'}
        aria-label={following ? 'Отписаться' : 'Подписаться'}
      >
        {following ? '★' : '☆'}
      </button>
      {error ? <span class="text-danger">{String(error instanceof Error ? error.message : error)}</span> : null}
    </>
  );
}

function UserView({ pk, tab }: { pk: string; tab: string }) {
  const acc = account.value;
  const isMe = acc?.pk === pk;
  const books = useAsync(() => fetchBooks(pk), [pk]);
  // «Хочу прочитать» — личный список, как в старой Книгописи: чужие не показываем.
  const wishes = useAsync(() => (isMe ? fetchWishes(pk) : Promise.resolve([])), [pk, isMe]);
  const claims = useAsync(() => fetchClaimsBy(pk), [pk]);

  useEffect(() => {
    ensureProfiles([pk]);
    if (!isMe) markSeen(pk);
  }, [pk, isMe]);

  const bookItems = useMemo<ListItem[]>(
    () =>
      (books.data ?? []).map((b) => ({
        key: b.d,
        title: b.title,
        author: b.author,
        notes: b.notes,
        readYear: b.readYear,
        readMonth: b.readMonth,
        readDay: b.readDay,
        actions: isMe
          ? [{ href: `/book/edit/${encodeURIComponent(b.d)}`, label: 'редактировать' }]
          : acc
            ? [
                { href: `/book/add?${q({ title: b.title, author: b.author })}`, label: 'прочитал' },
                { href: `/wish/add?${q({ title: b.title, author: b.author })}`, label: 'прочитать позже' },
              ]
            : [],
      })),
    [books.data, isMe, acc],
  );

  const wishItems = useMemo<WishItem[]>(
    () =>
      (wishes.data ?? []).map((w) => ({
        key: w.d,
        title: w.title,
        author: w.author,
        notes: w.notes,
        actions: isMe
          ? [
              { href: `/wish/edit/${encodeURIComponent(w.d)}`, label: 'редактировать' },
              { href: `/book/add?${q({ title: w.title, author: w.author, wish: w.d })}`, label: 'прочитано!' },
            ]
          : acc
            ? [{ href: `/wish/add?${q({ title: w.title, author: w.author })}`, label: 'прочитать позже' }]
            : [],
      })),
    [wishes.data, isMe, acc],
  );

  const base = userPath(pk);
  const showWishes = isMe && tab === 'wishes';
  const current = showWishes ? wishes : books;

  return (
    <div>
      <div class="page-title">
        <h1>
          <Avatar seed={pk} size={28} /> Список прочитанных книг пользователя {displayName(pk)}
        </h1>
        {acc && !isMe && <FollowStar pk={pk} />}
      </div>

      {claims.data && claims.data.length > 0 && (
        <p class="text-muted">
          Перенесено из архива старой Книгописи:{' '}
          {claims.data.map((c, i) => (
            <span key={c.legacyId}>
              {i > 0 && ', '}
              <a href={archivePath(c.legacyId)}>{c.nickname || c.legacyId}</a>
            </span>
          ))}
        </p>
      )}

      {isMe && (
        <div class="page-tools">
          <a class="btn btn-default" href="/book/add">
            + Добавить книгу
          </a>
          <a class="btn btn-default" href="/wish/add">
            + Добавить к прочтению
          </a>
          {claims.data && claims.data.length === 0 && (
            <a class="btn btn-primary" href="/search">
              Перенести старые записи
            </a>
          )}
        </div>
      )}
      <hr />

      <ul class="nav-tabs">
        <li>
          <a href={base} class={!showWishes ? 'active' : ''}>
            Прочитано {books.data ? <sup>{books.data.length}</sup> : null}
          </a>
        </li>
        {isMe && (
          <li>
            <a href={`${base}/wishes`} class={tab === 'wishes' ? 'active' : ''}>
              Хочу прочитать {wishes.data ? <sup>{wishes.data.length}</sup> : null}
            </a>
          </li>
        )}
      </ul>

      {current.error ? <ErrorAlert error={current.error} onRetry={current.reload} /> : null}
      {current.loading && !current.data ? <Loading /> : null}
      {showWishes ? (
        <>
          <p class="text-muted">
            Этот список видите только вы. Но он не зашифрован: как и в старой Книгописи, записи хранятся открыто
            на серверах и в резервной копии.
          </p>
          {wishes.data && <WishList items={wishItems} />}
        </>
      ) : (
        books.data && <BookList items={bookItems} />
      )}
    </div>
  );
}
