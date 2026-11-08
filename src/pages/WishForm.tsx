import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { account } from '../lib/account';
import { deleteWish, fetchWish, newId, saveWish } from '../lib/records';
import { rememberOwnAuthor } from '../lib/suggest';
import { ErrorAlert, Loading, useAsync } from '../components/Status';
import { TitleAuthorInputs } from '../components/TitleAuthorInputs';
import { userPath } from '../components/UserLink';
import { decodeParam } from './ArchiveUser';
import { LoginRequired } from './Login';
import { NotFound } from './NotFound';

export function WishForm() {
  const acc = account.value;
  const { params } = useRoute();
  const { query, route } = useLocation();
  const d = params.d ? decodeParam(params.d) : null;
  const existing = useAsync(() => (d && acc ? fetchWish(acc.pk, d) : Promise.resolve(null)), [d, acc?.pk]);
  const [title, setTitle] = useState(query.title ?? '');
  const [author, setAuthor] = useState(query.author ?? '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (existing.data) {
      setTitle(existing.data.title);
      setAuthor(existing.data.author);
      setNotes(existing.data.notes);
    }
  }, [existing.data]);

  if (!acc) return <LoginRequired what="вести список «хочу прочитать»" />;
  if (d && existing.loading && !existing.data) return <Loading />;
  if (d && existing.error) return <ErrorAlert error={existing.error} onRetry={existing.reload} />;
  if (d && !existing.data) return <NotFound />;

  const back = `${userPath(acc.pk)}/wishes`;

  const save = async (e: Event) => {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(new Error('Укажите заголовок книги'));
      return;
    }
    setBusy(true);
    try {
      await saveWish(
        {
          d: existing.data?.d ?? newId(),
          title: title.trim(),
          author: author.trim(),
          notes,
          priority: existing.data?.priority ?? null,
          legacy: existing.data?.legacy ?? null,
        },
        existing.data?.createdAt,
      );
      rememberOwnAuthor(acc.pk, author);
      route(back);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing.data || !confirm(`Удалить «${existing.data.title}» из списка?`)) return;
    setBusy(true);
    try {
      await deleteWish(existing.data);
      route(back);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <div class="form-narrow">
      <h1>{d ? 'Редактирование' : 'Добавить к прочтению'}</h1>
      <p class="private-text-info">Запись будет видна всем</p>
      <form onSubmit={save}>
        <TitleAuthorInputs
          idPrefix="wish"
          pk={acc.pk}
          title={title}
          author={author}
          autoFocus={!d}
          onChange={(patch) => {
            if (patch.title !== undefined) setTitle(patch.title);
            if (patch.author !== undefined) setAuthor(patch.author);
          }}
        />
        <div class="form-group">
          <label for="wish-notes">Примечания</label>
          <textarea id="wish-notes" class="form-control" value={notes} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Например, кто посоветовал" />
        </div>
        {error ? <ErrorAlert error={error} /> : null}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={busy}>
            Сохранить
          </button>
          <a class="btn btn-default" href={back}>
            Отмена
          </a>
          {d && (
            <button type="button" class="btn btn-danger push-right" disabled={busy} onClick={remove}>
              Удалить
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
