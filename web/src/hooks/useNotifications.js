import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getBrowserNotificationPermission,
  markAllNotificationsRead,
  markNotificationRead,
  requestBrowserNotificationPermission,
  showBrowserNotification,
  subscribeToNotifications,
} from '../services/notificationService';

export function useNotifications(userId, options = {}) {
  const role = String(options.role || 'student').toLowerCase();
  const onNotificationSelectRef = useRef(options.onNotificationSelect || null);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [browserPermission, setBrowserPermission] = useState(getBrowserNotificationPermission());
  const seenNotificationIdsRef = useRef(new Set());
  const initializedRef = useRef(false);

  useEffect(() => {
    onNotificationSelectRef.current = options.onNotificationSelect || null;
  }, [options.onNotificationSelect]);

  useEffect(() => {
    seenNotificationIdsRef.current = new Set();
    initializedRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserPermission(window.Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToNotifications(userId, (items) => {
      setNotifications(items);
      setIsLoading(false);

      const nextIds = new Set(items.map((item) => item.id).filter(Boolean));
      if (!initializedRef.current) {
        seenNotificationIdsRef.current = nextIds;
        initializedRef.current = true;
        return;
      }

      items.forEach((notification) => {
        const notificationId = notification?.id;
        if (!notificationId || seenNotificationIdsRef.current.has(notificationId)) {
          return;
        }

        seenNotificationIdsRef.current.add(notificationId);

        if (notification.read) {
          return;
        }

        if (typeof window !== 'undefined' && window.Notification?.permission === 'granted') {
          showBrowserNotification({
            ...notification,
            onClick: () => {
              onNotificationSelectRef.current?.(notification, role);
            },
          });
        }
      });
    });

    return () => unsub?.();
  }, [role, userId]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  const requestBrowserPermission = async () => {
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    return permission;
  };

  const markRead = async (notificationId) => {
    await markNotificationRead(notificationId);
  };

  const markAllRead = async () => {
    await markAllNotificationsRead(userId);
  };

  return {
    notifications,
    isLoading,
    unreadCount,
    browserPermission,
    requestBrowserPermission,
    markRead,
    markAllRead,
  };
}
