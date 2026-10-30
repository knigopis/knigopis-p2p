import { useEffect, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import { account } from '../lib/account';
import { importLegacy, type ImportOptions, type ImportProgress, type ImportResult } from '../lib/importer';
import { legacyUser } from '../lib/legacy';
import { ensureProfiles, profiles, saveProfile } from '../lib/profiles';
import { ErrorAlert, Loading, useAsync } from '../components/Status';
import { archivePath, userPath } from '../components/UserLink';
import { decodeParam } from './ArchiveUser';
import { LoginRequired } from './Login';
import { NotFound } from './NotFound';

export function Import() {
  const { params } = useRoute();
  const id = decodeParam(params.id);
  const acc = account.value;
  const user = useAsync(() => legacyUser(id), [id]);
  const [opts, setOpts] = useState<ImportOptions>({ books: true, wishes: true, subscriptions: true });
  const [takeNick, setTakeNick] = useState(true);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (acc) ensureProfiles([acc.pk]);
  }, [acc]);

  if (!acc) return <LoginRequired what="перенести записи" />;
  if (user.error) return <ErrorAlert error={user.error} onRetry={user.reload} />;
  if (user.loading && !user.data) return <Loading />;
  if (!user.data) return <NotFound />;

  const u = user.data;
  const myName = profiles.value[acc.pk]?.name ?? '';
  const canTakeNick = myName !== u.nickname;

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      if (takeNick && canTakeNick) await saveProfile(acc.pk, u.nickname);
      setResult(await importLegacy(u, opts, setProgress));
    } catch (e) {
      setError(e);
    } finally {
      setRunning(false);
    }
  };

  const toggle = (key: keyof ImportOptions) => setOpts({ ...opts, [key]: !opts[key] });
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div class="form-narrow">
      <h1>Перенос записей из архива</h1>
      <p>
        Пользователь <a href={archivePath(u.id)}>{u.nickname}</a> из старой Книгописи. Записи будут скопированы в ваш
        новый аккаунт и подписаны вашим ключом. Архив при этом не меняется.
      </p>

      {result ? (
        <div class="alert alert-success">
          <p>
            <strong>Готово!</strong> Перенесено книг: {result.books}, желаний: {result.wishes}
            {result.skipped ? `; уже были перенесены раньше: ${result.skipped}` : ''}.
          </p>
          {result.failed > 0 && <p class="text-danger">Не удалось сохранить: {result.failed}. Запустите перенос ещё раз — дубли не появятся.</p>}
          {opts.subscriptions && u.subscriptions.length > 0 && (
            <p>
              Подписки: {result.followed ? `вы подписаны на ${result.followed} из тех, кто уже перешёл` : 'из ваших старых подписок пока никто не перешёл'}
              {result.pendingFollows ? `; ещё не перешли — ${result.pendingFollows}. Когда они появятся, вы увидите их в разделе «Подписки».` : '.'}
            </p>
          )}
          <p>
            <a class="btn btn-success" href={userPath(acc.pk)}>
              К моим книгам
            </a>
          </p>
        </div>
      ) : (
        <>
          <div class="checkbox">
            <label>
              <input type="checkbox" checked={opts.books} onChange={() => toggle('books')} disabled={running} />
              Прочитанные книги — {u.books.length}
            </label>
          </div>
          <div class="checkbox">
            <label>
              <input type="checkbox" checked={opts.wishes} onChange={() => toggle('wishes')} disabled={running} />
              Список «хочу прочитать» — {u.wishes.length}
            </label>
          </div>
          <div class="checkbox">
            <label>
              <input
                type="checkbox"
                checked={opts.subscriptions}
                onChange={() => toggle('subscriptions')}
                disabled={running || !u.subscriptions.length}
              />
              Подписки — {u.subscriptions.length}
              {u.subscriptions.length ? ' (на тех, кто уже перенёс свои записи; остальные — по мере переезда)' : ''}
            </label>
          </div>
          {canTakeNick && (
            <div class="checkbox">
              <label>
                <input type="checkbox" checked={takeNick} onChange={() => setTakeNick(!takeNick)} disabled={running} />
                Взять ник «{u.nickname}»{myName ? ` вместо «${myName}»` : ''}
              </label>
            </div>
          )}

          <div class="alert alert-warning">
            Старый вход не работает, поэтому проверить, что это именно ваши записи, нельзя. Записи в архиве открыты
            всем, и на странице архива видно, кто их перенёс. Пожалуйста, переносите только свои.
          </div>

          {error ? <ErrorAlert error={error} /> : null}

          {progress && (
            <div class="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div class="progress-bar" style={{ width: `${pct}%` }}>
                {progress.done} / {progress.total}
              </div>
            </div>
          )}

          <div class="form-actions">
            <button class="btn btn-primary" type="button" onClick={run} disabled={running || (!opts.books && !opts.wishes && !opts.subscriptions)}>
              {running ? 'Переношу…' : 'Перенести'}
            </button>
            <a class="btn btn-default" href={archivePath(u.id)}>
              Отмена
            </a>
          </div>
        </>
      )}
    </div>
  );
}
