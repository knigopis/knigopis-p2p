import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { searchLegacyBooks, searchLegacyUsers, type LegacyBookHit } from '../lib/legacy';
import { archivePath } from '../components/UserLink';
import { ErrorAlert, Loading, useAsync } from '../components/Status';

function groupHits(hits: LegacyBookHit[]) {
  const byUser = new Map<string, { hit: LegacyBookHit; titles: string[] }>();
  for (const h of hits) {
    const g = byUser.get(h.user.id) ?? { hit: h, titles: [] };
    g.titles.push(h.author ? `${h.title} — ${h.author}` : h.title);
    byUser.set(h.user.id, g);
  }
  return [...byUser.values()];
}

export function Search() {
  const { query, route } = useLocation();
  const q = (query.q ?? '').trim();
  const [input, setInput] = useState(q);

  const users = useAsync(() => (q ? searchLegacyUsers(q) : Promise.resolve([])), [q]);
  const books = useAsync(() => (q.length >= 3 ? searchLegacyBooks(q) : Promise.resolve([])), [q]);

  const submit = (e: Event) => {
    e.preventDefault();
    route(`/search?q=${encodeURIComponent(input.trim())}`);
  };

  return (
    <div>
      <h1>Поиск в архиве старой Книгописи</h1>
      <p>
        Введите свой ник из старой Книгописи, ссылку на свой старый список (в ней есть <code>books?u=…</code>) или
        название книги, которую вы добавляли. Найдя себя, откройте список и нажмите «Это мои записи».
      </p>
      <form class="inline-form" onSubmit={submit} role="search">
        <label class="sr-only" for="search-q">
          Ник, ссылка или книга
        </label>
        <input
          id="search-q"
          class="form-control"
          type="search"
          placeholder="Ник, ссылка или название книги"
          value={input}
          onInput={(e) => setInput(e.currentTarget.value)}
          autoFocus
        />
        <button class="btn btn-primary" type="submit">
          Найти
        </button>
      </form>

      {q && (
        <>
          <h3>Пользователи</h3>
          {users.error ? <ErrorAlert error={users.error} onRetry={users.reload} /> : null}
          {users.loading ? <Loading /> : null}
          {users.data && !users.loading && (
            users.data.length ? (
              <ul class="result-list">
                {users.data.map((u) => (
                  <li key={u.id}>
                    <a href={archivePath(u.id)}>{u.nickname}</a>
                    <sup>{u.books}</sup>{' '}
                    <small class="text-muted">
                      {u.id}
                      {u.updatedAt ? ` · обновлялся ${u.updatedAt}` : ''}
                    </small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                <em>Пользователей с таким ником нет.</em>
              </p>
            )
          )}

          {q.length >= 3 && (
            <>
              <h3>Книги</h3>
              {books.error ? <ErrorAlert error={books.error} onRetry={books.reload} /> : null}
              {books.loading ? <Loading>Ищу по названиям и авторам</Loading> : null}
              {books.data && !books.loading && (
                books.data.length ? (
                  <ul class="result-list">
                    {groupHits(books.data).map(({ hit, titles }) => (
                      <li key={hit.user.id}>
                        <a href={archivePath(hit.user.id)}>{hit.user.nickname}</a>
                        <sup>{hit.user.books}</sup>
                        <div class="text-muted">
                          <small>{titles.slice(0, 3).join('; ')}{titles.length > 3 ? ` и ещё ${titles.length - 3}` : ''}</small>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    <em>Таких книг в архиве нет.</em>
                  </p>
                )
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
