import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { account } from '../lib/account';
import { shortDate } from '../lib/dates';
import { legacyLatest, type LegacyLatestFile } from '../lib/legacy';
import { relays } from '../lib/nostr';
import { displayName, ensureProfiles } from '../lib/profiles';
import { fetchClaimsBy, fetchLatestBooks, fetchLatestClaims } from '../lib/records';
import { archivePath, userPath } from '../components/UserLink';
import { Avatar } from '../components/Avatar';
import { Cover } from '../components/Cover';
import { plural } from '../components/BookList';
import { ErrorAlert, Loading, useAsync } from '../components/Status';

async function loadFeed() {
  const [books, claims] = await Promise.all([fetchLatestBooks(), fetchLatestClaims()]);
  // Недавние читатели: авторы новых книг и те, кто недавно перенёс записи.
  const recent = [...books.map((b) => [b.pubkey, b.createdAt] as const), ...claims.map((c) => [c.pubkey, c.createdAt] as const)]
    .sort((a, b) => b[1] - a[1])
    .map(([pk]) => pk);
  const users = [...new Set(recent)].slice(0, 24);
  const withNotes = books.filter((b) => b.notes.trim()).slice(0, 6);
  return { users, withNotes };
}

function FeedItem(props: { title: string; author: string; notes: string; seed: string; who: ComponentChildren; when: string }) {
  return (
    <li class="feed-item">
      <Cover class="feed-cover" title={props.title} author={props.author} />
      <div class="feed-head">
        <div class="book-title">{props.title || 'Без названия'}</div>
        {props.author && <div class="entry-author">{props.author}</div>}
      </div>
      {props.notes && <p class="feed-notes">{props.notes}</p>}
      <div class="feed-meta">
        <Avatar seed={props.seed} size={18} />
        {props.who}
        {props.when && <span class="feed-when">{props.when}</span>}
      </div>
    </li>
  );
}

// Переезд: старым читателям главное — найти себя в архиве, поэтому поиск прямо здесь.
function MovePanel({ archive }: { archive: LegacyLatestFile | undefined }) {
  const { route } = useLocation();
  const [q, setQ] = useState('');
  return (
    <section class="move-panel">
      <h2>Книгопись переехала</h2>
      <p>
        Старый сервер и вход через соцсети больше не работают, но все записи сохранены. Найдите себя в архиве и
        перенесите книги в новый аккаунт — это пара кликов.
      </p>
      <form
        class="inline-form"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          route(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
        }}
      >
        <input
          class="form-control"
          type="search"
          value={q}
          onInput={(e) => setQ(e.currentTarget.value)}
          placeholder="Ник, ссылка или книга"
          aria-label="Поиск в архиве: ник, ссылка на старый список или название книги"
        />
        <button type="submit" class="btn btn-default">
          Найти
        </button>
      </form>
      {archive && archive.users > 0 && (
        <p class="move-stats">
          В архиве {plural(archive.users, ['читатель', 'читателя', 'читателей'])} и{' '}
          {plural(archive.books, ['книга', 'книги', 'книг'])}
        </p>
      )}
    </section>
  );
}

function Why() {
  return (
    <section class="aside-block">
      <h2 class="aside-title">Почему Книгопись</h2>
      <p class="why-intro">
        Конечно, такой сервис не единственный. Но у изученных нами конкурентов есть недостатки, и некоторые из них не
        устраивали авторов проекта. Речь не только о фатальном недостатке. Итак, наши преимущества:
      </p>
      <dl class="why">
        <dt>Свобода ввода</dt>
        <dd>
          Нет привязки к конкретным книгам. Пишите в заголовок и в автора то, что вы сами хотите. Указывайте дату
          прочтения, какую вам удобно: полную, только год или год и месяц. Можно и вовсе без даты.
        </dd>
        <dt>Ваши примечания</dt>
        <dd>
          Вместо оценок мы предлагаем добавить ваши примечания к книге: насколько она понравилась, что в ней интересного
          или кому бы вы её порекомендовали — в удобном вам формате.
        </dd>
        <dt>Лёгкость просмотра</dt>
        <dd>
          Мы постарались сделать список прочитанного лёгким, но в то же время информативным. Данные общедоступны для
          чтения. В любое время вы можете поделиться вашим списком.
        </dd>
        <dt>Долговечность</dt>
        <dd>
          Аккаунт — это ключ, который хранится у вас. Каждая запись подписана этим ключом и хранится сразу на нескольких
          независимых серверах. Поднять ещё одну копию может кто угодно, а подделать запись — никто.
        </dd>
      </dl>
    </section>
  );
}

function NodeCta() {
  const n = relays.value.length;
  return (
    <section class="aside-block node-cta">
      <p>
        Сейчас записи хранятся на <strong>{plural(n, ['узле', 'узлах', 'узлах'])}</strong>. Каждый новый узел — ещё одна
        полная копия Книгописи.
      </p>
      <a href="/node">Поднять свой узел &rarr;</a>
    </section>
  );
}

export function Home() {
  const acc = account.value;
  const feed = useAsync(loadFeed, []);
  const archive = useAsync(legacyLatest, []);
  // Вошедшему панель переезда нужна, только пока он не перенёс старые записи.
  const myClaims = useAsync(() => (acc ? fetchClaimsBy(acc.pk) : Promise.resolve([])), [acc?.pk]);

  useEffect(() => {
    if (feed.data) ensureProfiles([...feed.data.users, ...feed.data.withNotes.map((b) => b.pubkey)]);
  }, [feed.data]);

  const addHref = acc ? '/book/add' : '/login?next=%2Fbook%2Fadd';
  const showMove = !acc || (myClaims.data !== undefined && myClaims.data.length === 0);

  return (
    <div class="home">
      {acc ? (
        <section class="home-welcome">
          <div>
            <h1>Что вы прочитали недавно?</h1>
            <p>Запишите книгу, пока свежи впечатления.</p>
          </div>
          <a class="btn btn-primary btn-lg" href={addHref}>
            Добавить запись о книге
          </a>
        </section>
      ) : (
        <section class="home-hero">
          <div class="home-hero-main">
            <h1>Привет, читатель!</h1>
            <p class="lead">
              Этот сервис создан для того, чтобы вы могли сохранить и в любое время получить список прочитанных вами
              книг.
            </p>
            <a class="btn btn-primary btn-lg" href={addHref}>
              Добавить запись о книге
            </a>
          </div>
          <MovePanel archive={archive.data} />
        </section>
      )}

      <div class="home-grid">
        <div class="home-main">
          {feed.error ? <ErrorAlert error={feed.error} onRetry={feed.reload} /> : null}
          {feed.loading && !feed.data ? <Loading>Загрузка новых записей</Loading> : null}

          {feed.data && feed.data.withNotes.length > 0 && (
            <section class="home-section">
              <h2 class="section-title">Недавно прочитали</h2>
              <ul class="feed">
                {feed.data.withNotes.map((b) => (
                  <FeedItem
                    key={`${b.pubkey}:${b.d}`}
                    title={b.title}
                    author={b.author}
                    notes={b.notes}
                    seed={b.pubkey}
                    who={<a href={userPath(b.pubkey)}>{displayName(b.pubkey)}</a>}
                    when={shortDate(new Date(b.createdAt * 1000))}
                  />
                ))}
              </ul>
            </section>
          )}

          {archive.data && archive.data.items.length > 0 && (
            <section class="home-section">
              <h2 class="section-title">
                Из старой Книгописи <span class="label-archive">архив</span>
              </h2>
              <ul class="feed feed-archive">
                {archive.data.items.slice(0, 5).map((b) => (
                  <FeedItem
                    key={`${b.userId}:${b.id}`}
                    title={b.title}
                    author={b.author}
                    notes={b.notes}
                    seed={b.userId}
                    who={<a href={archivePath(b.userId)}>{b.nickname}</a>}
                    when={b.createdAt ? shortDate(new Date(b.createdAt.replace(' ', 'T'))) : ''}
                  />
                ))}
              </ul>
              <p class="section-more">
                <a href="/search">Искать в архиве &rarr;</a>
              </p>
            </section>
          )}
        </div>

        <aside class="home-aside">
          {acc && showMove && <MovePanel archive={archive.data} />}
          {feed.data && feed.data.users.length > 0 && (
            <section class="aside-block">
              <h2 class="aside-title">Недавние читатели</h2>
              <ul class="user-chips">
                {feed.data.users.map((pk) => (
                  <li key={pk}>
                    <a href={userPath(pk)}>
                      <Avatar seed={pk} size={18} />
                      <span>{displayName(pk)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Why />
          <NodeCta />
        </aside>
      </div>
    </div>
  );
}
