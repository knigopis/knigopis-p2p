import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { groupByYear, readDateLabel, type ReadDate } from '../lib/dates';

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
          [{a.label}]
        </a>
      ))}
    </span>
  );
}

function BookItem({ item }: { item: ListItem }) {
  const date = readDateLabel(item);
  return (
    <li>
      <span class="book-title">{item.title || 'Без названия'}</span> <Actions actions={item.actions} />
      {item.author && <div>{item.author}</div>}
      {(date || item.notes) && (
        <div class="text-muted">
          {date && <small>[{date}]</small>} {item.notes && <small class="notes">{item.notes}</small>}
        </div>
      )}
    </li>
  );
}

const yearLabel = (year: number | null) => (year ? String(year) : 'Без даты');

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
            <div class="book-group" key={g.key}>
              <h3 id={`year-${g.key}`}>{yearLabel(g.year)}</h3>
              <ul class="books-list">
                {g.items.map((item) => (
                  <BookItem key={item.key} item={item} />
                ))}
              </ul>
            </div>
          ))}
        </div>
        {hasNav && (
          <aside class="year-nav">
            <h3>Оглавление</h3>
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
    <ul class="books-list">
      {items.map((w) => (
        <li key={w.key}>
          <span class="book-title">{w.title || 'Без названия'}</span> <Actions actions={w.actions} />
          {w.author && <div>{w.author}</div>}
          {w.notes && (
            <div class="text-muted">
              <small class="notes">{w.notes}</small>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
