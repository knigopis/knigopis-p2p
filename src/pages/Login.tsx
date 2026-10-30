import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { account, backupText, createAccount, login, parseSecret, type Account } from '../lib/account';
import { saveProfile } from '../lib/profiles';
import { downloadText, safeNext } from '../lib/util';
import { ErrorAlert } from '../components/Status';
import { userPath } from '../components/UserLink';

export function LoginRequired({ what }: { what: string }) {
  const { url } = useLocation();
  return (
    <div class="alert alert-warning">
      Войдите, чтобы {what}. <a href={`/login?next=${encodeURIComponent(url)}`}>Войти или создать аккаунт</a>
    </div>
  );
}

export function saveBackup(acc: Account, nickname: string) {
  downloadText(`knigopis-key-${nickname || acc.npub.slice(5, 13)}.txt`, backupText(acc, nickname));
}

export function Login() {
  const { query, route } = useLocation();
  const next = safeNext(query.next);
  const [created, setCreated] = useState<Account | null>(null);
  const [nick, setNick] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Вход по QR-ссылке /login#nsec1…: ключ сразу убираем из адресной строки.
  useEffect(() => {
    const hash = location.hash.slice(1);
    if (!hash) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const acc = login(parseSecret(decodeURIComponent(hash)));
      route(next ?? userPath(acc.pk), true);
    } catch (e) {
      setError(e);
    }
  }, []);

  const signIn = (text: string) => {
    try {
      const acc = login(parseSecret(text));
      route(next ?? userPath(acc.pk));
    } catch (e) {
      setError(e);
    }
  };

  const onFile = async (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (file) signIn(await file.text());
  };

  const create = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const acc = createAccount();
    setCreated(acc);
    try {
      if (nick.trim()) await saveProfile(acc.pk, nick.trim());
    } catch (err) {
      setError(new Error(`Аккаунт создан, но ник сохранить не удалось (${err instanceof Error ? err.message : err}). Его можно задать позже в настройках.`));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <div class="form-narrow">
        <h1>Аккаунт создан</h1>
        {error ? <ErrorAlert error={error} /> : null}
        <div class="alert alert-warning">
          <p>
            <strong>Сохраните резервную копию ключа.</strong> Ключ хранится только в этом браузере. Если очистить
            браузер или потерять устройство, без копии войти снова не получится — восстановить ключ некому.
          </p>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              saveBackup(created, nick.trim());
              setSaved(true);
            }}
          >
            Скачать резервную копию
          </button>
          {saved && <span class="text-success"> ✓ Файл сохранён</span>}
        </div>
        <p>Войти с этим ключом на телефоне можно позже: «Настройки → Вход на другом устройстве» покажет QR-код.</p>
        <div class="form-actions">
          {next ? (
            <a class="btn btn-success" href={next}>
              Продолжить
            </a>
          ) : (
            <>
              <a class="btn btn-success" href="/search">
                Найти свои старые записи
              </a>
              <a class="btn btn-default" href="/book/add">
                Добавить первую книгу
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  if (account.value) {
    return (
      <div>
        <h1>Вы уже вошли</h1>
        <p>
          <a href={next ?? userPath(account.value.pk)}>Продолжить</a> или откройте <a href="/settings">настройки</a>,
          чтобы сменить аккаунт.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Вход</h1>
      <p>
        В новой Книгописи нет логинов и паролей. Аккаунт — это ключ, который создаётся прямо в браузере и хранится
        только у вас. Сервер его не знает, поэтому ваши записи не зависят ни от какого сервера.
      </p>
      {error ? <ErrorAlert error={error} /> : null}
      <div class="panels">
        <form class="panel" onSubmit={create}>
          <h3>Я здесь впервые</h3>
          <div class="form-group">
            <label for="nick">Ваш ник</label>
            <input
              id="nick"
              class="form-control"
              value={nick}
              onInput={(e) => setNick(e.currentTarget.value)}
              placeholder="Например, как в старой Книгописи"
              maxLength={60}
            />
            <p class="help-block">Его увидят другие читатели. Можно сменить потом.</p>
          </div>
          <button class="btn btn-primary" type="submit" disabled={busy}>
            Создать аккаунт
          </button>
          <p class="help-block">Были в старой Книгописи? Создайте аккаунт и перенесите старые записи из архива.</p>
        </form>

        <div class="panel">
          <h3>У меня уже есть ключ</h3>
          <div class="form-group">
            <label for="key-file">Файл резервной копии</label>
            <input id="key-file" type="file" accept=".txt,text/plain" onChange={onFile} />
          </div>
          <form
            class="form-group"
            onSubmit={(e) => {
              e.preventDefault();
              signIn(secret);
            }}
          >
            <label for="key-text">Или вставьте ключ</label>
            <div class="inline-form">
              <input
                id="key-text"
                class="form-control"
                type="password"
                autoComplete="off"
                placeholder="nsec1…"
                value={secret}
                onInput={(e) => setSecret(e.currentTarget.value)}
              />
              <button class="btn btn-default" type="submit" disabled={!secret.trim()}>
                Войти
              </button>
            </div>
          </form>
          <p class="help-block">
            <strong>С телефона:</strong> на устройстве, где вы уже вошли, откройте «Настройки → Вход на другом
            устройстве» и наведите камеру телефона на QR-код.
          </p>
        </div>
      </div>
    </div>
  );
}
