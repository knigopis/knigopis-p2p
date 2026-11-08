// «Когда прочитали?» — дата с той точностью, с какой человек помнит: сегодня, в этом
// месяце, в этом году, раньше (год, по желанию месяц и день) или «не помню».
// Внизу словами — что будет записано.
import { useEffect, useRef } from 'preact/hooks';
import { daysInMonth, describeRead, MONTH_NAMES, readFromChoice, type DateChoice, type DateMode } from '../lib/dates';

const MODES: [DateMode, string][] = [
  ['today', 'Сегодня'],
  ['month', 'В этом месяце'],
  ['year', 'В этом году'],
  ['custom', 'Раньше…'],
  ['none', 'Не помню'],
];

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);

export function ReadDateInput({ value, onChange }: { value: DateChoice; onChange: (c: DateChoice) => void }) {
  const yearRef = useRef<HTMLInputElement>(null);
  const focusYear = useRef(false);

  // «Раньше…» выбрали сами — сразу в поле года.
  useEffect(() => {
    if (focusYear.current && value.mode === 'custom') yearRef.current?.focus();
    focusYear.current = false;
  }, [value.mode]);

  let summary;
  try {
    summary = (
      <>
        Запишется: <strong>{describeRead(readFromChoice(value))}</strong>
      </>
    );
  } catch (e) {
    summary = e instanceof Error ? e.message : String(e);
  }

  const year = /^\d{4}$/.test(value.year) ? Number(value.year) : null;
  const maxDay = value.month ? daysInMonth(year, Number(value.month)) : 31;
  // Дня, которого нет в новом месяце или году, больше нет и в поле.
  const fitDay = (c: DateChoice) => {
    const y = /^\d{4}$/.test(c.year) ? Number(c.year) : null;
    return c.month && c.day && Number(c.day) <= daysInMonth(y, Number(c.month)) ? c.day : '';
  };

  return (
    <fieldset class="form-group date-field">
      <legend>Когда прочитали?</legend>
      <div class="date-modes">
        {MODES.map(([mode, label]) => (
          <label class="date-mode" key={mode}>
            <input
              type="radio"
              name="read-mode"
              value={mode}
              checked={value.mode === mode}
              onChange={() => {
                focusYear.current = mode === 'custom';
                onChange({ ...value, mode });
              }}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {value.mode === 'custom' && (
        <div class="date-custom">
          <label>
            <span>Год</span>
            <input
              ref={yearRef}
              id="read-year"
              class="form-control"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              placeholder="2015"
              value={value.year}
              onInput={(e) => {
                const c = { ...value, year: e.currentTarget.value.replace(/\D/g, '') };
                onChange({ ...c, day: fitDay(c) });
              }}
            />
          </label>
          <label>
            <span>Месяц</span>
            <select
              id="read-month"
              class="form-control"
              value={value.month}
              onChange={(e) => {
                const c = { ...value, month: e.currentTarget.value };
                onChange({ ...c, day: fitDay(c) });
              }}
            >
              <option value="">не помню</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={String(i + 1)}>
                  {capitalize(name)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>День</span>
            <select
              id="read-day"
              class="form-control"
              value={value.day}
              disabled={!value.month}
              onChange={(e) => onChange({ ...value, day: e.currentTarget.value })}
            >
              <option value="">не помню</option>
              {Array.from({ length: maxDay }, (_, i) => (
                <option key={i} value={String(i + 1)}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p class="help-block date-summary" aria-live="polite">
        {summary}
      </p>
    </fieldset>
  );
}
