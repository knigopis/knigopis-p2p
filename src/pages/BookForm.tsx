import { useEffect, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { account } from '../lib/account';
import { deleteBook, deleteWish, fetchBook, fetchWish, newId, saveBook, type Book } from '../lib/records';
import { ErrorAlert, Loading, useAsync } from '../components/Status';
import { userPath } from '../components/UserLink';
import { decodeParam } from './ArchiveUser';
import { LoginRequired } from './Login';
import { NotFound } from './NotFound';

interface Fields {
  title: string;
  author: string;
  readYear: string;
  readMonth: string;
  readDay: string;
  notes: string;
}

const str = (n: number | null) => (n == null ? '' : String(n));

function blank(title = '', author = ''): Fields {
  const d = new Date();
  return { title, author, readYear: String(d.getFullYear()), readMonth: String(d.getMonth() + 1), readDay: '', notes: '' };
}

function parse(f: Fields): { readYear: number | null; readMonth: number | null; readDay: number | null } {
  const num = (s: string, min: number, max: number, what: string) => {
    if (!s.trim()) return null;
    const n = Number(s);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`Проверьте ${what}: от ${min} до ${max}`);
    return n;
  };
  const readYear = num(f.readYear, 1000, new Date().getFullYear() + 1, 'год');
  const readMonth = readYear ? num(f.readMonth, 1, 12, 'месяц') : null;
  const readDay = readMonth ? num(f.readDay, 1, 31, 'день') : null;
  return { readYear, readMonth, readDay };
}

export function BookForm() {
  const acc = account.value;
  const { params } = useRoute();
  const { query, route } = useLocation();
  const d = params.d ? decodeParam(params.d) : null;
  const existing = useAsync(() => (d && acc ? fetchBook(acc.pk, d) : Promise.resolve(null)), [d, acc?.pk]);
  const [fields, setFields] = useState<Fields>(() => blank(query.title, query.author));
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const b = existing.data;
    if (b) {
      setFields({
        title: b.title,
        author: b.author,
        readYear: str(b.readYear),
        readMonth: str(b.readMonth),
        readDay: str(b.readDay),
        notes: b.notes,
      });
    }
  }, [existing.data]);

  if (!acc) return <LoginRequired what="добавлять книги" />;
  if (d && existing.loading && !existing.data) return <Loading />;
  if (d && existing.error) return <ErrorAlert error={existing.error} onRetry={existing.reload} />;
  if (d && !existing.data) return <NotFound />;

  const set = (key: keyof Fields) => (e: Event) => {
    setSaved(false);
    setFields({ ...fields, [key]: (e.currentTarget as HTMLInputElement).value });
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
        ...parse(fields),
        legacy: existing.data?.legacy ?? null,
      };
      await saveBook(book);
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
        <div class="form-group">
          <label for="book-title">Заголовок книги</label>
          <input id="book-title" class="form-control" placeholder="Укажите заголовок" value={fields.title} onInput={set('title')} autoFocus={!d} />
        </div>
        <div class="form-group">
          <label for="book-author">Автор книги</label>
          <input id="book-author" class="form-control" placeholder="Укажите автора" value={fields.author} onInput={set('author')} />
        </div>
        <div class="form-group">
          <label for="book-year">Приблизительная дата прочтения книги</label>
          <div class="date-inputs">
            <input id="book-year" class="form-control" type="number" inputMode="numeric" placeholder="год" value={fields.readYear} onInput={set('readYear')} />
            <input class="form-control" type="number" inputMode="numeric" min={1} max={12} placeholder="месяц" aria-label="месяц" value={fields.readMonth} onInput={set('readMonth')} />
            <input class="form-control" type="number" inputMode="numeric" min={1} max={31} placeholder="день" aria-label="день" value={fields.readDay} onInput={set('readDay')} />
          </div>
          <p class="help-block">Можно указать только год, год и месяц или полную дату. Можно и не указывать.</p>
        </div>
        <div class="form-group">
          <label for="book-notes">Ваши примечания</label>
          <textarea id="book-notes" class="form-control" value={fields.notes} onInput={set('notes')} />
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
