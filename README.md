# Книгопись

*Knigopis is a Russian-language reading log: books you have read, notes, a wish list and other readers to follow.
There is no central server: every record is a [Nostr](https://github.com/nostr-protocol/nips) event signed with the
reader's key and kept on several equal nodes. Live at [www.knigopis.com](https://www.knigopis.com).*

Книгопись — список прочитанных книг: даты, заметки, желания «прочитать позже» и подписки на других читателей.
Работает на **[www.knigopis.com](https://www.knigopis.com)**.

## Как устроено

- **Своего сервера с базой нет.** Каждая запись — событие Nostr, подписанное ключом читателя. Аккаунт — пара ключей:
  ни логина, ни пароля, сервер о читателе ничего не хранит. Подделать чужую запись не может ни узел, ни кто-то ещё.
- **Узлы равноправны.** Узел — это сайт и relay ([strfry](https://github.com/hoytech/strfry)) в одном Docker-образе.
  Узлы обмениваются записями, а сайт пишет сразу на все известные (`src/known-relays.json`), поэтому исчезновение
  одного узла ничего не ломает.
- **Архив старой Книгописи** — 4 276 читателей и 31 077 книг из
  [repo2.knigopis.com](https://github.com/knigopis/repo2.knigopis.com). Его можно листать без входа, а свои книги
  перенести в новый аккаунт в пару кликов.
- **Обложки** рисует сам сайт из названия и автора — пакет [knigopis-pereplet](https://github.com/gurov/pereplet).
- **Резервная копия** всех записей — [knigopis/events](https://github.com/knigopis/events), снимок два раза в день.

## Свой узел

Нужен Linux-сервер с Docker, 512 МБ памяти и домен. Инструкция — [selfhost/README.md](selfhost/README.md).
Чтобы узел знали все читатели, добавьте его адрес в `src/known-relays.json` пулл-реквестом.

## Свои клиенты

Своего HTTP API у Книгописи нет: relay на узлах и есть API. Виды записей, теги и правила —
в [docs/protocol.md](docs/protocol.md), этого достаточно для приложения, бота или экспорта.

## Разработка

```sh
npm ci
npm run legacy                          # архив старой Книгописи → public/legacy (клон repo2, ~1 мин)
npm run relay                           # два локальных relay в Docker: 7777 и 7778
VITE_RELAYS=ws://localhost:7777,ws://localhost:7778 npm run dev
npm run e2e                             # сквозной тест в системном Chrome (пишет данные — только локально)
python3 relay/test_write_policy.py      # проверки политики записи relay
npm run build                           # tsc + vite build → dist/
docker build -t knigopis-node .         # образ узла целиком
```

| Папка | Что там |
|---|---|
| `src/` | сайт: PWA на Preact, signals и nostr-tools; данные — `src/lib/` |
| `relay/` | настройки strfry и политика записи (какие события принимать, ограничение частоты) |
| `node/` | запуск узла: strfry и Caddy в одном контейнере |
| `selfhost/` | compose-файлы и инструкция для своего узла |
| `deploy/` | выкладка главного узла www.knigopis.com |
| `scripts/` | упаковка архива старой Книгописи, релиз |
| `docs/` | протокол для сторонних клиентов |

Релиз (`npm run release -- vX.Y.Z`) собирает сайт с архивом для зеркал, а GitHub Actions — образ узла
`ghcr.io/knigopis/knigopis-p2p/node`.

## История

Книгописи больше десяти лет. Её сделали Роман Никс ([rnixik](https://github.com/rnixik)) и
[gurov](https://github.com/gurov): сначала на parse.com, потом — свой API на PHP и записи в git на GitHub
(статьи на Хабре: [раз](https://habr.com/ru/articles/248511/), [два](https://habr.com/ru/articles/317662/)).
В 2026 году старый сервер перестал работать, и Книгопись переписана так, чтобы не зависеть ни от одного хостинга.

Репозитории старой версии: [www.knigopis.com](https://github.com/knigopis/www.knigopis.com) (сайт),
[api.knigopis.com](https://github.com/knigopis/api.knigopis.com) (API),
[repo2.knigopis.com](https://github.com/knigopis/repo2.knigopis.com) (записи).
