import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { account } from '../lib/account';
import { choiceFromRead, DEFAULT_CHOICE, readFromChoice, type DateChoice } from '../lib/dates';
import { deleteBook, deleteWish, fetchBook, fetchWish, newId, saveBook, type Book } from '../lib/records';
import { rememberOwnAuthor } from '../lib/suggest';
import { ReadDateInput } from '../components/ReadDateInput';
import { ErrorAlert, Loading, useAsync } from '../components/Status';
import { TitleAuthorInputs } from '../components/TitleAuthorInputs';
import { userPath } from '../components/UserLink';
import { decodeParam } from './ArchiveUser';
import { LoginRequired } from './Login';
import { NotFound } from './NotFound';

interface Fields {
  title: string;
  author: string;
  notes: string;
}

const blank = (title = '', author = ''): Fields => ({ title, author, notes: '' });

export function BookForm() {
  const acc = account.value;
  const { params } = useRoute();
  const { query, route } = useLocation();
  const d = params.d ? decodeParam(params.d) : null;
  const existing = useAsync(() => (d && acc ? fetchBook(acc.pk, d) : Promise.resolve(null)), [d, acc?.pk]);
  const [fields, setFields] = useState<Fields>(() => blank(query.title, query.author));
  // Дата не сбрасывается после «Сохранить и добавить ещё»: книги из прошлого вносят пачкой.
  const [date, setDate] = useState<DateChoice>(DEFAULT_CHOICE);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const b = existing.data;
    if (b) {
      setFields({ title: b.title, author: b.author, notes: b.notes });
      setDate(choiceFromRead(b));
    }
  }, [existing.data]);

  if (!acc) return <LoginRequired what="добавлять книги" />;
  if (d && existing.loading && !existing.data) return <Loading />;
  if (d && existing.error) return <ErrorAlert error={existing.error} onRetry={existing.reload} />;
  if (d && !existing.data) return <NotFound />;

  const change = (patch: Partial<Fields>) => {
    setSaved(false);
    setFields((f) => ({ ...f, ...patch }));
  };

  const save = async (andMore: boolean) => {
    setError(null);
    if (!fields.title.trim()) {
      setError(new Error('Укажите заголовок книги'));
      return;
    }
    setBusy(true);
    try {
      const book: Omit<Book, 'pubkey' | 'createdAt'> = {
        d: existing.data?.d ?? newId(),
        title: fields.title.trim(),
        author: fields.author.trim(),
        notes: fields.notes,
        ...readFromChoice(date),
        legacy: existing.data?.legacy ?? null,
      };
      await saveBook(book, existing.data?.createdAt);
      rememberOwnAuthor(acc.pk, book.author);
      // «Прочитано!» из списка желаний: желание больше не нужно.
      if (query.wish) {
        const wish = await fetchWish(acc.pk, query.wish);
        if (wish) await deleteWish(wish);
      }
      if (andMore) {
        setFields(blank());
        setSaved(true);
        if (d || query.wish || query.title) route('/book/add', true);
      } else {
        route(userPath(acc.pk));
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!existing.data || !confirm(`Удалить «${existing.data.title}»?`)) return;
    setBusy(true);
    try {
      await deleteBook(existing.data);
      route(userPath(acc.pk));
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <div class="form-narrow">
      <h1>{d ? 'Редактирование записи' : 'Новая запись о книге'}</h1>
      <p class="private-text-info">Запись будет видна всем</p>
      {existing.data?.legacy && (
        <p class="text-muted">
          <small>Перенесена из архива старой Книгописи{existing.data.legacy.createdAt ? `, добавлена ${existing.data.legacy.createdAt.slice(0, 10)}` : ''}.</small>
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
      >
        <TitleAuthorInputs idPrefix="book" pk={acc.pk} title={fields.title} author={fields.author} autoFocus={!d} onChange={change} />
        <ReadDateInput
          value={date}
          onChange={(c) => {
            setSaved(false);
            setDate(c);
          }}
        />
        <div class="form-group">
          <label for="book-notes">Ваши примечания</label>
          <textarea id="book-notes" class="form-control" value={fields.notes} onInput={(e) => change({ notes: e.currentTarget.value })} />
        </div>

        {error ? <ErrorAlert error={error} /> : null}
        {saved && (
          <div class="alert alert-success" role="status">
            Запись успешно сохранена
          </div>
        )}

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" disabled={busy}>
            Сохранить и закрыть
          </button>
          <button type="button" class="btn btn-default" disabled={busy} onClick={() => save(true)}>
            Сохранить и добавить ещё
          </button>
          {d && (
            <button type="button" class="btn btn-danger push-right" disabled={busy} onClick={remove}>
              Удалить запись
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
