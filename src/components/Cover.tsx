// Обложка книги (src/lib/cover.ts). Рисуется, только когда подъезжает к экрану, и показывается
// после загрузки своих шрифтов — до этого на её месте спокойная заглушка (или прежняя обложка,
// пока в форме меняют название). Для чтения с экрана обложка не нужна: название и автор рядом.
import { useEffect, useRef, useState } from 'preact/hooks';
import { loadCoverFonts, placeCover } from '../lib/cover';

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
  const [html, setHtml] = useState('');
  useEffect(() => (visible || !ref.current ? undefined : whenVisible(ref.current, () => setVisible(true))), [visible]);
  useEffect(() => {
    if (!visible) return;
    const { svg, fonts } = placeCover({ title, author });
    const wait = loadCoverFonts(fonts);
    if (!wait) return setHtml(svg);
    let live = true;
    wait.then(() => live && setHtml(svg));
    return () => {
      live = false;
    };
  }, [visible, title, author]);
  return <div ref={ref} class={`cover ${cls}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}
