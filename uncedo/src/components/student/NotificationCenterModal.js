import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmptyState } from '../ui/States';
import { colors } from '../../theme/colors';

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

export function NotificationCenterModal({
  visible,
  notifications,
  isLoading,
  unreadCount = 0,
  onClose,
  onMarkAllRead,
  onOpenNotification,
  onOpenRequest,
  onOpenSession,
}) {
  const handleOpen = (notification) => {
    if (onOpenNotification) {
      onOpenNotification(notification);
      return;
    }

    if (notification?.sessionId) {
      onOpenSession?.(notification.sessionId);
      return;
    }

    if (notification?.requestId) {
      onOpenRequest?.(notification.requestId);
    }
  };

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.scrim} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.kicker}>In-app notifications</Text>
              <Text style={styles.title}>Notifications</Text>
              <Text style={styles.subtitle}>
                {unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}.` : 'Everything is up to date.'}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.actionsPanel}>
            <Pressable accessibilityRole="button" onPress={onMarkAllRead} style={styles.primaryAction}>
              <Ionicons name="checkmark-done" size={16} color="#ffffff" />
              <Text style={styles.primaryActionText}>Mark all read</Text>
            </Pressable>
            <Text style={styles.helperCopy}>Real-time request, session, and payment updates appear here.</Text>
          </View>

          {isLoading ? (
            <EmptyState title="Loading notifications" message="Listening for request, session, and tutor updates." />
          ) : notifications.length ? (
            <ScrollView contentContainerStyle={styles.list}>
              {notifications.map((notification) => (
                <Pressable
                  accessibilityRole="button"
                  key={notification.id}
                  disabled={!notification?.requestId && !notification?.sessionId && !notification?.targetPath}
                  onPress={() => handleOpen(notification)}
                  style={[
                    styles.card,
                    notification?.read ? styles.cardRead : styles.cardUnread,
                  ]}
                >
                  <View style={styles.cardRow}>
                    <View style={[
                      styles.cardIconWrap,
                      notification?.read ? styles.cardIconWrapRead : styles.cardIconWrapUnread,
                    ]}>
                      <Ionicons
                        name={notification?.read ? 'checkmark-done' : 'notifications'}
                        size={16}
                        color={notification?.read ? colors.muted : colors.brandDark}
                      />
                    </View>
                    <View style={styles.cardBody}>
                      <View style={styles.cardTopRow}>
                        <View style={styles.cardTextWrap}>
                          <Text style={styles.cardTitle}>{notification.title || 'Notification'}</Text>
                          <Text style={styles.cardMessage}>{notification.message || 'You have a new update.'}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color="#a1a1aa" />
                      </View>

                      <View style={styles.metaRow}>
                        <View style={styles.typePill}>
                          <Text style={styles.typePillLabel}>{notification.type || 'update'}</Text>
                        </View>
                        {getNotificationTime(notification.createdAt) ? (
                          <Text style={styles.metaText}>{getNotificationTime(notification.createdAt)}</Text>
                        ) : null}
                        {!notification?.read ? (
                          <View style={styles.newPill}>
                            <Text style={styles.newPillLabel}>New</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <EmptyState title="No notifications yet" message="Realtime updates appear here." />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,24,27,0.30)',
  },
  sheet: {
    position: 'absolute',
    top: 12,
    right: 12,
    bottom: 12,
    width: '92%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  kicker: {
    color: colors.brand,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.6,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  actionsPanel: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 10,
  },
  primaryAction: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  helperCopy: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  list: {
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  card: {
    borderRadius: 16,
    padding: 12,
  },
  cardRead: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 1,
  },
  cardUnread: {
    backgroundColor: 'rgba(217,70,239,0.05)',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardIconWrap: {
    marginTop: 2,
    height: 40,
    width: 40,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconWrapRead: {
    backgroundColor: '#f4f4f5',
  },
  cardIconWrapUnread: {
    backgroundColor: 'rgba(217,70,239,0.15)',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  cardMessage: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  typePill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typePillLabel: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  metaText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '500',
  },
  newPill: {
    backgroundColor: colors.brand,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newPillLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
});
