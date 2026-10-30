import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export function Loading({ children = 'Загрузка' }: { children?: ComponentChildren }) {
  return (
    <p class="loading">
      {children} <span class="spinner" />
    </p>
  );
}

export function ErrorAlert({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const text = error instanceof Error ? error.message : String(error);
  return (
    <div class="alert alert-danger" role="alert">
      <strong>Ошибка!</strong> {text}{' '}
      {onRetry && (
        <button type="button" class="btn-link" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export interface Async<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

// Загрузка данных с повтором: в v1 при ошибке API «Загрузка» висела вечно.
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> {
  const [state, setState] = useState<{ data?: T; error?: unknown; loading: boolean }>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    load().then(
      (data) => alive && setState({ data, loading: false }),
      (error) => alive && setState({ error, loading: false }),
    );
    return () => {
      alive = false;
    };
  }, [...deps, attempt]);
  return { ...state, data: state.data, error: state.error, reload: () => setAttempt((a) => a + 1) };
}
