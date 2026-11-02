# Узел Книгописи

Узел — это сайт (вместе с архивом старой Книгописи) и relay (strfry), где хранятся записи. Всё это — один
Docker-образ `ghcr.io/knigopis/knigopis-p2p/node`. Узлы равноправны и обмениваются записями друг с другом,
а читатели пишут сразу на несколько. Поэтому исчезновение одного узла ничего не ломает. Подделать запись узел
не может: каждая подписана ключом автора.

## Что нужно

- **Сервер:** Linux x86_64 с Docker и Compose v2. Хватит 512 МБ памяти и ~1 ГБ диска.
- **Домен или поддомен** с A-записью на сервер.

## Установка

Выберите файл под свой сервер, остальное одинаково.

| На сервере | Файл |
|---|---|
| ничего, порты 80 и 443 свободны | `compose.yml` — HTTPS узел сделает сам |
| уже есть nginx или Caddy | `compose.proxy.yml` — узел на `127.0.0.1:8080`, ваш веб-сервер передаёт ему запросы |
| nginx-proxy с acme-companion | `compose.nginx-proxy.yml` |

```sh
mkdir -p /opt/knigopis && cd /opt/knigopis
curl -fsSLo compose.yml https://raw.githubusercontent.com/knigopis/knigopis-p2p/master/selfhost/compose.yml
echo "DOMAIN=books.example.org" > .env
docker compose up -d
```

Для другого случая замените в адресе `compose.yml` на `compose.proxy.yml` или `compose.nginx-proxy.yml`
(сохраняется всё равно как `compose.yml`). Остальные настройки — в `.env.example`, менять их обычно не нужно.

### За своим nginx или Caddy

Узел слушает `127.0.0.1:8080` (другой порт — `PORT=` в `.env`). Веб-сервер держит HTTPS и передаёт узлу всё:
страницы, WebSocket, запросы к relay.

- **Caddy:**
  ```
  books.example.org {
  	reverse_proxy 127.0.0.1:8080
  }
  ```
- **nginx:** `nginx.conf.example`. Адрес клиента передавайте именно так, как там: по нему relay ограничивает
  частоту записи.

### За nginx-proxy

В `.env` кроме `DOMAIN` можно указать `REDIRECT_FROM` — адреса через запятую, которые перенаправляются на основной
(например, корень домена на `www`), и `PROXY_NETWORK`, если сеть nginx-proxy называется не `nginx-proxy`.
acme-companion получит сертификат на все адреса.

## Проверка

```sh
curl -H 'Accept: application/nostr+json' https://books.example.org   # описание relay
docker compose logs node | grep Writer                              # идёт ли синхронизация
```

Узел синхронизируется со всеми известными узлами Книгописи (список зашит в образ). Первая синхронизация забирает
всю историю — это минуты, дальше узлы обмениваются записями в обе стороны раз в 10 минут. На других узлах ничего
менять не нужно.

Чтобы читатели сохраняли записи и на ваш узел, пришлите PR с адресом `wss://books.example.org`
в `src/known-relays.json`: со следующего релиза он попадёт в сайт и в образ. До этого узел можно добавить
вручную: «Настройки → Серверы».

## Обновление

```sh
cd /opt/knigopis && docker compose pull && docker compose up -d
```

Автоматически, каждую ночь — строка в `crontab -e`:

```
0 4 * * * cd /opt/knigopis && docker compose pull -q && docker compose up -d
```

## Резервная копия

```sh
docker compose exec -T -u strfry node /app/strfry export > backup-$(date +%F).jsonl
docker compose exec -T -u strfry node /app/strfry import < backup.jsonl     # восстановление
```

Все записи всех узлов ещё и сохраняются два раза в день в https://github.com/knigopis/events.

## Главный узел

Главный узел — тот, на чей адрес заходят читатели: www.knigopis.com (корень knigopis.com перенаправляется на www).
Для синхронизации он такой же, как остальные, и устроен так же: `compose.proxy.yml` за Caddy сервера
(`deploy/knigopis.caddy`).

Ключ читателя хранится в браузере и привязан к адресу сайта. Поэтому домен главного узла должен быть у того,
кто будет держать его долго. Если домен истечёт и его займёт кто-то другой, новый хозяин сможет выложить свой сайт
и прочитать ключи тех, кто входил на этом адресе. Узлам у друзей лучше быть репликами на своих доменах. По той же
причине адрес узла выбирайте сразу: после смены все, кто входил на старом, окажутся разлогинены.

## Без своего сервера: зеркало сайта

Возьмите `knigopis-site.tar.gz` из [релиза](https://github.com/knigopis/knigopis-p2p/releases/latest) и выложите
на любой статический хостинг: GitHub Pages, Netlify, свой nginx. Для хостингов без SPA-маршрутов есть `404.html`.
Своего relay у зеркала нет — оно работает с известными узлами.

## Подробности

- **Готовый образ — только под amd64.** На ARM (Raspberry Pi и т. п.) соберите его сами — это компиляция strfry,
  10–30 минут — и запустите тем же `compose.yml`:
  ```sh
  docker build -t ghcr.io/knigopis/knigopis-p2p/node:latest https://github.com/knigopis/knigopis-p2p.git
  ```
- **Политика relay:** принимает только события Книгописи, частота с одного адреса ограничена
  (`relay/write-policy.py`).
- **Размер базы:** порядка килобайта на запись.
- **Внутри образа** (`Dockerfile`, `node/`): Caddy раздаёт сайт и передаёт WebSocket и NIP-11 на strfry; strfry раз
  в `SYNC_INTERVAL` секунд синхронизируется с узлами из `UPSTREAM`. Если любой из процессов упал, контейнер
  перезапускается.
