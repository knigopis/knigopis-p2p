// Профили (kind 0): пока только ник. Кеш на всё приложение.
import { signal } from '@preact/signals';
import * as nip19 from 'nostr-tools/nip19';
import { shortNpub } from './account';
import { latestByAddress, now, publish, query } from './nostr';

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

export async function saveProfile(pubkey: string, name: string) {
  const [current] = latestByAddress(await query({ kinds: [0], authors: [pubkey] }));
  const raw = { ...(current ? parse(current.content) : {}), name, display_name: name };
  await publish({ kind: 0, created_at: now(), content: JSON.stringify(raw), tags: [] });
  profiles.value = { ...profiles.value, [pubkey]: { name, raw } };
}
