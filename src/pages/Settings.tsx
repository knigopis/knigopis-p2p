import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { normalizeURL } from 'nostr-tools/utils';
import { account, loginLink, logout } from '../lib/account';
import { pool, relays, resetRelays, setRelays } from '../lib/nostr';
import { ensureProfiles, profiles, saveProfile } from '../lib/profiles';
import { fetchClaimsBy } from '../lib/records';
import { QR } from '../components/QR';
import { ErrorAlert, useAsync } from '../components/Status';
import { archivePath } from '../components/UserLink';
import { LoginRequired, saveBackup } from './Login';

function Nickname({ pk }: { pk: string }) {
  const current = profiles.value[pk]?.name ?? '';
  const [name, setName] = useState(current);
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle');
  const [error, setError] = useState<unknown>(null);
  useEffect(() => setName(current), [current]);

  const save = async (e: Event) => {
    e.preventDefault();
    setState('busy');
    setError(null);
    try {
      await saveProfile(pk, name.trim());
      setState('saved');
    } catch (err) {
      setError(err);
      setState('idle');
    }
  };

  return (
    <form class="panel" onSubmit={save}>
      <h3>Ник</h3>
      <div class="inline-form">
        <input class="form-control" value={name} maxLength={60} onInput={(e) => { setName(e.currentTarget.value); setState('idle'); }} aria-label="Ник" />
        <button class="btn btn-primary" type="submit" disabled={state === 'busy' || !name.trim()}>
          Сохранить
        </button>
      </div>
      {state === 'saved' && <p class="text-success">Сохранено</p>}
      {error ? <ErrorAlert error={error} /> : null}
    </form>
  );
}

function Relays() {
  const [text, setText] = useState(relays.value.join('\n'));
  const [, tick] = useState(0);
  // Статус соединений меняется сам по себе — перерисовываемся раз в пару секунд.
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);
  const status = pool.listConnectionStatus();

  const save = (e: Event) => {
    e.preventDefault();
    const list = text.split(/\s+/).map((s) => s.trim()).filter((s) => /^wss?:\/\//.test(s));
    if (list.length) setRelays(list);
    setText(relays.value.join('\n'));
  };

  return (
    <form class="panel" onSubmit={save}>
      <h3>Серверы (relay)</h3>
      <p>
        Записи публикуются сразу на все серверы из списка и читаются с любого, который отвечает. Добавьте реплику —
        и данные переживут отключение основного сервера.
      </p>
      <p class="text-muted">
        Список по умолчанию обновляется вместе с сайтом. Запоминаются только ваши изменения: какие серверы вы добавили
        и какие убрали.
      </p>
      <ul class="result-list">
        {relays.value.map((r) => {
          const ok = status.get(normalizeURL(r));
          return (
            <li key={r}>
              <span class={ok ? 'text-success' : 'text-muted'}>{ok ? '● на связи' : '○ нет связи'}</span> <code>{r}</code>
            </li>
          );
        })}
      </ul>
      <div class="form-group">
        <label for="relays">По одному адресу в строке</label>
        <textarea id="relays" class="form-control" style={{ minHeight: '90px' }} value={text} onInput={(e) => setText(e.currentTarget.value)} />
      </div>
      <div class="form-actions">
        <button class="btn btn-default" type="submit">
          Сохранить список
        </button>
        <button
          class="btn btn-link"
          type="button"
          onClick={() => {
            resetRelays();
            setText(relays.value.join('\n'));
          }}
        >
          Вернуть по умолчанию
        </button>
      </div>
    </form>
  );
}

export function Settings() {
  const acc = account.value;
  const { route } = useLocation();
  const [showKey, setShowKey] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const claims = useAsync(() => (acc ? fetchClaimsBy(acc.pk) : Promise.resolve([])), [acc?.pk]);

  useEffect(() => {
    if (acc) ensureProfiles([acc.pk]);
    if (location.hash === '#device') document.getElementById('device')?.scrollIntoView();
  }, [acc]);

  if (!acc) return <LoginRequired what="открыть настройки" />;
  const nickname = profiles.value[acc.pk]?.name ?? '';
  const link = loginLink(acc);

  return (
    <div>
      <h1>Настройки</h1>
      <div class="panels">
        <div>
          <Nickname pk={acc.pk} />

          <div class="panel">
            <h3>Резервная копия ключа</h3>
            <p>
              Ключ — это ваш аккаунт. Он хранится только в этом браузере. Сохраните копию в надёжное место: без неё
              при очистке браузера доступ пропадёт.
            </p>
            <div class="form-actions">
              <button class="btn btn-primary" type="button" onClick={() => saveBackup(acc, nickname)}>
                Скачать резервную копию
              </button>
              <button class="btn btn-default" type="button" onClick={() => setShowKey(!showKey)}>
                {showKey ? 'Скрыть ключ' : 'Показать ключ'}
              </button>
            </div>
            {showKey && <code class="secret">{acc.nsec}</code>}
            <p class="help-block">
              Публичный ключ (его можно показывать): <code>{acc.npub}</code>
            </p>
          </div>

          <div class="panel" id="device">
            <h3>Вход на другом устройстве</h3>
            <p>Наведите камеру телефона на QR-код и откройте ссылку — телефон войдёт в этот же аккаунт.</p>
            {showQr ? (
              <>
                <div class="alert alert-warning">
                  Кто увидит этот код, сможет писать от вашего имени. Не показывайте его посторонним.
                </div>
                <QR text={link} />
                <div class="form-actions">
                  <button class="btn btn-default" type="button" onClick={() => navigator.clipboard?.writeText(link)}>
                    Скопировать ссылку
                  </button>
                  <button class="btn btn-default" type="button" onClick={() => setShowQr(false)}>
                    Скрыть
                  </button>
                </div>
              </>
            ) : (
              <button class="btn btn-default" type="button" onClick={() => setShowQr(true)}>
                Показать QR-код
              </button>
            )}
          </div>
        </div>

        <div>
          <div class="panel">
            <h3>Старые записи</h3>
            {claims.data && claims.data.length > 0 ? (
              <p>
                Перенесено из архива:{' '}
                {claims.data.map((c, i) => (
                  <span key={c.legacyId}>
                    {i > 0 && ', '}
                    <a href={archivePath(c.legacyId)}>{c.nickname || c.legacyId}</a>
                  </span>
                ))}
              </p>
            ) : (
              <p>Вы ещё не переносили записи из старой Книгописи.</p>
            )}
            <a class="btn btn-default" href="/search">
              Найти в архиве
            </a>
          </div>

          <Relays />

          <div class="panel">
            <h3>Выход</h3>
            <p>Ключ будет удалён из этого браузера. Войти снова можно с резервной копией.</p>
            <button
              class="btn btn-danger"
              type="button"
              onClick={() => {
                if (confirm('Выйти? Без резервной копии ключа войти снова не получится.')) {
                  logout();
                  route('/');
                }
              }}
            >
              Выйти
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
