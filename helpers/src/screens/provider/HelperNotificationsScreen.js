import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen } from '../../components/app/HelperUi';
import { colors } from '../../theme/colors';

function formatNotificationDate(value) {
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
}

export function HelperNotificationsScreen({ notifications = [], onMarkAllRead, onOpenNotification, goBack }) {
  return (
    <Screen
      title="Notifications"
      description="Server-authored job and reward updates. Reward notifications open the relevant Helper Rewards area."
      footerAction={<ActionButton label="Back to profile" tone="secondary" onPress={() => goBack('Profile')} />}
    >
      <Card>
        <ActionButton label="Mark all read" tone="secondary" onPress={onMarkAllRead} disabled={!notifications.some((item) => !item.read)} />
      </Card>
      {!notifications.length ? (
        <Card><EmptyState title="No notifications yet" description="Job, payout, and reward updates will appear here when the server sends them." /></Card>
      ) : notifications.map((notification) => (
        <Pressable
          accessibilityLabel={`${notification.read ? 'Read' : 'Unread'} notification: ${notification.title || 'Update'}`}
          accessibilityRole="button"
          key={notification.id}
          onPress={() => onOpenNotification?.(notification)}
          style={[styles.row, !notification.read && styles.rowUnread]}
        >
          <View style={styles.copy}>
            <Text style={styles.title}>{notification.title || 'Uncedo update'}</Text>
            <Text style={styles.message}>{notification.message || 'Open for details.'}</Text>
            <Text style={styles.date}>{formatNotificationDate(notification.createdAt)}</Text>
          </View>
          {!notification.read ? <View accessibilityLabel="Unread" style={styles.dot} /> : null}
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  rowUnread: { backgroundColor: '#fff8fc', borderColor: '#f9a8d4' },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 14, fontWeight: '900' },
  message: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  date: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  dot: { backgroundColor: colors.brand, borderRadius: 999, height: 10, width: 10 },
});
