// Поле ввода с выпадающими подсказками (ARIA combobox): стрелки, Enter, Escape, мышь и палец.
// Подсказки появляются, только пока человек печатает, и закрываются при уходе с поля.
import { useState } from 'preact/hooks';

export interface SuggestItem {
  key: string;
  label: string;
  hint?: string;
}

interface Props {
  id: string;
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  onInput: (value: string) => void;
  // Подсказки для текущего значения: вызывается на каждой отрисовке, пока список открыт.
  items: (value: string) => SuggestItem[];
  onPick: (item: SuggestItem) => void;
  onFocus?: () => void;
}

export function Suggest(props: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const items = open ? props.items(props.value) : [];
  const listId = `${props.id}-list`;
  const current = active >= 0 && active < items.length ? active : -1;

  const pick = (item: SuggestItem) => {
    props.onPick(item);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((current + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(current <= 0 ? items.length - 1 : current - 1);
    } else if (e.key === 'Enter' && current >= 0) {
      // Иначе Enter отправил бы форму.
      e.preventDefault();
      pick(items[current]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div class="suggest">
      <input
        id={props.id}
        class="form-control"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={items.length > 0}
        aria-controls={listId}
        aria-activedescendant={current >= 0 ? `${listId}-${current}` : undefined}
        autoComplete="off"
        placeholder={props.placeholder}
        autoFocus={props.autoFocus}
        value={props.value}
        onInput={(e) => {
          props.onInput(e.currentTarget.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={props.onFocus}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {items.length > 0 && (
        <ul id={listId} class="suggest-list" role="listbox">
          {items.map((item, i) => (
            <li
              id={`${listId}-${i}`}
              key={item.key}
              role="option"
              aria-selected={i === current}
              class={i === current ? 'active' : undefined}
              // Без этого поле теряет фокус раньше, чем случится click.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
            >
              {item.label}
              {item.hint && <span class="suggest-hint">{item.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
