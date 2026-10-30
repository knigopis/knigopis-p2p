import { useEffect } from 'preact/hooks';
import { account } from '../lib/account';
import { legacyLatest } from '../lib/legacy';
import { ensureProfiles } from '../lib/profiles';
import { fetchLatestBooks, fetchLatestClaims } from '../lib/records';
import { archivePath, UserLink } from '../components/UserLink';
import { ErrorAlert, Loading, useAsync } from '../components/Status';

async function loadFeed() {
  const [books, claims] = await Promise.all([fetchLatestBooks(), fetchLatestClaims()]);
  // Недавние пользователи: авторы новых книг и те, кто недавно перенёс записи.
  const recent = [...books.map((b) => [b.pubkey, b.createdAt] as const), ...claims.map((c) => [c.pubkey, c.createdAt] as const)]
    .sort((a, b) => b[1] - a[1])
    .map(([pk]) => pk);
  const users = [...new Set(recent)].slice(0, 30);
  const withNotes = books.filter((b) => b.notes.trim()).slice(0, 15);
  return { users, withNotes };
}

export function Home() {
  const acc = account.value;
  const feed = useAsync(loadFeed, []);
  const archive = useAsync(legacyLatest, []);

  useEffect(() => {
    if (feed.data) ensureProfiles([...feed.data.users, ...feed.data.withNotes.map((b) => b.pubkey)]);
  }, [feed.data]);

  const addHref = acc ? '/book/add' : '/login?next=%2Fbook%2Fadd';

  return (
    <div class="index-content">
      <div class="jumbotron">
        <h1>Привет, читатель!</h1>
        <p>
          Этот сервис создан для того, чтобы вы могли сохранить и в любое время получить список прочитанных вами книг.
        </p>
        <div class="actions">
          <a class="btn btn-primary btn-lg" href={addHref} role="button">
            Добавить запись о книге &raquo;
          </a>
          <a class="btn btn-default btn-lg" href="/search" role="button">
            Найти свои старые записи
          </a>
        </div>
      </div>

      <div class="alert alert-info">
        <p>
          <strong>Книгопись переезжает.</strong> Старый сервер и вход через соцсети больше не работают. Новая Книгопись
          обходится без них: аккаунт — это ключ, который хранится у вас, а записи лежат сразу на нескольких серверах.
        </p>
        <p>
          Все старые записи сохранены. <a href="/search">Найдите себя в архиве</a> и перенесите свои книги в новый
          аккаунт — это пара кликов.
        </p>
      </div>

      <p class="text-center">
        Конечно, такой сервис не единственный. Но у изученных нами конкурентов есть недостатки, и некоторые из них не
        устраивали авторов проекта. Речь не только о фатальном недостатке. Итак, наши преимущества:
      </p>
      <div class="features">
        <div>
          <h4>Свобода ввода</h4>
          <p>
            Нет привязки к конкретным книгам. Пишите в заголовок и в автора то, что вы сами хотите. Указывайте дату
            прочтения, какую вам удобно: полную, только год или год и месяц. Можно и вовсе без даты.
          </p>
        </div>
        <div>
          <h4>Ваши примечания</h4>
          <p>
            Вместо оценок мы предлагаем добавить ваши примечания к книге: насколько она понравилась, что в ней
            интересного или кому бы вы её порекомендовали — в удобном вам формате.
          </p>
        </div>
        <div>
          <h4>Лёгкость просмотра</h4>
          <p>
            Мы постарались сделать список прочитанного лёгким, но в то же время информативным. Данные общедоступны для
            чтения. В любое время вы можете поделиться вашим списком.
          </p>
        </div>
        <div>
          <h4>Долговечность</h4>
          <p>
            Каждая запись подписана вашим ключом и хранится сразу на нескольких независимых серверах. Поднять ещё одну
            копию может кто угодно, а подделать запись — никто. Исчезновение одного сервера ничего не ломает.
          </p>
          <p>
            Хотите помочь? <a href="/node">Поднимите свой узел</a>.
          </p>
        </div>
      </div>

      {feed.error ? <ErrorAlert error={feed.error} onRetry={feed.reload} /> : null}
      {feed.loading && !feed.data ? <Loading>Загрузка новых записей</Loading> : null}

      {feed.data && feed.data.users.length > 0 && (
        <div class="home-section">
          <h4>Недавние пользователи</h4>
          <ul class="list-inline">
            {feed.data.users.map((pk) => (
              <li key={pk}>
                <UserLink pubkey={pk} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {feed.data && feed.data.withNotes.length > 0 && (
        <div class="home-section">
          <h4>Некоторые недавние книги с примечаниями</h4>
          <ul class="latest-books">
            {feed.data.withNotes.map((b) => (
              <li key={`${b.pubkey}:${b.d}`}>
                {b.title} ~ <UserLink pubkey={b.pubkey} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {archive.data && archive.data.length > 0 && (
        <div class="home-section">
          <h4>
            Последние книги с примечаниями в старой Книгописи <span class="label-archive">архив</span>
          </h4>
          <ul class="latest-books">
            {archive.data.slice(0, 10).map((b) => (
              <li key={`${b.userId}:${b.id}`}>
                {b.title} ~ <a href={archivePath(b.userId)}>{b.nickname}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
