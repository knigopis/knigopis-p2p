import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { groupByYear, readDayMonth, type ReadDate } from '../lib/dates';
import { Cover } from './Cover';

export interface ListAction {
  href: string;
  label: string;
}

export interface ListItem extends ReadDate {
  key: string;
  title: string;
  author: string;
  notes: string;
  actions: ListAction[];
}

function Actions({ actions }: { actions: ListAction[] }) {
  if (!actions.length) return null;
  return (
    <span class="book-actions">
      {actions.map((a) => (
        <a key={a.href} href={a.href}>
          {a.label}
        </a>
      ))}
    </span>
  );
}

// Запись как в дневнике: на широком экране дата прочтения — слева отдельной колонкой,
// за ней обложка.
function Entry(props: { title: string; author: string; notes: string; date?: string; actions: ListAction[] }) {
  return (
    <li class={props.date !== undefined ? 'entry has-date' : 'entry'}>
      {props.date !== undefined && <div class="entry-date">{props.date}</div>}
      <Cover class="entry-cover" title={props.title} author={props.author} />
      <div class="entry-body">
        <div class="entry-head">
          <span class="book-title">{props.title || 'Без названия'}</span>
          <Actions actions={props.actions} />
        </div>
        {props.author && <div class="entry-author">{props.author}</div>}
        {props.notes && <p class="entry-notes">{props.notes}</p>}
      </div>
    </li>
  );
}

const yearLabel = (year: number | null) => (year ? String(year) : 'Без даты');

// 1 книга, 2 книги, 5 книг.
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word = m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
  return `${n.toLocaleString('ru-RU')} ${word}`;
}

function scrollToYear(key: string) {
  document.getElementById(`year-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Список книг по годам с оглавлением (как в v1): справа на широком экране,
// лентой сверху на узком.
export function BookList({ items, empty = 'Записей ещё нет' }: { items: ListItem[]; empty?: string }) {
  const groups = useMemo(() => groupByYear(items), [items]);
  const [active, setActive] = useState(groups[0]?.key);
  const chipsRef = useRef<HTMLElement>(null);
  const hasNav = groups.length > 1;

  // Подсветка года, который сейчас на экране.
  useEffect(() => {
    if (!hasNav) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chips-h')) + 90;
      let current = groups[0].key;
      for (const g of groups) {
        const el = document.getElementById(`year-${g.key}`);
        if (el && el.getBoundingClientRect().top <= offset) current = g.key;
      }
      setActive(current);
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [groups, hasNav]);

  // Активный год в ленте — в видимую часть ленты.
  useEffect(() => {
    const strip = chipsRef.current;
    const chip = strip?.querySelector<HTMLElement>('a.active');
    if (strip && chip) strip.scrollLeft = chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2;
  }, [active]);

  if (!items.length) {
    return (
      <p>
        <em>{empty}</em>
      </p>
    );
  }

  const links = (withCount: boolean) =>
    groups.map((g) => (
      <a
        key={g.key}
        href={`#year-${g.key}`}
        class={g.key === active ? 'active' : ''}
        onClick={(e) => {
          e.preventDefault();
          scrollToYear(g.key);
        }}
      >
        <span>{yearLabel(g.year)}</span>
        {withCount ? <span class="text-muted">{g.items.length}</span> : null}
      </a>
    ));

  return (
    <>
      {hasNav && (
        <nav class="year-chips" ref={chipsRef} aria-label="Годы">
          {links(false)}
        </nav>
      )}
      <div class={`books-layout${hasNav ? ' has-nav' : ''}`}>
        <div>
          {groups.map((g) => (
            <section class="book-group" key={g.key}>
              <h2 class="year-title" id={`year-${g.key}`}>
                {yearLabel(g.year)} <span class="year-count">{plural(g.items.length, ['книга', 'книги', 'книг'])}</span>
              </h2>
              <ul class="entries">
                {g.items.map((item) => (
                  <Entry
                    key={item.key}
                    title={item.title}
                    author={item.author}
                    notes={item.notes}
                    date={g.year ? readDayMonth(item) : undefined}
                    actions={item.actions}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
        {hasNav && (
          <aside class="year-nav">
            <div class="aside-title">Годы</div>
            <ul class="sidenav-years">
              {links(true).map((a) => (
                <li key={a.key}>{a}</li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </>
  );
}

export interface WishItem {
  key: string;
  title: string;
  author: string;
  notes: string;
  actions: ListAction[];
}

export function WishList({ items, empty = 'Список пуст' }: { items: WishItem[]; empty?: string }) {
  if (!items.length) {
    return (
      <p>
        <em>{empty}</em>
      </p>
    );
  }
  return (
    <ul class="entries">
      {items.map((w) => (
        <Entry key={w.key} title={w.title} author={w.author} notes={w.notes} actions={w.actions} />
      ))}
    </ul>
  );
}
