// Обложка книги (src/lib/cover.ts). Рисуется, только когда подъезжает к экрану, и после
// загрузки шрифтов обложек — до этого на её месте спокойная заглушка. Для чтения с экрана
// обложка не нужна: название и автор рядом.
import { signal } from '@preact/signals';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { coverFontsLoaded, coverSvg, loadCoverFonts } from '../lib/cover';

const fontsReady = signal(false);
function ensureFonts() {
  if (fontsReady.value) return;
  if (coverFontsLoaded()) fontsReady.value = true;
  else loadCoverFonts().then(() => (fontsReady.value = true));
}

// Один наблюдатель на все обложки.
const waiting = new Map<Element, () => void>();
let observer: IntersectionObserver | null = null;
function whenVisible(el: Element, cb: () => void): () => void {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        waiting.get(e.target)?.();
        waiting.delete(e.target);
        observer!.unobserve(e.target);
      }
    },
    { rootMargin: '400px 0px' },
  );
  waiting.set(el, cb);
  observer.observe(el);
  return () => {
    waiting.delete(el);
    observer?.unobserve(el);
  };
}

// eager — рисовать сразу, не дожидаясь прокрутки (превью в форме).
export function Cover({ title, author, class: cls = '', eager = false }: { title: string; author: string; class?: string; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  useEffect(ensureFonts, []);
  useEffect(() => (visible || !ref.current ? undefined : whenVisible(ref.current, () => setVisible(true))), [visible]);
  const ready = fontsReady.value;
  const html = useMemo(() => (visible && ready ? coverSvg({ title, author }) : ''), [visible, ready, title, author]);
  return <div ref={ref} class={`cover ${cls}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}
