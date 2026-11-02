// Сквозная проверка прототипа: архив → аккаунт → перенос → книги → настройки.
//   npm run e2e [-- <base-url> <каталог скриншотов>]
// Нужны локальные relay (npm run relay) и dev-сервер с VITE_RELAYS на оба.
// Пишет данные (аккаунт, перенос архива lucius) — на прод не запускать.
// Chrome берётся системный: /usr/bin/google-chrome.
// E2E_CSP=1 — с тем же Content-Security-Policy, что отдаёт узел (node/routes.caddy):
// нарушения попадут в «Ошибки в консоли». Запускать на продакшн-сборке (vite preview).
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? '.cache/e2e-shots';
mkdirSync(OUT, { recursive: true });

// Локальные relay тестов — ws://localhost (на сайте все relay — wss:, и ws: там не нужен).
const CSP = process.env.E2E_CSP
  ? readFileSync(new URL('../node/routes.caddy', import.meta.url), 'utf8')
      .match(/Content-Security-Policy "([^"]+)"/)[1]
      .replace("connect-src 'self' wss:", "connect-src 'self' wss: ws://localhost:*")
  : null;
// Заголовок подставляется в ответы сайта; Service Worker выключен, иначе ответы шли бы мимо.
const context = async (options) => {
  const ctx = await browser.newContext({ ...options, ...(CSP ? { serviceWorkers: 'block' } : {}) });
  if (CSP) {
    const origin = new URL(BASE).origin;
    await ctx.route((url) => url.origin === origin, async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': CSP } });
    });
  }
  return ctx;
};

// С подставленным ответом Chrome считает страницу пришедшей «из интернета» и не пускает её
// к relay на localhost (Local Network Access) — в режиме CSP эту проверку выключаем.
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', ...(CSP ? ['--disable-features=LocalNetworkAccessChecks'] : [])],
});
const errors = [];
const watch = (page, tag) => {
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${tag}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${tag}] pageerror ${e.message}`));
};

const desktop = await context({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await desktop.newPage();
watch(page, 'desktop');
const shot = (p, name, full = false) => p.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const step = (s) => console.log('→', s);

step('главная');
await page.goto(BASE + '/');
await page.getByText('Привет, читатель!').waitFor();
await page.waitForTimeout(1500);
await shot(page, '01-home', true);

step('старая ссылка v1 → архив');
await page.goto(BASE + '/#/lucius/books?u=83820536-yandex');
await page.waitForURL('**/archive/83820536-yandex');
await page.getByText('Список прочитанных книг пользователя lucius').waitFor();
await page.waitForTimeout(800);
await shot(page, '02-archive-desktop');

step('поиск по нику и книге');
await page.goto(BASE + '/search?q=' + encodeURIComponent('Chiffi'));
await page.locator('.result-list a').first().waitFor();
await shot(page, '03-search');
await page.goto(BASE + '/search?q=' + encodeURIComponent('Мастер и Маргарита'));
await page.getByRole('heading', { name: 'Книги' }).waitFor();
await page.locator('.result-list').last().waitFor();
await shot(page, '03b-search-books');

step('создание аккаунта');
await page.goto(BASE + '/login?next=' + encodeURIComponent('/import/83820536-yandex'));
await page.fill('#nick', 'lucius-test');
await page.getByRole('button', { name: 'Создать аккаунт' }).click();
await page.getByText('Аккаунт создан').waitFor();
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: 'Скачать резервную копию' }).click(),
]);
const backupPath = `${OUT}/backup.txt`;
await download.saveAs(backupPath);
await shot(page, '04-created');

step('перенос из архива');
await page.getByRole('link', { name: 'Продолжить' }).click();
await page.getByRole('heading', { name: 'Перенос записей из архива' }).waitFor();
await shot(page, '05-import-form');
await page.getByRole('button', { name: 'Перенести' }).click();
await page.getByText('Готово!').waitFor({ timeout: 120000 });
console.log('   ', (await page.locator('.alert-success').innerText()).replace(/\s+/g, ' '));
await shot(page, '06-import-done');

step('мой список');
await page.getByRole('link', { name: 'К моим книгам' }).click();
await page.locator('.book-group').first().waitFor();
const myUrl = page.url();
await page.waitForTimeout(500);
await shot(page, '07-mybooks-desktop');
console.log('    книг в списке:', await page.locator('.books-list > li').count());

step('добавить книгу');
await page.goto(BASE + '/book/add');
await page.fill('#book-title', 'Проверочная книга');
await page.fill('#book-author', 'Тестовый Автор');
await page.fill('#book-notes', 'Заметка\nв две строки');
await shot(page, '08-book-form');
await page.getByRole('button', { name: 'Сохранить и закрыть' }).click();
await page.waitForURL(myUrl);
await page.getByText('Проверочная книга').waitFor();

step('редактировать и удалить');
const row = page.locator('li', { hasText: 'Проверочная книга' });
await row.hover();
await shot(page, '08b-hover-actions');
await row.getByRole('link', { name: '[редактировать]' }).click();
await page.getByRole('heading', { name: 'Редактирование записи' }).waitFor();
await page.waitForFunction(() => document.querySelector('#book-title')?.value === 'Проверочная книга');
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: 'Удалить запись' }).click();
await page.waitForURL(myUrl);
await page.locator('.book-group').first().waitFor();
console.log('    после удаления видна?', await page.getByText('Проверочная книга').count());

step('желания');
await page.goto(myUrl + '/wishes');
await page.locator('.books-list > li').first().waitFor();
await shot(page, '09-wishes');

step('архив: уже перенесено');
await page.goto(BASE + '/archive/83820536-yandex');
await page.getByText('Перенесено в аккаунт').waitFor();
await shot(page, '10-archive-claimed');

step('настройки и QR');
await page.goto(BASE + '/settings');
await page.getByRole('button', { name: 'Показать QR-код' }).click();
await page.waitForTimeout(2500);
await shot(page, '11-settings', true);

step('подписки');
await page.goto(BASE + '/subscriptions');
await page.getByRole('heading', { name: 'Подписки' }).waitFor();
await page.waitForTimeout(1500);
await shot(page, '12-subscriptions');

step('телефон: вход по QR-ссылке');
const nsec = (await (await import('node:fs/promises')).readFile(backupPath, 'utf8')).match(/nsec1\w+/)[0];
const phone = await context({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const mp = await phone.newPage();
watch(mp, 'phone');
await mp.goto(BASE + '/login#' + nsec);
await mp.waitForURL(/\/u\/[0-9a-f]{16}$/);
console.log('    в адресе нет ключа:', !mp.url().includes('nsec'));
await mp.locator('.book-group').first().waitFor();
await mp.waitForTimeout(500);
await shot(mp, '13-phone-mybooks');
await mp.evaluate(() => window.scrollTo(0, 2500));
await mp.waitForTimeout(500);
await shot(mp, '14-phone-mybooks-scrolled');
await mp.getByRole('button', { name: 'Меню' }).click();
await shot(mp, '15-phone-menu');
await mp.goto(BASE + '/');
await mp.waitForTimeout(1500);
await shot(mp, '16-phone-home');
await mp.goto(BASE + '/book/add');
await shot(mp, '17-phone-book-form');
await mp.goto(BASE + '/archive/83820536-yandex');
await mp.locator('.book-group').first().waitFor();
await shot(mp, '18-phone-archive');

console.log('\nОшибки в консоли:', errors.length ? '\n' + errors.join('\n') : 'нет');
await browser.close();
