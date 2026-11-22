import { ApiError } from '@multi-junta/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';

type ApiState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; message: string };

function messageFor(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'No pudimos completar la solicitud. Intenta nuevamente.';
}

export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  onUnauthorized: () => void,
) {
  const [state, setState] = useState<ApiState<T>>({ kind: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });

    void load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ kind: 'ready', data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) {
          onUnauthorized();
        } else {
          setState({ kind: 'error', message: messageFor(error) });
        }
      },
    );

    return () => controller.abort();
  }, [load, onUnauthorized, revision]);

  return {
    state,
    reload: () => setRevision((previous) => previous + 1),
    update: (change: (data: T) => T) =>
      setState((previous) =>
        previous.kind === 'ready'
          ? { kind: 'ready', data: change(previous.data) }
          : previous,
      ),
  };
}

export function useCommand(onUnauthorized?: () => void) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (command: () => Promise<void>) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      setError(null);

      try {
        await command();
      } catch (failure) {
        if (
          onUnauthorized &&
          failure instanceof ApiError &&
          failure.status === 401
        ) {
          onUnauthorized();
        } else {
          setError(messageFor(failure));
        }
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [onUnauthorized],
  );

  return { busy, error, setError, run };
}
