// «Заголовок» и «Автор» с подсказками — общие для формы книги и формы желания.
// Выбранная книга подставляет и автора, но только в пустое поле: введённое человеком не трогаем.
import { loadOwnAuthors, loadSuggest, suggestAuthors, suggestBooks } from '../lib/suggest';
import { Suggest } from './Suggest';

interface Props {
  idPrefix: string;
  pk: string;
  title: string;
  author: string;
  autoFocus?: boolean;
  onChange: (patch: { title?: string; author?: string }) => void;
}

export function TitleAuthorInputs({ idPrefix, pk, title, author, autoFocus, onChange }: Props) {
  return (
    <>
      <div class="form-group">
        <label for={`${idPrefix}-title`}>Заголовок книги</label>
        <Suggest
          id={`${idPrefix}-title`}
          placeholder="Укажите заголовок"
          value={title}
          autoFocus={autoFocus}
          onFocus={loadSuggest}
          onInput={(v) => onChange({ title: v })}
          items={(v) => suggestBooks(v, author).map((b) => ({ key: `${b.title}|${b.author}`, label: b.title, hint: b.author }))}
          onPick={(item) => onChange({ title: item.label, ...(author.trim() ? {} : { author: item.hint ?? '' }) })}
        />
      </div>
      <div class="form-group">
        <label for={`${idPrefix}-author`}>Автор книги</label>
        <Suggest
          id={`${idPrefix}-author`}
          placeholder="Укажите автора"
          value={author}
          onFocus={() => {
            loadSuggest();
            loadOwnAuthors(pk);
          }}
          onInput={(v) => onChange({ author: v })}
          items={(v) => suggestAuthors(v, pk).map((a) => ({ key: a, label: a }))}
          onPick={(item) => onChange({ author: item.label })}
        />
      </div>
    </>
  );
}
