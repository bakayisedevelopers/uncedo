import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export function CustomerSecurityScreen({ navigate }) {
  const { deleteAccount, reactivateAccount, setUser, user } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState('');

  const isPendingDeletion = String(user?.accountStatus || '').trim().toLowerCase() === 'pending_deletion';
  const deletionDateLabel = user?.deletionScheduledAtMs
    ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(user.deletionScheduledAtMs))
    : 'in 30 days';

  const removeAccount = async () => {
    if (confirmText.trim() !== 'DELETE') {
      setMessage('Type DELETE to confirm scheduling account deletion.');
      return;
    }

    try {
      setIsDeleting(true);
      setMessage('');
      await deleteAccount(user.uid, reason);
      setUser(null);
    } catch (error) {
      setMessage(error.message || 'Unable to schedule account deletion right now.');
    } finally {
      setIsDeleting(false);
    }
  };

  const restoreAccount = async () => {
    try {
      setIsDeleting(true);
      setMessage('');
      await reactivateAccount();
      setMessage('Your account has been reactivated and the 30-day scheduled deletion was canceled.');
    } catch (error) {
      setMessage(error.message || 'Unable to reactivate account right now.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to profile"
        onBack={() => navigate('Profile')}
        subtitle="Keep your account safe, review safety guidance, and remove your account if needed."
        title="Security"
      />

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Safety guidance</Text>
        <View style={styles.noteList}>
          <Text style={styles.note}>Share clear job details before a helper arrives.</Text>
          <Text style={styles.note}>Use the in-app payment flow instead of off-platform payments.</Text>
          <Text style={styles.note}>Keep your contact details and payment card up to date.</Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Linked policies</Text>
        <Text style={styles.copy}>Open the legal page for terms, privacy, pricing, refund, and data handling details.</Text>
        <Button variant="secondary" onPress={() => navigate('CustomerLegal')}>
          Open legal policies
        </Button>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>
          {isPendingDeletion ? 'Scheduled account deletion' : 'Delete account'}
        </Text>
        {isPendingDeletion ? (
          <>
            <Text style={styles.copy}>
              Your customer account is scheduled for permanent deletion on {deletionDateLabel}. Cancel deletion now to restore full access immediately.
            </Text>
            <Button disabled={isDeleting} onPress={restoreAccount}>
              {isDeleting ? 'Reactivating...' : 'Cancel deletion & reactivate account'}
            </Button>
          </>
        ) : (
          <>
            <Text style={styles.copy}>
              Deleting schedules your account for permanent removal in 30 days. You can sign back in or reply on WhatsApp anytime within 30 days to reactivate. After 30 days, your profile is removed while past service records retain your details for platform and helper records.
            </Text>
            <TextInput
              placeholder="Optional reason (why are you leaving?)"
              placeholderTextColor={colors.muted}
              style={styles.deleteInput}
              value={reason}
              onChangeText={setReason}
            />
            <Text style={styles.danger}>Type DELETE below to confirm scheduling 30-day account deletion.</Text>
            <TextInput
              placeholder="Type DELETE"
              placeholderTextColor={colors.muted}
              style={styles.deleteInput}
              value={confirmText}
              onChangeText={setConfirmText}
            />
            <Button variant="secondary" disabled={isDeleting} onPress={removeAccount}>
              {isDeleting ? 'Scheduling deletion...' : 'Schedule 30-day deletion'}
            </Button>
          </>
        )}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingBottom: 32,
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  noteList: {
    gap: 10,
  },
  note: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  danger: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  deleteInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  message: {
    color: colors.text,
    fontSize: 13,
  },
});
