import { useEffect, useState } from 'react';
import { checkApiHealth, healthEndpoint } from '../shared/api/health';

const apiStatuses = {
  checking: {
    label: 'Comprobando conexión',
    classes: 'bg-stone-100 text-stone-700',
    dot: 'bg-stone-500',
  },
  available: {
    label: 'Disponible',
    classes: 'bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-600',
  },
  unavailable: {
    label: 'No disponible',
    classes: 'bg-red-50 text-red-900',
    dot: 'bg-red-600',
  },
};

const checkTime = new Intl.DateTimeFormat('es-EC', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function App() {
  const [attempt, setAttempt] = useState(0);
  const [apiStatus, setApiStatus] =
    useState<keyof typeof apiStatuses>('checking');
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    let current = true;

    void checkApiHealth(controller.signal).then((healthy) => {
      window.clearTimeout(timeout);
      if (!current) return;

      setApiStatus(healthy ? 'available' : 'unavailable');
      setLastCheckedAt(new Date());
    });

    return () => {
      current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt]);

  const status = apiStatuses[apiStatus];

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 sm:px-10">
      <header className="border-b border-[#d9e1db] py-6">
        <p className="border-l-4 border-[#2c6856] pl-3 text-sm font-semibold">
          Sistema Multi-Junta
        </p>
      </header>

      <main className="flex flex-1 items-center py-14 sm:py-20">
        <div className="w-full max-w-2xl">
          <h1 className="max-w-xl text-4xl leading-tight font-semibold tracking-tight sm:text-6xl">
            Estado de la infraestructura
          </h1>

          <section
            aria-labelledby="api-heading"
            className="mt-8 overflow-hidden rounded-2xl border border-[#d9e1db] bg-white shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-7">
              <div>
                <h2 className="text-xl font-semibold" id="api-heading">
                  API del sistema
                </h2>
                <code className="mt-2 block text-sm text-[#465d54]">
                  GET {healthEndpoint}
                </code>
              </div>

              <p
                className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${status.classes}`}
                role="status"
              >
                <span
                  className={`size-2 rounded-full ${status.dot}`}
                  aria-hidden="true"
                />
                {status.label}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#d9e1db] bg-[#fafcf9] px-5 py-4 sm:px-7">
              <p className="text-sm text-[#465d54]">
                {lastCheckedAt && (
                  <>
                    Última comprobación{' '}
                    <time
                      className="font-medium text-[#192e27]"
                      dateTime={lastCheckedAt.toISOString()}
                    >
                      {checkTime.format(lastCheckedAt)}
                    </time>
                  </>
                )}
              </p>

              <button
                className="rounded-lg bg-[#215545] px-4 py-2 text-sm font-semibold text-white hover:bg-[#163c30] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#215545] disabled:cursor-wait disabled:bg-[#47685b]"
                disabled={apiStatus === 'checking'}
                onClick={() => {
                  setApiStatus('checking');
                  setAttempt((previous) => previous + 1);
                }}
                type="button"
              >
                Volver a comprobar
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
