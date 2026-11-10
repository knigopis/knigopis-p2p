import { KNOWN_RELAYS, REPO_URL } from '../lib/config';

// Короткая инструкция для тех, кто хочет поднять узел. Подробная — selfhost/README.md;
// команды здесь должны с ней совпадать.
export function NodePage() {
  const readme = `${REPO_URL}/blob/master/selfhost/README.md`;
  const raw = REPO_URL.replace('https://github.com/', 'https://raw.githubusercontent.com/');

  return (
    <div class="form-narrow">
      <h1>Свой узел Книгописи</h1>
      <p>
        Книгопись держится на узлах — серверах, которые хранят копию всех записей и отдают сайт. Узлы равноправны и
        обмениваются записями друг с другом, поэтому чем их больше, тем меньше Книгопись зависит от одного хостинга.
        Подделать чужую запись узел не может: каждая подписана ключом автора.
      </p>

      <h3>Что понадобится</h3>
      <ul>
        <li>сервер на Linux (x86_64) с Docker;</li>
        <li>512 МБ памяти и около гигабайта диска;</li>
        <li>домен или поддомен, указывающий на сервер.</li>
      </ul>

      <h3>Установка</h3>
      <p>Узел — это один Docker-образ: сайт, архив старой Книгописи и relay. Если порты 80 и 443 на сервере свободны:</p>
      <pre>
        <code>
          {`mkdir -p /opt/knigopis && cd /opt/knigopis
curl -fsSLo compose.yml ${raw}/master/selfhost/compose.yml
echo "DOMAIN=books.example.org" > .env
docker compose up -d`}
        </code>
      </pre>
      <p>
        Вместо <code>books.example.org</code> — адрес вашего узла. Сертификат HTTPS узел получит сам. Если на сервере уже
        работает nginx или Caddy, возьмите <code>compose.proxy.yml</code>: узел будет слушать <code>127.0.0.1:8080</code>,
        а ваш веб-сервер — передавать ему запросы. Есть и вариант для nginx-proxy — всё это в{' '}
        <a href={readme}>инструкции</a>.
      </p>
      <p>Обновление — одной командой, её можно поставить в cron:</p>
      <pre>
        <code>{`cd /opt/knigopis && docker compose pull && docker compose up -d`}</code>
      </pre>

      <h3>Дальше</h3>
      <ol>
        <li>
          Узел сам синхронизируется со всеми известными узлами: первая синхронизация заберёт все записи за минуты, потом
          узлы обмениваются ими в обе стороны. На других узлах ничего менять не нужно.
        </li>
        <li>
          Пришлите адрес своего узла (pull request в <code>src/known-relays.json</code>) — тогда все читатели начнут
          сохранять записи и на него.
        </li>
        <li>
          Пока адреса нет в списке, свой узел можно добавить вручную: <a href="/settings#servers">Настройки → Дополнительно → Серверы</a>.
        </li>
      </ol>

      <h3>Без своего сервера</h3>
      <p>
        Можно сделать зеркало сайта: выложите <code>knigopis-site.tar.gz</code> из{' '}
        <a href={`${REPO_URL}/releases/latest`}>релиза</a> на любой статический хостинг, хоть на GitHub Pages. Записи
        зеркало будет брать с известных узлов.
      </p>

      <h3>Известные узлы</h3>
      <ul>
        {KNOWN_RELAYS.map((url) => (
          <li key={url}>
            <code>{url}</code>
          </li>
        ))}
      </ul>

      <p>
        Подробная инструкция: <a href={readme}>selfhost/README.md</a>.
      </p>
    </div>
  );
}
