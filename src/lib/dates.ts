export interface ReadDate {
  readYear: number | null;
  readMonth: number | null;
  readDay: number | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

// Дата внутри года (год виден по группе): «1 ноября», «ноябрь» или ''.
export function readDayMonth(r: ReadDate): string {
  if (!r.readMonth || r.readMonth > 12) return '';
  return r.readDay ? `${r.readDay} ${MONTHS[r.readMonth - 1]}` : MONTHS_NOM[r.readMonth - 1];
}

// Короткая дата записи: «30 октября», в прошлые годы — «12 мая 2019».
export function shortDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

// Тег read события: «ГГГГ», «ГГГГ-ММ» или «ГГГГ-ММ-ДД».
export function readTag(r: ReadDate): string | null {
  if (!r.readYear) return null;
  if (!r.readMonth) return String(r.readYear);
  return r.readDay ? `${r.readYear}-${pad(r.readMonth)}-${pad(r.readDay)}` : `${r.readYear}-${pad(r.readMonth)}`;
}

export function parseReadTag(value: string | undefined): ReadDate {
  const m = value?.match(/^(\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
  if (!m) return { readYear: null, readMonth: null, readDay: null };
  return {
    readYear: Number(m[1]),
    readMonth: m[2] ? Number(m[2]) : null,
    readDay: m[2] && m[3] ? Number(m[3]) : null,
  };
}

// --- Выбор даты в форме книги: насколько точно человек помнит, когда прочитал ---

export type DateMode = 'today' | 'month' | 'year' | 'custom' | 'none';

export interface DateChoice {
  mode: DateMode;
  // Поля «Раньше…» — как ввёл человек.
  year: string;
  month: string;
  day: string;
}

export const MONTH_NAMES = MONTHS_NOM;

export const DEFAULT_CHOICE: DateChoice = { mode: 'month', year: '', month: '', day: '' };

// Дней в месяце; если год неизвестен — високосный, чтобы 29 февраля было можно выбрать.
export function daysInMonth(year: number | null, month: number): number {
  return new Date(year ?? 2000, month, 0).getDate();
}

const str = (n: number | null) => (n == null ? '' : String(n));

export function choiceFromRead(r: ReadDate, now = new Date()): DateChoice {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const fields = { year: str(r.readYear), month: r.readYear ? str(r.readMonth) : '', day: r.readYear && r.readMonth ? str(r.readDay) : '' };
  let mode: DateMode = 'custom';
  if (!r.readYear) mode = 'none';
  else if (r.readYear === y && r.readMonth === m && r.readDay === now.getDate()) mode = 'today';
  else if (r.readYear === y && r.readMonth === m && !r.readDay) mode = 'month';
  else if (r.readYear === y && !r.readMonth) mode = 'year';
  return { mode, ...fields };
}

// Дата для события; для «Раньше…» с ошибкой во вводе — исключение с понятным текстом.
export function readFromChoice(c: DateChoice, now = new Date()): ReadDate {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  switch (c.mode) {
    case 'today':
      return { readYear: y, readMonth: m, readDay: now.getDate() };
    case 'month':
      return { readYear: y, readMonth: m, readDay: null };
    case 'year':
      return { readYear: y, readMonth: null, readDay: null };
    case 'none':
      return { readYear: null, readMonth: null, readDay: null };
  }
  const year = c.year.trim();
  if (!year) throw new Error('Укажите год — или выберите «Не помню»');
  const readYear = Number(year);
  if (!/^\d{4}$/.test(year) || readYear < 1000 || readYear > y) throw new Error(`Проверьте год: от 1000 до ${y}`);
  const readMonth = c.month ? Number(c.month) : null;
  const readDay = readMonth && c.day ? Number(c.day) : null;
  if (readMonth && readDay && readDay > daysInMonth(readYear, readMonth)) throw new Error('Проверьте день: в этом месяце столько нет');
  const future = readYear === y && readMonth && (readMonth > m || (readMonth === m && readDay && readDay > now.getDate()));
  if (future) throw new Error('Эта дата ещё не наступила');
  return { readYear, readMonth, readDay };
}

// «8 ноября 2026», «ноябрь 2026», «2026 год» или «без даты».
export function describeRead(r: ReadDate): string {
  if (!r.readYear) return 'без даты';
  if (!r.readMonth || r.readMonth > 12) return `${r.readYear} год`;
  if (!r.readDay) return `${MONTHS_NOM[r.readMonth - 1]} ${r.readYear}`;
  return `${r.readDay} ${MONTHS[r.readMonth - 1]} ${r.readYear}`;
}

export function compareReadDesc(a: ReadDate, b: ReadDate): number {
  return (
    (b.readYear ?? 0) - (a.readYear ?? 0) ||
    (b.readMonth ?? 0) - (a.readMonth ?? 0) ||
    (b.readDay ?? 0) - (a.readDay ?? 0)
  );
}

export interface YearGroup<T> {
  key: string;
  year: number | null;
  items: T[];
}

// Группы по году прочтения, новые сверху; без года — в конце.
export function groupByYear<T extends ReadDate>(items: T[]): YearGroup<T>[] {
  const groups = new Map<string, YearGroup<T>>();
  for (const item of items) {
    const key = item.readYear ? String(item.readYear) : 'other';
    if (!groups.has(key)) groups.set(key, { key, year: item.readYear, items: [] });
    groups.get(key)!.items.push(item);
  }
  return [...groups.values()].sort((a, b) => (b.year ?? -1) - (a.year ?? -1));
}

export function formatDateTime(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
