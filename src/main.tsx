import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent benign ResizeObserver loop notifications (triggered by @xyflow/react canvas resizing)
// from surfacing as uncaught runtime errors in browser error overlays.
if (typeof window !== 'undefined') {
  const isResizeObserverLoopError = (msg: unknown): boolean => {
    if (typeof msg !== 'string') return false;
    return (
      msg.includes('ResizeObserver loop completed with undelivered notifications') ||
      msg.includes('ResizeObserver loop limit exceeded')
    );
  };

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      if (
        isResizeObserverLoopError(event.message) ||
        isResizeObserverLoopError(event.error?.message)
      ) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    true
  );

  const NativeResizeObserver = window.ResizeObserver;
  if (NativeResizeObserver) {
    window.ResizeObserver = class SafeResizeObserver extends NativeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        super((entries, observer) => {
          window.requestAnimationFrame(() => {
            try {
              callback(entries, observer);
            } catch (err) {
              if (!isResizeObserverLoopError((err as Error)?.message)) {
                throw err;
              }
            }
          });
        });
      }
    };
  }
}

createRoot(document.getElementById('root')!).render(<App />);
