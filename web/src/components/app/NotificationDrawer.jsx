import { CheckCheck, MonitorSmartphone, X } from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import NotificationFeed from './NotificationFeed';

function getPermissionCopy(permission) {
  if (permission === 'granted') return 'Browser notifications are enabled.';
  if (permission === 'denied') return 'Browser notifications are blocked in your browser settings.';
  return 'Enable browser notifications to get updates even when this tab is open.';
}

export default function NotificationDrawer({
  isOpen,
  notifications,
  unreadCount,
  browserPermission,
  isLoading,
  onClose,
  onSelectNotification,
  onMarkAllRead,
  onRequestBrowserPermission,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-950/30 backdrop-blur-[2px]"
        aria-label="Close notifications"
        onClick={onClose}
      />

      <aside className="absolute right-3 top-3 bottom-3 flex w-[92vw] max-w-md flex-col overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand">
              In-app notifications
            </p>
            <h2 className="mt-1 text-xl font-black text-zinc-900">Notifications</h2>
            <p className="mt-1 text-sm text-zinc-600">
              {unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}.` : 'Everything is up to date.'}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-zinc-700"
            aria-label="Close notifications"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b border-zinc-200 px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              <CheckCheck className="h-4 w-4" />
              Mark all read
            </button>

            <button
              type="button"
              onClick={onRequestBrowserPermission}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              <MonitorSmartphone className="h-4 w-4" />
              {browserPermission === 'granted' ? 'Browser alerts on' : 'Enable browser alerts'}
            </button>
          </div>

          <p className="text-xs text-zinc-500">{getPermissionCopy(browserPermission)}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <EmptyState
              title="Loading notifications"
              description="Listening for request, session, and tutor updates."
              compact
            />
          ) : (
            <NotificationFeed
              notifications={notifications}
              onSelectNotification={onSelectNotification}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
