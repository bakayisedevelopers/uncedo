import { useEffect, useMemo, useState } from 'react';
import '@excalidraw/excalidraw/index.css';
import { debugError, debugLog } from '../../utils/devLogger';

const EXCALIDRAW_RELOAD_RETRY_KEY = 'parakleo_excalidraw_chunk_reload_retry';

export default function TldrawSdkEmbed({ roomId, onMount }) {
  const [ExcalidrawComponent, setExcalidrawComponent] = useState(null);
  const [loadError, setLoadError] = useState('');

  const persistenceKey = useMemo(
    () => `parakleo-excalidraw-${roomId || 'session-board'}`,
    [roomId],
  );

  useEffect(() => {
    let canceled = false;

    async function loadSdk() {
      try {
        setLoadError('');
        debugLog('excalidraw', 'Loading Excalidraw OSS runtime module.');

        const module = await import('@excalidraw/excalidraw');
        if (canceled) return;

        const sdkComponent = module?.Excalidraw || null;
        if (!sdkComponent) {
          debugError('excalidraw', 'SDK module missing Excalidraw export.');
          setLoadError('Whiteboard failed to initialize (missing Excalidraw export).');
          return;
        }

        debugLog('excalidraw', 'Excalidraw OSS SDK loaded successfully.');
        setExcalidrawComponent(() => sdkComponent);
      } catch (error) {
        if (canceled) return;
        debugError('excalidraw', 'Whiteboard SDK load failed.', { message: error?.message });

        const isChunkLoadFailure = /Failed to fetch dynamically imported module/i.test(error?.message || '');
        const hasRetried = typeof window !== 'undefined'
          && window.sessionStorage?.getItem(EXCALIDRAW_RELOAD_RETRY_KEY) === 'true';

        if (isChunkLoadFailure && !hasRetried && typeof window !== 'undefined') {
          window.sessionStorage?.setItem(EXCALIDRAW_RELOAD_RETRY_KEY, 'true');
          window.location.reload();
          return;
        }

        if (typeof window !== 'undefined') {
          window.sessionStorage?.removeItem(EXCALIDRAW_RELOAD_RETRY_KEY);
        }

        setLoadError(error?.message || 'Unable to load Excalidraw SDK.');
      }
    }

    loadSdk();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!ExcalidrawComponent || typeof window === 'undefined') return;
    window.sessionStorage?.removeItem(EXCALIDRAW_RELOAD_RETRY_KEY);
  }, [ExcalidrawComponent]);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm font-semibold text-rose-600">Whiteboard is temporarily unavailable.</p>
        <p className="text-xs text-zinc-500">{loadError}</p>
      </div>
    );
  }

  if (!ExcalidrawComponent) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-zinc-500">
        Loading Excalidraw whiteboard...
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ExcalidrawComponent
        excalidrawAPI={(api) => {
          if (!api) return;
          onMount?.({
            refresh: () => {
              try {
                const appState = api.getAppState?.() || {};
                api.updateScene({ appState });
              } catch {
                // no-op
              }
            },
            setSceneElements: (elements = []) => {
              try {
                const nextElements = Array.isArray(elements) ? elements : [];
                api.updateScene({ elements: nextElements });
              } catch {
                // no-op
              }
            },
            setSceneContent: ({ elements = [], files = [] } = {}) => {
              try {
                const nextElements = Array.isArray(elements) ? elements : [];
                const nextFiles = Array.isArray(files) ? files : [];
                const currentElements = typeof api.getSceneElementsIncludingDeleted === 'function'
                  ? api.getSceneElementsIncludingDeleted()
                  : [];
                const preservedElements = Array.isArray(currentElements)
                  ? currentElements.filter((element) => {
                    const elementId = String(element?.id || '');
                    return !elementId.startsWith('parsed-question-') && !elementId.startsWith('parsed-image-');
                  })
                  : [];
                if (nextFiles.length) {
                  api.addFiles(nextFiles);
                }
                api.updateScene({ elements: [...preservedElements, ...nextElements] });
              } catch {
                // no-op
              }
            },
            resetScene: () => {
              try {
                api.resetScene?.();
              } catch {
                // no-op
              }
            },
            addFiles: (files = []) => {
              try {
                const nextFiles = Array.isArray(files) ? files : [];
                if (nextFiles.length) {
                  api.addFiles(nextFiles);
                }
              } catch {
                // no-op
              }
            },
          });
        }}
        onChange={(elements, appState) => {
          if (typeof window === 'undefined') return;
          try {
            const payload = JSON.stringify({ elements, appState });
            window.localStorage.setItem(persistenceKey, payload);
          } catch {
            // no-op
          }
        }}
      />
    </div>
  );
}
