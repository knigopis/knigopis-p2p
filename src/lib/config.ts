// Номера kind Книгописи. Диапазон 30000–39999 — адресуемые события: relay хранит
// последнюю версию на пару (автор, тег d). Номера свободны в реестре NIPs
// на 2026-10; должны совпадать с relay/write-policy.py.
export const KIND_BOOK = 31110;
export const KIND_WISH = 31111;
export const KIND_CLAIM = 31112;

// Relay по умолчанию — свой, на том же хосте: Caddy отправляет WebSocket на strfry.
// В разработке и для демо реплик список задаётся VITE_RELAYS через запятую.
export function defaultRelays(): string[] {
  const env = import.meta.env.VITE_RELAYS as string | undefined;
  if (env) return env.split(',').map((s) => s.trim()).filter(Boolean);
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return [`${proto}//${location.host}`];
}
