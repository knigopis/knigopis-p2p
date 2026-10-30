// Подписки — стандартный список kind 3 (NIP-02): теги p.
import { signal } from '@preact/signals';
import type { Event } from 'nostr-tools/pure';
import { account } from './account';
import { latestByAddress, now, publish, query } from './nostr';

export const myFollows = signal<string[] | null>(null);

async function fetchContactList(pubkey: string): Promise<Event | null> {
  const [ev] = latestByAddress(await query({ kinds: [3], authors: [pubkey] }));
  return ev ?? null;
}

const pTags = (ev: Event | null) => (ev?.tags ?? []).filter((t) => t[0] === 'p' && t[1]).map((t) => t[1]);

export async function loadMyFollows() {
  const acc = account.value;
  if (!acc) {
    myFollows.value = null;
    return;
  }
  myFollows.value = pTags(await fetchContactList(acc.pk));
}

// Меняет список, отталкиваясь от его последней версии на relay, а не от кеша:
// иначе можно затереть подписки, сделанные с другого устройства.
export async function updateFollows(add: string[], removeKeys: string[] = []) {
  const acc = account.value;
  if (!acc) throw new Error('Нужно войти');
  const current = await fetchContactList(acc.pk);
  const drop = new Set(removeKeys);
  const kept = (current?.tags ?? []).filter((t) => !(t[0] === 'p' && drop.has(t[1])));
  const have = new Set(pTags({ ...current!, tags: kept }));
  const added = add.filter((pk) => pk !== acc.pk && !have.has(pk)).map((pk) => ['p', pk]);
  const tags = [...kept, ...added];
  await publish({ kind: 3, created_at: now(), content: current?.content ?? '', tags });
  myFollows.value = pTags({ ...current!, tags });
}
