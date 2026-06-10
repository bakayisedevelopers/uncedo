import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/States';
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

export function NotificationsScreen({
  notifications = [],
  isLoading = false,
  unreadCount = 0,
  onMarkAllRead,
  onOpenNotification,
}) {
  return (
    <View style={styles.page}>
      <View style={styles.pageGlowTop} />
      <View style={styles.pageGlowBottom} />
      <View style={styles.wrap}>
        <Card style={styles.heroCard}>
          <View style={styles.heroGlowTopLeft} />
          <View style={styles.heroGlowBottomRight} />
          <View style={styles.heroContent}>
            <Text style={styles.kicker}>In-app notifications</Text>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>
              {unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'}.` : 'Everything is up to date.'}
            </Text>
          </View>
        </Card>

        <Card style={styles.actionsCard}>
          <Pressable accessibilityRole="button" onPress={onMarkAllRead} style={styles.primaryAction}>
            <Ionicons name="checkmark-done" size={16} color="#ffffff" />
            <Text style={styles.primaryActionText}>Mark all read</Text>
          </Pressable>
          <Text style={styles.helperCopy}>Real-time request, session, and payment updates appear here.</Text>
        </Card>

        <Card style={styles.listCard}>
          {isLoading ? (
            <EmptyState title="Loading notifications" message="Listening for request, session, and tutor updates." />
          ) : notifications.length ? (
            <ScrollView contentContainerStyle={styles.list} nestedScrollEnabled>
              {notifications.map((notification) => (
                <Pressable
                  accessibilityRole="button"
                  key={notification.id}
                  disabled={!notification?.requestId && !notification?.sessionId && !notification?.targetPath}
                  onPress={() => onOpenNotification?.(notification)}
                  style={[
                    styles.card,
                    notification?.read ? styles.cardRead : styles.cardUnread,
                  ]}
                >
                  <View style={styles.cardRow}>
                    <View
                      style={[
                        styles.cardIconWrap,
                        notification?.read ? styles.cardIconWrapRead : styles.cardIconWrapUnread,
                      ]}
                    >
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
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#f8fafc',
    flex: 1,
  },
  pageGlowTop: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 180,
    height: 260,
    position: 'absolute',
    right: -110,
    top: 24,
    width: 260,
  },
  pageGlowBottom: {
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderRadius: 220,
    bottom: 80,
    height: 300,
    left: -140,
    position: 'absolute',
    width: 300,
  },
  wrap: {
    gap: 16,
    paddingBottom: 12,
  },
  heroCard: {
    overflow: 'hidden',
    padding: 0,
  },
  heroGlowTopLeft: {
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderRadius: 220,
    height: 220,
    left: -70,
    position: 'absolute',
    top: -40,
    width: 220,
  },
  heroGlowBottomRight: {
    backgroundColor: 'rgba(59,130,246,0.14)',
    borderRadius: 200,
    bottom: -70,
    height: 220,
    position: 'absolute',
    right: -80,
    width: 220,
  },
  heroContent: {
    gap: 8,
    padding: 18,
  },
  kicker: {
    color: 'rgba(16,185,129,0.8)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
    lineHeight: 34,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  actionsCard: {
    gap: 10,
  },
  primaryAction: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
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
  listCard: {
    gap: 12,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    padding: 12,
  },
  cardRead: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    elevation: 1,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
  },
  cardUnread: {
    backgroundColor: 'rgba(16,185,129,0.05)',
  },
  cardRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
  },
  cardIconWrap: {
    alignItems: 'center',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    marginTop: 2,
    width: 40,
  },
  cardIconWrapRead: {
    backgroundColor: '#f4f4f5',
  },
  cardIconWrapUnread: {
    backgroundColor: 'rgba(16,185,129,0.15)',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  cardTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
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
    lineHeight: 20,
    marginTop: 4,
  },
  metaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  typePill: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
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
