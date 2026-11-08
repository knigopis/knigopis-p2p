// Профили (kind 0): пока только ник. Кеш на всё приложение.
import { signal } from '@preact/signals';
import * as nip19 from 'nostr-tools/nip19';
import { shortNpub } from './account';
import { latestByAddress, nextTime, publish, query } from './nostr';

export interface Profile {
  name: string;
  raw: Record<string, unknown>;
}

export const profiles = signal<Record<string, Profile>>({});
const inFlight = new Set<string>();

function parse(content: string): Record<string, unknown> {
  try {
    const obj = JSON.parse(content);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export async function ensureProfiles(pubkeys: string[]) {
  const missing = [...new Set(pubkeys)].filter((pk) => !(pk in profiles.value) && !inFlight.has(pk));
  if (!missing.length) return;
  missing.forEach((pk) => inFlight.add(pk));
  try {
    const found: Record<string, Profile> = {};
    for (let i = 0; i < missing.length; i += 200) {
      const events = latestByAddress(await query({ kinds: [0], authors: missing.slice(i, i + 200) }));
      for (const ev of events) {
        const raw = parse(ev.content);
        const name = String(raw.name || raw.display_name || '').trim();
        found[ev.pubkey] = { name, raw };
      }
    }
    // Тем, у кого профиля нет, ставим пустой — чтобы не спрашивать relay снова.
    for (const pk of missing) found[pk] ??= { name: '', raw: {} };
    profiles.value = { ...profiles.value, ...found };
  } finally {
    missing.forEach((pk) => inFlight.delete(pk));
  }
}

export function displayName(pubkey: string): string {
  return profiles.value[pubkey]?.name || shortNpub(nip19.npubEncode(pubkey));
}

// Короткая ссылка на пользователя — /u/<первые 16 hex ключа> вместо npub на 63 символа.
// Relay не ищут по началу ключа, поэтому профиль (kind 0) несёт тег u с этим началом,
// и ищем по тегу. Тег может поставить себе кто угодно, поэтому из найденного берём
// только ключи, которые правда так начинаются: подобрать ключ с теми же 16 символами
// (64 бита) нереально.
const SHORT_TAG = 'u';
export const shortId = (pubkey: string) => pubkey.slice(0, 16);
export const isShortId = (s: string) => /^[0-9a-f]{16}$/.test(s);

function withShortTag(pubkey: string, tags: string[][]): string[][] {
  return [...tags.filter((t) => t[0] !== SHORT_TAG), [SHORT_TAG, shortId(pubkey)]];
}

async function ownProfileEvent(pubkey: string) {
  const [current] = latestByAddress(await query({ kinds: [0], authors: [pubkey] }));
  return current;
}

export async function saveProfile(pubkey: string, name: string) {
  const current = await ownProfileEvent(pubkey);
  const raw = { ...(current ? parse(current.content) : {}), name, display_name: name };
  const tags = withShortTag(pubkey, current?.tags ?? []);
  await publish({ kind: 0, created_at: nextTime(current?.created_at), content: JSON.stringify(raw), tags });
  profiles.value = { ...profiles.value, [pubkey]: { name, raw } };
}

// Профили, сохранённые до коротких ссылок, тега не имеют — дописываем его при входе.
// Проверка — один раз на браузер, а не на каждой загрузке страницы. Профиль здесь
// только правится, а не создаётся: новый аккаунт сохраняет его сам (Login), и два
// профиля в одну секунду затёрли бы ник.
const SHORT_TAG_OK = 'knigopis.shortTag';

export async function ensureShortTag(pubkey: string) {
  if (localStorage.getItem(SHORT_TAG_OK) === pubkey) return;
  const current = await ownProfileEvent(pubkey);
  if (!current) return;
  if (!current.tags.some((t) => t[0] === SHORT_TAG && t[1] === shortId(pubkey))) {
    const tags = withShortTag(pubkey, current.tags);
    await publish({ kind: 0, created_at: nextTime(current.created_at), content: current.content, tags });
  }
  localStorage.setItem(SHORT_TAG_OK, pubkey);
}

const resolved = new Map<string, string[]>();

// Ключи, подходящие под короткую ссылку: обычно ровно один, пусто — если этот
// пользователь не заходил с тех пор, как появились короткие ссылки.
export async function resolveShortId(short: string): Promise<string[]> {
  const cached = resolved.get(short);
  if (cached) return cached;
  const events = await query({ kinds: [0], [`#${SHORT_TAG}`]: [short] });
  const keys = [...new Set(events.filter((ev) => ev.pubkey.startsWith(short)).map((ev) => ev.pubkey))];
  if (keys.length) resolved.set(short, keys);
  return keys;
}
