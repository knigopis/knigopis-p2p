# knigopis-p2p

Переделка knigopis.com (список прочитанных книг) так, чтобы сайт не зависел от одного хостинга и сторонних входов.
Статус: **работает на https://www.knigopis.com** (с 2026-11-02; прежний адрес демо https://knigopis.bizibah.com — тот же узел). План и открытые вопросы — в `TODO.md`.
Код: https://github.com/gurov/knigopis-p2p (приватный до конца настройки, потом станет публичным; ветка `master`).

## Контекст

- Сайт сделали Рома (GitHub: rnixik, Roman Nix — бэкенд, данные) и владелец этой папки (GitHub: gurov — фронтенд).
  Статьи: https://habr.com/ru/articles/248511/ (эпоха parse.com), https://habr.com/ru/articles/317662/ (переход на git).
- История: parse.com → свой API (Yii2, PHP) + данные в git на GitHub → вход через uLogin (VK, Google, FB, Яндекс, Mail.ru…).
  В 2025-08 добавлен вход по паролю (локальные аккаунты), в 2026-05 uLogin отключён и регистрация закрыта.
  **На 2026-10-30 api.knigopis.com отвечает 502** — старый сайт не показывает данные.
- Цель была: показать прототип Роме, чтобы он поднял всё у себя на VPS. **2026-11-02 Рома сказал, что продолжать
  не будет.** Домен knigopis.com (регистратор internet.bs, DNS — DigitalOcean, оплачен до 2027-01-18) и аккаунт GitHub
  `knigopis` он передал владельцу папки. Главный узел — на bizibah (см. ниже). Деплой по-прежнему должен легко
  переноситься (Docker Compose + блок для Caddy).
- **DNS knigopis.com** — зона в DigitalOcean владельца: `A @` и `A www` → 165.227.139.115,
  `TXT _github-pages-challenge-knigopis` (подтверждение домена на GitHub Pages — не удалять). MX нет (был
  mx.yandex.ru; почта — в TODO). `api` и `alpha` не перенесены, с Pages адреса сняты (2026-11-02).
- Репозитории (на GitHub `knigopis` — аккаунт-пользователь, не организация; превратить его в организацию можно
  только через переименование и перенос репозиториев — решено не делать, 2026-11-02). `gurov` — соавтор
  (write) во всех репозиториях `knigopis`. `gh` здесь залогинен и как `knigopis` (основной — `gurov`): действия
  владельца — `GH_TOKEN=$(gh auth token -u knigopis) gh …` (публичный репозиторий в auto mode создаёт сам
  пользователь). Репозитории:
  - `www.knigopis.com` — старый фронт v1 (Pages, теперь без своего домена);
  - `api.knigopis.com` — Yii2 API;
  - `repo2.knigopis.com` — **данные**; `repo.knigopis.com` — устаревшие;
  - `www.knigopis.com_v2` / `gurov/knigopis2` — прототип v2 (Angular 2, alpha.knigopis.com). **Отвергнут, дизайн берём из v1.**
- Стороннее Android-приложение `org.sirekanyan.knigopis` работает через старый API и умрёт вместе с ним.

## Старые данные (repo2)

- Раскладка: `users/<первые 3 символа id>/<id>/<id>.json`, рядом `books/<bookId>.json` и `wishes/<wishId>.json`.
- id пользователя = `<uid>-<provider>`, например `83820536-yandex`. У локальных — `<login>-local`, и login бывает email (есть `@` и `.`).
- Пользователь: `id, lang, nickname, photo, profile, identity, booksCount, subscriptions, createdAt, updatedAt`.
  `subscriptions` = `{ "<userId>": <booksCount на момент просмотра> }`, лежат в публичном JSON.
- Книга: `id, userId, createdAt, updatedAt, title, author, readDay, readMonth, readYear, notes` (даты — строки, бывают пустыми).
  Желание: `id, userId, createdAt, updatedAt, title, author, priority, notes`.
- **`auth.csv` — bcrypt-хэши паролей локальных аккаунтов в открытом доступе.** Упаковка архива его не читает.
- На 2026-10-30: 4276 пользователей, 31 077 книг, 6169 желаний; ≥100 пользователей с подписками.
- Старый адрес профиля: `/#/<ник>/books?u=<userId>&y=<год>`. PWA перенаправляет его на `/archive/<userId>` (`src/main.tsx`).
- Основной адрес — **`www.knigopis.com`**, корень перенаправляется на www, как у старого сайта. Адрес не менять:
  смена разлогинивает всех (ключ привязан к origin). В `known-relays.json` — `wss://www.knigopis.com`: WebSocket
  по редиректу не переходит.

## Устройство прототипа

- **Клиент:** PWA на Preact 11 + preact-iso + @preact/signals + nostr-tools + Vite 8 + vite-plugin-pwa. Бэкенда нет.
  - `src/lib/` — данные:
    - `account` — ключ в localStorage, nsec, ссылка входа `/login#nsec…`;
    - `nostr` — пул, `query`/`queryAll` (страницы назад по `until`), `publish`; список relay в localStorage —
      только правки пользователя (`added`/`removed`) к списку по умолчанию, чтобы новые узлы из релизов доходили до всех;
    - `records` — книги, желания, заявки ↔ события;
    - `legacy` — архив;
    - `importer` — перенос;
    - `profiles` (kind 0), `follows` (kind 3).
  - `src/pages/`, `src/components/` — экраны и общие куски. `BookList` — список по годам с оглавлением.
  - Стили — один файл `src/styles/main.css`: повторён вид v1 (Bootstrap 3 + theme) без самого Bootstrap, плюс адаптивность.
- **Архив:** `scripts/legacy.sh` → `scripts/pack-legacy.mjs` из временного клона repo2 → `public/legacy/` (~30 МБ, 4,3 тыс. файлов):
  - `index.json` — пользователи;
  - `users/<id>.json` — пользователь целиком;
  - `books-index.json` — для поиска по названию, грузится лениво;
  - `latest.json`.
  photo/profile/identity выкидываются. Service Worker архив не предзагружает, а кеширует по мере просмотра.
- **Relay:** `relay/` — strfry 1.1.3, собирается из исходников в Docker. `write-policy.py` — плагин:
  - принимает только kind 0, 3, 5, 10002, 31110–31112;
  - требует тег `d` и название;
  - режет частоту по IP: ведро 3000 событий, +2 в секунду.

  `maxFilterLimit = 5000`. Точка входа — `run.sh`: relay плюс, если задан `UPSTREAM`, `strfry sync --dir both`
  с другими узлами раз в `SYNC_INTERVAL`. Синхронизация идёт в том же контейнере: LMDB проверяет читателей по PID.
  С аргументами `run.sh` просто запускает команду strfry (`export`, `sync`…).
- **Узлы:** все одинаковые — сайт и relay (`selfhost/`, инструкция — `selfhost/README.md`).
  - Варианты: чистый сервер (профиль `web` = свой Caddy с HTTPS), уже есть nginx/Caddy (только relay; пример —
    `selfhost/nginx.conf.example`), за nginx-proxy + acme-companion (`compose.nginx-proxy.yml` через `COMPOSE_FILE`
    в `.env`: Caddy без TLS; `DOMAIN` — основной адрес, `REDIRECT_FROM` — перенаправляемые на него), только статика.
  - `selfhost/update.sh` скачивает из релиза сайт и образ relay и перезапускает узел — на сервере ничего не собирается.
  - Клиент по умолчанию пишет на свой хост и все узлы из `src/known-relays.json`; новый узел добавляется туда PR
    и в `relays.txt` бота снимков.
  - Синхронизация — сеткой без центра: в `UPSTREAM` нового узла все узлы из `known-relays.json`. Sync двусторонний,
    старым узлам ничего менять не надо. «Главный» узел — только адрес, на который заходят читатели; ключи привязаны
    к origin, поэтому домен должен быть у долгосрочного владельца.
  - Страница сайта `/node` («Свой узел», `src/pages/NodePage.tsx`) — короткая версия инструкции для читателей;
    команды в ней должны совпадать с `selfhost/README.md`. Ссылки на неё — в «Долговечности» на главной и в подвале.
    Адрес репозитория — `REPO_URL` в `src/lib/config.ts`.
- **Бэкап записей** — https://github.com/knigopis/events (работает с 2026-11-02), локально `~/p-erebor/knigopis-events`
  (бот там же, `npm test`; коммиты бота — `git pull` перед правками). GitHub Actions два раза в день читает
  все события со всех узлов из `relays.txt`, проверяет подписи и коммитит последние версии
  в `events/<2 символа>/<pubkey>.jsonl`. Надгробия остаются, kind 5 убирает только старые версии. Предохранитель: больше 5000 новых или −10% (и хотя бы −10) —
  без коммита, запуск падает; `force` в Run workflow. Восстановление — `strfry import`, подделки он отвергает
  (проверено 2026-11-02).
- **Релиз** (`npm run release -- vX.Y.Z`, только из чистого запушенного HEAD) — три файла: `knigopis-site.tar.gz`
  (сайт с архивом), `knigopis-legacy.tar.gz`, `knigopis-relay-image-amd64.tar.gz`.
  В сборке есть `404.html` (копия `index.html`) — для статических хостингов без SPA-маршрутов.

### События Nostr (номера выбраны, свободны в реестре NIPs на 2026-10)

| kind | что | теги | content |
|---|---|---|---|
| 31110 | книга | `d`, `title`, `author`, `read` (`ГГГГ`/`ГГГГ-ММ`/`ГГГГ-ММ-ДД`), `legacy`=[userId, bookId, createdAt], `alt` | заметки |
| 31111 | желание | `d`, `title`, `author`, `priority`, `legacy`, `alt` | заметки |
| 31112 | заявка на старый аккаунт | `d`=старый userId, `nickname`, `alt` | — |

- Номера дублируются в `src/lib/config.ts` и `relay/write-policy.py`.
- **Перенос:** `d` = старый id записи, поэтому повтор не плодит дубли, а уже перенесённое пропускается.
  `created_at` перенесённых событий — разные секунды подряд, иначе постраничное чтение по времени ломается.
  Сначала публикуется заявка, потом записи.
- **Удаление:** «надгробие» (то же `d` + тег `deleted`) плюс kind 5 с тегом `a`. Надгробие работает на любом relay.
- **Подписки:** kind 3. Старые подписки разрешаются через заявки (`#d` = старые id). Ожидающих не храним:
  клиент заново строит их из своих заявок и архива (страница «Подписки»).
- Лента на главной — новые книги без тега `legacy`, иначе перенос сотен книг забил бы ленту.

## Команды

```sh
npm run legacy                         # клон repo2 во временный каталог вне проекта → public/legacy → клон удаляется (~1 мин)
docker build -t knigopis-relay:dev relay   # образ relay (~5 мин, один раз)
npm run relay                          # два локальных relay: 7777 и 7778 (реплика, синхронизация раз в 30 с)
VITE_RELAYS=ws://localhost:7777,ws://localhost:7778 npm run dev
npm run e2e                            # сквозной тест в системном Chrome (пишет данные — только локально)
npm run build                          # tsc + vite build → dist/
npm run release -- v0.2.0              # релиз на GitHub (сайт, архив, образ relay)
deploy/relay-image.sh                  # собрать образ здесь, отвезти и запустить relay на bizibah
deploy/publish.sh                      # сборка + rsync dist/ на сервер, потом dist/ удаляется
deploy/apply-caddy.sh                  # блок deploy/knigopis.caddy → /etc/caddy/Caddyfile (validate, бэкап, reload)
```

Проверено локально (2026-10-30): два узла из `selfhost/` синхронизируются в обе стороны через WebSocket в Caddy;
`nginx.conf.example` проходит `nginx -t`, маршруты и WebSocket работают.
Проверено локально (2026-11-01): вариант за nginx-proxy — маршруты, WebSocket, NIP-11, редирект корня на www,
relay видит IP клиента. Выдача сертификата acme-companion не проверялась.

Модули `src/lib` можно проверять без входа и UI: на dev-сервере в Playwright
`page.evaluate(() => import('/src/lib/nostr.ts'))` отдаёт тот же экземпляр модуля, что у приложения.

## Главный узел: www.knigopis.com на bizibah

- **Сервер** `root@bizibah.com` (165.227.139.115, DigitalOcean): Ubuntu 24.04, 1 vCPU, 1,9 ГБ RAM, Docker 24 / Compose v2.20,
  Caddy 2.11. На сервере много других сервисов; контейнеры слушают только `127.0.0.1`.
- **Размещение:**
  - relay — `/opt/knigopis/compose.yml` (= `selfhost/compose.yml` без профиля web), контейнер `knigopis-relay-1`, том `knigopis_relay-data`, порт `127.0.0.1:7777`;
  - статика — `/var/www/knigopis-site`;
  - блок Caddy дописан в конец `/etc/caddy/Caddyfile` между маркерами `# >>> knigopis` / `# <<< knigopis <<<`:
    `www.knigopis.com, knigopis.bizibah.com` — один сайт и relay (bizibah не перенаправляется: там ключи тех,
    кто входил на демо); `knigopis.com` → 301 на www. Сниппеты `security` (без CSP) и `logs` — общие.
- **Маршруты на одном домене:** WebSocket → relay; `Accept: application/nostr+json` (NIP-11) → relay;
  `/legacy/*` — статика без подмены на index.html (честный 404); остальное — SPA с `try_files … /index.html`.

## Подводные камни

- **Лимит inotify на машине владельца — ~61 тыс. наблюдений** (`fs.inotify.max_user_watches`). За папкой следят
  Vite и Sublime Text.
  - Большие деревья файлов (клон repo2 — 44 тыс., `dist/`) в проекте не держать: клон — только временный, вне проекта;
    `dist/` удаляется после выкладки.
  - Vite не следит за `public/legacy`.
  - `/tmp` здесь — tmpfs (в памяти), поэтому большое туда тоже не класть.

- **Caddy:** матчер `header Connection *Upgrade*` чувствителен к регистру — Node/undici шлёт `connection: upgrade`
  и получал index.html. Используется `header_regexp Upgrade (?i)^websocket$`.
- **Caddy за прокси** обязан передавать relay адрес клиента: `header_up X-Real-IP {client_ip}` плюс `trusted_proxies`
  (`Caddyfile.nginx-proxy`). С `{remote_host}` relay видит всех с адреса прокси и режет частоту записи всем разом
  (проверено с nginx-proxy 2026-11-01).
- **Compose v2.20 на сервере** не понимает `docker compose ps --format`.
- **Остановка процессов:**
  - `pkill -f <шаблон>` в Bash-команде убивает и саму оболочку (шаблон есть в её командной строке). Останавливать по PID.
  - У `npx vite` по PID умирает только обёртка `npx`, сам vite надо искать по порту: `ss -ltnp 'sport = :5174'`.
  - `npx <пакет>`, которого нет в проекте, ждёт подтверждения установки и вешает команду.
- **Relay** индексируют для фильтров только однобуквенные теги. Поэтому поиск заявок идёт по `#d`, а не по `legacy`.
- **Без связи** `querySync` молча отдаёт пустой список — `query()` в этом случае бросает ошибку, чтобы не показать «записей нет».
- **Действия у книги** на десктопе видны по наведению (`hover: hover`), на сенсорных экранах — всегда.
  Playwright перед кликом должен навести курсор.
- **Старая ссылка `#/…`** на уже открытой странице меняет только hash — ловится `hashchange`.
- **Service Worker** регистрируется из `src/main.tsx` (`virtual:pwa-register`, autoUpdate): страница сама
  перезагружается, когда подхватила новую версию. Без этого новая версия показывалась только после второго
  обновления страницы.
- **Удаление** (NIP-09) relay не обязаны выполнять. Safari стирает хранилище неустановленного сайта через 7 дней —
  резервная копия ключа обязательна, и мы просим `navigator.storage.persist()`.
- **Логотип** — только PNG 172×42 (на retina мыльный); векторного исходника нет.
