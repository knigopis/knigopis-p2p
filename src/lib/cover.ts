// Обложки книг — пакет knigopis-pereplet (https://github.com/gurov/pereplet): SVG из названия и автора,
// без картинок и запросов; стиль — по фамилии автора, книги автора — одна серия.
// Здесь — кеш, уникальные id для вставки в страницу и загрузка шрифтов обложки.
import { drawCover } from 'knigopis-pereplet';
import 'knigopis-pereplet/fonts.css';

export interface CoverBook {
  title: string;
  author: string;
}
export interface PlacedCover {
  svg: string;
  fonts: string[];
}

// Метка вместо id внутри SVG: при вставке меняется на уникальную приставку — одна книга
// бывает на странице дважды, а узоры и градиенты ищутся по id во всём документе.
const ID = '';
const cache = new Map<string, PlacedCover>();
let insertN = 0;

export function placeCover(b: CoverBook): PlacedCover {
  const key = `${b.title}\n${b.author}`;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 3000) cache.clear();
    const { svg, fonts } = drawCover(b, { id: ID });
    cache.set(key, (c = { svg, fonts }));
  }
  return { svg: c.svg.replaceAll(ID, `k${++insertN}-`), fonts: c.fonts };
}

// Текст размечен по таблицам ширин шрифтов пакета: без них он мелькнёт запасным шрифтом
// и вылезет за поля. null — всё уже загружено, можно показывать сразу.
const loaded = new Set<string>();
export function loadCoverFonts(fonts: string[]): Promise<void> | null {
  const need = fonts.filter((f) => !loaded.has(f));
  if (!need.length) return null;
  return Promise.all(need.map((f) => document.fonts.load(f).then(() => void loaded.add(f), () => {}))).then(() => {});
}
