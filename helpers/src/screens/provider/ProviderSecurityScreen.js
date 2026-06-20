import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card } from '../../components/app/HelperUi';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../theme/colors';

export function ProviderSecurityScreen({ goBack, navigate }) {
  const { deleteAccount, logout, user } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState('');

  const removeAccount = async () => {
    if (confirmText !== 'DELETE') {
      setMessage('Type DELETE to confirm account deletion.');
      return;
    }

    try {
      setIsDeleting(true);
      await deleteAccount(user.uid);
    } catch (error) {
      setMessage(error.message || 'Unable to delete account. You may need to sign in again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Profile')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to profile</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Security</Text>
        <Text style={styles.copy}>Keep your account safe, review trust requirements, and remove your account if needed.</Text>
      </View>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Safety guidance</Text>
        <View style={styles.noteList}>
          <Text style={styles.note}>Keep your live location active only while you are available for work.</Text>
          <Text style={styles.note}>Use verified payout details and the in-app workflow for every customer job.</Text>
          <Text style={styles.note}>Only accept jobs you can complete inside the requested area and time.</Text>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Linked policies</Text>
        <Text style={styles.copy}>Open the legal page for agreement and customer-facing platform policies.</Text>
        <ActionButton label="Open legal policies" tone="secondary" onPress={() => navigate({ key: 'ProviderLegal', params: { parentTab: 'Profile' } })} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Session</Text>
        <ActionButton label="Log out" tone="secondary" onPress={logout} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Delete account</Text>
        <Text style={styles.copy}>This permanently removes your helper profile and access.</Text>
        <Text style={styles.danger}>Type DELETE below to confirm permanent account deletion.</Text>
        <TextInput
          placeholder="Type DELETE"
          placeholderTextColor={colors.muted}
          style={styles.deleteInput}
          value={confirmText}
          onChangeText={setConfirmText}
        />
        <ActionButton label={isDeleting ? 'Deleting account...' : 'Delete my account'} tone="danger" disabled={isDeleting} onPress={removeAccount} />
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
  backRow: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  backText: {
    color: colors.brandDark,
    fontSize: 13,
    fontWeight: '800',
  },
  header: {
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
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
