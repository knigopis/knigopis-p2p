import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { account, logout } from '../lib/account';
import { displayName } from '../lib/profiles';
import { Avatar } from './Avatar';

export function Navbar() {
  const acc = account.value;
  const { url, path, route } = useLocation();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    setOpen(false);
    setMenu(false);
  }, [url]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menu]);

  const my = acc ? `/u/${acc.npub}` : '';
  const links = acc
    ? [
        { href: my, label: 'Мои книги' },
        { href: '/book/add', label: 'Добавить книгу' },
        { href: `${my}/wishes`, label: 'Хочу прочитать' },
        { href: '/subscriptions', label: 'Подписки' },
        { href: '/search', label: 'Архив' },
      ]
    : [{ href: '/search', label: 'Найти свои старые записи' }];

  const onLogout = () => {
    if (confirm('Выйти? Без резервной копии ключа войти снова не получится.')) {
      logout();
      route('/');
    }
  };

  return (
    <nav class="navbar">
      <div class="container">
        <a class="navbar-brand" href="/">
          <img src="/logo.png" alt="Книгопись" width="172" height="42" />
        </a>
        <button
          type="button"
          class="navbar-toggle"
          aria-label="Меню"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span class="icon-bar" />
          <span class="icon-bar" />
          <span class="icon-bar" />
        </button>
        <div class={`navbar-menu${open ? ' open' : ''}`}>
          <ul class="navbar-nav">
            {links.map((l) => (
              <li key={l.href}>
                <a href={l.href} class={path === l.href ? 'active' : ''}>
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
          <ul class="navbar-nav navbar-right">
            {acc ? (
              <li class="dropdown" ref={menuRef}>
                <button type="button" aria-expanded={menu} onClick={() => setMenu(!menu)}>
                  <Avatar seed={acc.pk} />
                  <span class="user-nickname">{displayName(acc.pk)}</span>
                  <span class="caret" />
                </button>
                {menu || open ? (
                  <ul class="dropdown-menu">
                    <li>
                      <a href="/settings">Настройки и ключ</a>
                    </li>
                    <li>
                      <a href="/settings#device">Войти на телефоне</a>
                    </li>
                    <li class="divider" />
                    <li>
                      <button type="button" onClick={onLogout}>
                        Выйти
                      </button>
                    </li>
                  </ul>
                ) : null}
              </li>
            ) : (
              <li>
                <a href={`/login?next=${encodeURIComponent(url)}`} class={path === '/login' ? 'active' : ''}>
                  Войти
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
