import { useEffect, useState } from 'preact/hooks';
import { account } from '../lib/account';
import { KIND_BOOK } from '../lib/config';
import { myFollows, updateFollows } from '../lib/follows';
import { resolveLegacyFollows } from '../lib/importer';
import { legacyUser } from '../lib/legacy';
import { latestByAddress, query } from '../lib/nostr';
import { ensureProfiles } from '../lib/profiles';
import { bookFromEvent, fetchClaimsBy } from '../lib/records';
import { getSeen } from '../lib/util';
import { ErrorAlert, Loading, useAsync } from '../components/Status';
import { UserLink } from '../components/UserLink';
import { LoginRequired } from './Login';

const MONTH = 30 * 24 * 3600;

// Сколько новых книг у каждого с прошлого просмотра его списка (не старше месяца).
async function countNews(follows: string[]): Promise<Record<string, number>> {
  if (!follows.length) return {};
  const seen = getSeen();
  const floor = Math.floor(Date.now() / 1000) - MONTH;
  const since = Math.min(...follows.map((pk) => Math.max(seen[pk] ?? floor, floor)));
  const events = latestByAddress(await query({ kinds: [KIND_BOOK], authors: follows, since }));
  const counts: Record<string, number> = {};
  for (const ev of events) {
    const b = bookFromEvent(ev);
    if (!b.legacy && b.title && ev.created_at > Math.max(seen[ev.pubkey] ?? floor, floor)) {
      counts[ev.pubkey] = (counts[ev.pubkey] ?? 0) + 1;
    }
  }
  return counts;
}

// Кто из старых подписок (по перенесённым архивам) уже здесь, но ещё не в подписках.
async function legacySuggestions(pk: string, follows: string[]) {
  const claims = await fetchClaimsBy(pk);
  const users = await Promise.all(claims.map((c) => legacyUser(c.legacyId)));
  const ids = [...new Set(users.flatMap((u) => u?.subscriptions ?? []))];
  if (!ids.length) return { found: [], pending: 0 };
  const { found, pending } = await resolveLegacyFollows(ids);
  return { found: found.filter((x) => x !== pk && !follows.includes(x)), pending };
}

export function Subscriptions() {
  const acc = account.value;
  const follows = myFollows.value;
  const key = follows?.join(',') ?? '';
  const news = useAsync(() => countNews(follows ?? []), [key]);
  const suggest = useAsync(() => (acc && follows ? legacySuggestions(acc.pk, follows) : Promise.resolve(null)), [acc?.pk, key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    ensureProfiles([...(follows ?? []), ...(suggest.data?.found ?? [])]);
  }, [key, suggest.data]);

  if (!acc) return <LoginRequired what="смотреть подписки" />;
  if (follows === null) return <Loading />;

  const followAll = async () => {
    if (!suggest.data) return;
    setBusy(true);
    setError(null);
    try {
      await updateFollows(suggest.data.found);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1>Подписки</h1>
      {follows.length ? (
        <ul class="list-inline">
          {follows.map((pk) => (
            <li key={pk}>
              <UserLink pubkey={pk} />
              {news.data?.[pk] ? (
                <sup class="text-success"> +{news.data[pk]}</sup>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          <em>Вы ни на кого не подписаны.</em> Подписаться можно звёздочкой ☆ на странице пользователя.
        </p>
      )}
      {news.error ? <ErrorAlert error={news.error} onRetry={news.reload} /> : null}

      {suggest.data && (suggest.data.found.length > 0 || suggest.data.pending > 0) && (
        <div class="panel home-section">
          <h3>Из старых подписок</h3>
          {suggest.data.found.length > 0 && (
            <>
              <p>Эти люди из ваших подписок в старой Книгописи уже перешли сюда:</p>
              <ul class="list-inline">
                {suggest.data.found.map((pk) => (
                  <li key={pk}>
                    <UserLink pubkey={pk} />
                  </li>
                ))}
              </ul>
              <button class="btn btn-primary" type="button" disabled={busy} onClick={followAll}>
                Подписаться на всех
              </button>
            </>
          )}
          {suggest.data.pending > 0 && (
            <p class="help-block">Ещё не перешли: {suggest.data.pending}. Когда они перенесут свои записи, они появятся здесь.</p>
          )}
          {error ? <ErrorAlert error={error} /> : null}
        </div>
      )}
      {suggest.error ? <ErrorAlert error={suggest.error} onRetry={suggest.reload} /> : null}
    </div>
  );
}
