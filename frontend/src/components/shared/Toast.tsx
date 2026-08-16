import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Long enough to read a sentence, short enough not to linger over the page. */
const TOAST_TIMEOUT_MS = 8000;

interface Toast {
  id: number;
  message: string;
}

interface ToastContextValue {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be called inside a ToastProvider');
  }
  return context;
}

/**
 * Hosts transient failure messages for the tree below it.
 *
 * Each toast carries `role="alert"` inside a container that is present from
 * first render, so an optimistic update rolling back is announced rather than
 * only drawn. A silent rollback is the failure this exists to prevent: the row
 * vanishes from the calendar and the user is left believing they recorded a
 * transaction that was never persisted.
 *
 * Toasts stack rather than replace. Two failures in a row are two things the
 * user needs to know about, not one.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), TOAST_TIMEOUT_MS));
    },
    [dismiss],
  );

  // Clear anything still pending if the provider unmounts mid-timeout.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="assertive"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-[380px] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="alert"
            className="pointer-events-auto flex items-start justify-between gap-3 rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-error-dark shadow-lg"
          >
            <p className="min-w-0">{toast.message}</p>
            <button
              type="button"
              aria-label={`Dismiss: ${toast.message}`}
              onClick={() => dismiss(toast.id)}
              className="hit-target shrink-0 rounded text-[13px] underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
            >
              Dismiss
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
