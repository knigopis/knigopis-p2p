export function Footer() {
  return (
    <div class="container">
      <hr />
      <footer>
        <p>
          Новая Книгопись работает без центрального сервера: каждая запись подписана ключом автора и хранится сразу на
          нескольких серверах-ретрансляторах (протокол Nostr). Записи старой Книгописи сохранены в{' '}
          <a href="/search">архиве</a> — их можно перенести в новый аккаунт. Чем больше узлов, тем надёжнее:{' '}
          <a href="/node">как поднять свой</a>.
        </p>
        <p>
          &copy; Книгопись 2015–2026 — дневник читателя, сервис учёта прочитанных книг.{' '}
          <a href="mailto:info@knigopis.com">info@knigopis.com</a> — адрес обратной связи.{' '}
          <a target="_blank" rel="noopener" href="https://vk.com/knigopiscom">
            Vk
          </a>
          ,{' '}
          <a target="_blank" rel="noopener" href="https://github.com/knigopis">
            GitHub
          </a>
          .
        </p>
      </footer>
    </div>
  );
}
