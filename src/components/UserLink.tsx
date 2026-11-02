import { displayName, shortId } from '../lib/profiles';

// Короткая ссылка (см. shortId в profiles.ts); старые ссылки /u/npub1… тоже работают.
export const userPath = (pubkey: string) => `/u/${shortId(pubkey)}`;
export const archivePath = (legacyId: string) => `/archive/${encodeURIComponent(legacyId)}`;

// Имя берётся из кеша профилей (signal) — ссылка обновится, когда профиль загрузится.
export function UserLink({ pubkey }: { pubkey: string }) {
  return <a href={userPath(pubkey)}>{displayName(pubkey)}</a>;
}
