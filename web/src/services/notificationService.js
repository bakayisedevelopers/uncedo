import { getFirebaseClients } from '../firebase/config';

const MOCK_NOTIFICATIONS_KEY = 'parakleo_mock_notifications';
const BROWSER_NOTIFICATION_TITLE = 'Parakleo';

function getMockNotifications() {
  return JSON.parse(localStorage.getItem(MOCK_NOTIFICATIONS_KEY) || '[]');
}

function setMockNotifications(notifications) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(MOCK_NOTIFICATIONS_KEY, JSON.stringify(notifications));
  window.dispatchEvent(new StorageEvent('storage'));
}

function normalizeNotification(item = {}) {
  return {
    ...item,
    id: item.id || crypto.randomUUID(),
    read: Boolean(item.read),
  };
}

function updateMockNotification(notificationId, updater) {
  const next = getMockNotifications().map((item) => {
    if (item.id !== notificationId) return item;
    return normalizeNotification(updater(item));
  });
  setMockNotifications(next);
  return next.find((item) => item.id === notificationId) || null;
}

export function isBrowserNotificationSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission() {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  if (window.Notification.permission !== 'default') {
    return window.Notification.permission;
  }

  return window.Notification.requestPermission();
}

export function showBrowserNotification(notification = {}) {
  if (!isBrowserNotificationSupported()) return false;
  if (window.Notification.permission !== 'granted') return false;

  try {
    const title = String(notification.title || BROWSER_NOTIFICATION_TITLE);
    const body = String(notification.message || '');
    const options = {
      body,
      tag: String(notification.id || notification.notificationId || notification.type || body || title),
      renotify: false,
      data: {
        id: notification.id || notification.notificationId || null,
        requestId: notification.requestId || null,
        sessionId: notification.sessionId || null,
        targetPath: notification.targetPath || null,
        type: notification.type || null,
      },
    };

    const browserNotification = new window.Notification(title, options);
    if (typeof notification.onClick === 'function') {
      browserNotification.onclick = (event) => {
        event?.preventDefault?.();
        window.focus?.();
        notification.onClick(browserNotification);
        browserNotification.close?.();
      };
    }

    return true;
  } catch {
    return false;
  }
}

export async function createNotification(payload) {
  const clients = await getFirebaseClients();

  if (!clients) {
    const next = [
      {
        id: crypto.randomUUID(),
        ...payload,
        read: false,
        readAt: null,
        createdAt: new Date().toISOString(),
      },
      ...getMockNotifications(),
    ];
    setMockNotifications(next);
    return;
  }

  const { db, firestoreModule } = clients;
  const { addDoc, collection, serverTimestamp } = firestoreModule;

  await addDoc(collection(db, 'notifications'), {
    ...payload,
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToNotifications(userId, callback) {
  let unsub = () => {};

  getFirebaseClients().then((clients) => {
    if (!userId) {
      callback([]);
      return;
    }

    if (!clients) {
      const emit = () => callback(getMockNotifications().filter((item) => item.userId === userId));
      emit();
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', emit);
        unsub = () => window.removeEventListener('storage', emit);
      }
      return;
    }

    const { db, firestoreModule } = clients;
    const { collection, onSnapshot, orderBy, query, where } = firestoreModule;

    const queryRef = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
    );

    unsub = onSnapshot(queryRef, (snapshot) => {
      callback(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });
  });

  return () => unsub?.();
}

export async function markNotificationRead(notificationId) {
  if (!notificationId) return null;

  const clients = await getFirebaseClients();
  if (!clients) {
    return updateMockNotification(notificationId, (item) => ({
      ...item,
      read: true,
      readAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  }

  const { db, firestoreModule } = clients;
  const { doc, serverTimestamp, updateDoc } = firestoreModule;

  await updateDoc(doc(db, 'notifications', notificationId), {
    read: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return notificationId;
}

export async function markAllNotificationsRead(userId) {
  if (!userId) return [];

  const clients = await getFirebaseClients();
  if (!clients) {
    const next = getMockNotifications().map((item) => (
      item.userId === userId
        ? { ...item, read: true, readAt: item.readAt || new Date().toISOString(), updatedAt: new Date().toISOString() }
        : item
    ));
    setMockNotifications(next);
    return next.filter((item) => item.userId === userId);
  }

  const { db, firestoreModule } = clients;
  const { collection, getDocs, query, updateDoc, where, serverTimestamp } = firestoreModule;
  const snapshot = await getDocs(
    query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
    ),
  );

  await Promise.all(snapshot.docs.map((item) => updateDoc(item.ref, {
    read: true,
    readAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })));

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export function getNotificationDestination(notification = {}, role = 'student') {
  const explicitTarget = String(notification?.targetPath || '').trim();
  if (explicitTarget.startsWith('/app')) {
    return explicitTarget;
  }

  const requestId = String(notification?.requestId || '').trim();
  const sessionId = String(notification?.sessionId || '').trim();
  const type = String(notification?.type || '').toLowerCase();
  const normalizedRole = String(role || 'student').toLowerCase();

  if (type.includes('payment')) {
    return normalizedRole === 'tutor' ? '/app/tutor/payments' : '/app/student/payment';
  }

  if (type.includes('payout')) {
    return '/app/tutor/payments';
  }

  if (type === 'lesson_completed' || type === 'session_completed') {
    return normalizedRole === 'tutor' ? '/app/tutor/my-classes' : '/app/student/requests';
  }

  if (type === 'tutor_offer') {
    return '/app/tutor';
  }

  if (sessionId) {
    return `/app/session/${sessionId}`;
  }

  if (!requestId) return '';

  if (normalizedRole === 'tutor') {
    return '/app/tutor';
  }

  return `/app/student/requests/${requestId}`;
}
