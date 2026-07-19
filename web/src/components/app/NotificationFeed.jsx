import { Bell, CheckCheck, ChevronRight } from 'lucide-react';
import EmptyState from '../ui/EmptyState';

function getNotificationTime(value) {
  if (!value) return '';
  const date =
    typeof value?.toDate === 'function'
      ? value.toDate()
      : typeof value?.seconds === 'number'
        ? new Date(value.seconds * 1000)
        : new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function NotificationFeed({
  notifications,
  onSelectNotification,
  onMarkRead,
  maxItems = Infinity,
  isLoading = false,
}) {
  const visibleNotifications = Number.isFinite(maxItems) ? notifications.slice(0, maxItems) : notifications;

  if (isLoading) {
    return <EmptyState title="Loading notifications" description="Listening for request, session, and tutor updates." compact />;
  }

  if (!visibleNotifications.length) {
    return <EmptyState title="No notifications yet" description="Real-time updates appear here." compact />;
  }

  return (
    <ul className="space-y-3">
      {visibleNotifications.map((notification) => (
        <li key={notification.id}>
          <button
            type="button"
            onClick={() => {
              if (onSelectNotification) {
                onSelectNotification(notification);
                return;
              }
              onMarkRead?.(notification);
            }}
            className={`w-full rounded-2xl border p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              notification.read
                ? 'border-zinc-200 bg-white'
                : 'border-brand/20 bg-brand/5'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${notification.read ? 'bg-zinc-100 text-zinc-500' : 'bg-brand/15 text-brand-dark'}`}>
                {notification.read ? <CheckCheck className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{notification.title || 'Notification'}</p>
                    <p className="mt-1 text-sm text-zinc-600">{notification.message || 'You have a new update.'}</p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium text-zinc-500">
                  <span className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 uppercase tracking-[0.14em]">
                    {notification.type || 'update'}
                  </span>
                  {getNotificationTime(notification.createdAt) ? (
                    <span>{getNotificationTime(notification.createdAt)}</span>
                  ) : null}
                  {!notification.read ? (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-white">New</span>
                  ) : null}
                </div>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
