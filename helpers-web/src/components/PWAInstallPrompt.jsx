import { Download, MoreVertical, PlusSquare, Share, X } from 'lucide-react';

export function PWAInstallPrompt({
  isInstalled,
  isIOS,
  hasNativePrompt,
  popupOpen,
  showInstructions,
  onInstall,
  onDismiss,
}) {
  if (isInstalled || !popupOpen) return null;

  const displaySteps = showInstructions || (!hasNativePrompt && isIOS);
  const isPreviewHost = typeof window !== 'undefined' && window.location.hostname.endsWith('.run.app');

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="pwa-install-title"
      className="fixed inset-x-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-[390px] z-50 rounded-2xl border border-border bg-surface shadow-2xl shadow-forest-950/15 overflow-hidden"
    >
      <div className="bg-forest-900 px-4 py-3.5 flex items-center justify-between gap-3 text-white">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/helpers-logo-192.png"
            alt="Uncedo Helpers icon"
            referrerPolicy="no-referrer"
            className="h-11 w-11 rounded-xl bg-white object-cover shrink-0 border border-white/20"
          />
          <div className="min-w-0">
            <h3 id="pwa-install-title" className="font-display text-sm font-bold text-white truncate">
              Install Uncedo Helpers
            </h3>
            <p className="text-xs text-white/75 truncate">
              Add to your home screen for fast shift &amp; job access
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close install prompt"
          className="h-9 w-9 rounded-lg flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4 space-y-3.5">
        {displaySteps ? (
          <div className="space-y-2.5 text-xs text-ink-700">
            <p className="font-semibold text-ink-900">
              {isIOS ? 'Add to your iPhone or iPad Home Screen:' : 'Install from your browser menu:'}
            </p>
            {isIOS ? (
              <ol className="space-y-2">
                <li className="flex items-center gap-2.5">
                  <span className="h-6 w-6 rounded-md bg-well flex items-center justify-center shrink-0">
                    <Share className="h-3.5 w-3.5 text-tealbrand-700" />
                  </span>
                  <span>Tap the <strong>Share</strong> icon in Safari&apos;s toolbar.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-6 w-6 rounded-md bg-well flex items-center justify-center shrink-0">
                    <PlusSquare className="h-3.5 w-3.5 text-tealbrand-700" />
                  </span>
                  <span>Scroll down and select <strong>Add to Home Screen</strong>.</span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-2">
                <li className="flex items-center gap-2.5">
                  <span className="h-6 w-6 rounded-md bg-well flex items-center justify-center shrink-0">
                    <MoreVertical className="h-3.5 w-3.5 text-tealbrand-700" />
                  </span>
                  <span>Open your browser menu (<strong>⋮</strong> or address-bar install icon).</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-6 w-6 rounded-md bg-well flex items-center justify-center shrink-0">
                    <Download className="h-3.5 w-3.5 text-tealbrand-700" />
                  </span>
                  <span>Select <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span>
                </li>
              </ol>
            )}
            {isPreviewHost && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                Install from{' '}
                <a
                  href="https://helpers.bakayise.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline"
                >
                  helpers.bakayise.com
                </a>{' '}
                directly in Chrome or Safari so the home screen app opens outside the preview frame.
              </p>
            )}
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-2 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white min-h-[40px]"
              >
                Got it
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-ink-600 leading-relaxed">
              Launch Uncedo Helpers directly from your phone home screen to go online, get instant job offers, and manage your services without searching for a browser tab.
            </p>
            {isPreviewHost && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                For permanent home-screen installation, open{' '}
                <a
                  href="https://helpers.bakayise.com"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline"
                >
                  helpers.bakayise.com
                </a>{' '}
                directly in Chrome or Safari.
              </p>
            )}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onDismiss}
                className="flex-1 py-2.5 px-3 rounded-lg border border-border bg-surface hover:bg-well text-xs font-semibold text-ink-700 min-h-[44px]"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={onInstall}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg bg-tealbrand-600 hover:bg-tealbrand-700 text-xs font-semibold text-white min-h-[44px]"
              >
                <Download className="h-3.5 w-3.5" />
                Install App
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
