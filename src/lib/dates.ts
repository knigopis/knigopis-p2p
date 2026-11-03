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
