export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Только пути внутри сайта: иначе ?next= можно использовать для редиректа наружу.
export function safeNext(next: string | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : null;
}

// Когда пользователь последний раз смотрел чужой список — для «+N новых» в подписках.
const SEEN_KEY = 'knigopis.seen';

export function getSeen(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function markSeen(pubkey: string) {
  localStorage.setItem(SEEN_KEY, JSON.stringify({ ...getSeen(), [pubkey]: Math.floor(Date.now() / 1000) }));
}
