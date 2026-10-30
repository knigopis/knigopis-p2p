// Аккаунт = секретный ключ Nostr, который живёт только в этом браузере.
// На другое устройство переносится файлом резервной копии или QR-ссылкой
// вида /login#nsec1… (часть после # на сервер не уходит).
import { signal } from '@preact/signals';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import * as nip19 from 'nostr-tools/nip19';
import { hexToBytes } from 'nostr-tools/utils';

const STORAGE_KEY = 'knigopis.nsec';

export interface Account {
  sk: Uint8Array;
  pk: string;
  npub: string;
  nsec: string;
}

function make(sk: Uint8Array): Account {
  const pk = getPublicKey(sk);
  return { sk, pk, npub: nip19.npubEncode(pk), nsec: nip19.nsecEncode(sk) };
}

// Принимает nsec1…, 64 hex-символа или целый текст резервной копии.
export function parseSecret(input: string): Uint8Array {
  const text = input.trim();
  const nsec = text.match(/nsec1[02-9ac-hj-np-z]{58}/);
  if (nsec) {
    const decoded = nip19.decode(nsec[0]);
    if (decoded.type === 'nsec') return decoded.data;
  }
  if (/^[0-9a-f]{64}$/i.test(text)) return hexToBytes(text.toLowerCase());
  throw new Error('Не удалось распознать ключ. Нужна строка, начинающаяся с nsec1.');
}

function load(): Account | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? make(parseSecret(saved)) : null;
  } catch {
    return null;
  }
}

export const account = signal<Account | null>(load());

export function login(sk: Uint8Array): Account {
  const acc = make(sk);
  localStorage.setItem(STORAGE_KEY, acc.nsec);
  account.value = acc;
  // Просим браузер не чистить хранилище сам (Safari иначе стирает его через 7 дней без визитов).
  navigator.storage?.persist?.().catch(() => {});
  return acc;
}

export function createAccount(): Account {
  return login(generateSecretKey());
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY);
  account.value = null;
}

export function loginLink(acc: Account): string {
  return `${location.origin}/login#${acc.nsec}`;
}

export function shortNpub(npub: string): string {
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

export function backupText(acc: Account, nickname: string): string {
  return [
    'Книгопись — резервная копия ключа',
    '',
    `Пользователь: ${nickname || shortNpub(acc.npub)}`,
    `Публичный ключ: ${acc.npub}`,
    '',
    'Секретный ключ (никому не показывайте — с ним можно писать от вашего имени):',
    acc.nsec,
    '',
    `Чтобы войти: откройте ${location.origin}/login и выберите этот файл.`,
    '',
  ].join('\n');
}
