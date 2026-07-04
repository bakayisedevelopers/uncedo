import { useNavigate } from 'react-router-dom';
import { MonitorSmartphone } from 'lucide-react';
import NotificationFeed from '../../components/app/NotificationFeed';
import PageHeader from '../../components/ui/PageHeader';
import SectionCard from '../../components/ui/SectionCard';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { getNotificationDestination } from '../../services/notificationService';

function getPermissionCopy(permission) {
  if (permission === 'granted') return 'Browser notifications are enabled.';
  if (permission === 'denied') return 'Browser notifications are blocked in your browser settings.';
  return 'Enable browser notifications to get updates even when this tab is open.';
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const activeRole = String(user?.activeRole || user?.role || 'student').toLowerCase();
  const {
    notifications,
    isLoading,
    unreadCount,
    browserPermission,
    requestBrowserPermission,
    markRead,
    markAllRead,
  } = useNotifications(user?.uid, { role: activeRole });

  const handleSelectNotification = async (notification) => {
    const destination = getNotificationDestination(notification, activeRole);
    if (notification?.id) {
      await markRead(notification.id).catch(() => null);
    }
    if (destination) {
      navigate(destination);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" description="Real-time request, session, payment, and account updates appear here." />

      <SectionCard
        title="In-app notifications"
        subtitle={unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}.` : 'Everything is up to date.'}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => markAllRead().catch(() => null)}
              className="inline-flex items-center gap-2 rounded-2xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              Mark all read
            </button>

            <button
              type="button"
              onClick={() => requestBrowserPermission().catch(() => null)}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
            >
              <MonitorSmartphone className="h-4 w-4" />
              {browserPermission === 'granted' ? 'Browser alerts on' : 'Enable browser alerts'}
            </button>
          </div>

          <p className="text-xs text-zinc-500">{getPermissionCopy(browserPermission)}</p>

          <NotificationFeed
            notifications={notifications}
            isLoading={isLoading}
            onSelectNotification={handleSelectNotification}
          />
        </div>
      </SectionCard>
    </div>
  );
}
