import * as nip19 from 'nostr-tools/nip19';
import { displayName } from '../lib/profiles';

export const userPath = (pubkey: string) => `/u/${nip19.npubEncode(pubkey)}`;
export const archivePath = (legacyId: string) => `/archive/${encodeURIComponent(legacyId)}`;

// Имя берётся из кеша профилей (signal) — ссылка обновится, когда профиль загрузится.
export function UserLink({ pubkey }: { pubkey: string }) {
  return <a href={userPath(pubkey)}>{displayName(pubkey)}</a>;
}
