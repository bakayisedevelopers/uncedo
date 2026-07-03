import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PaymentMethodsManager } from '../../components/customer/PaymentMethodsManager';
import { StickyScreenHeader } from '../../components/ui/StickyScreenHeader';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';
import { subscribeToCustomerWallet } from '../../services/walletService';
import { colors } from '../../theme/colors';

export function CustomerPaymentsScreen({ navigate }) {
  const { setUser, user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const walletBalance = Number(wallet?.balance || 0);
  const hasOutstandingBalance = walletBalance < 0;
  const formatMoney = (value) => {
    const normalized = Math.round(Number(value || 0));
    return Number.isFinite(normalized) ? `R${normalized}` : 'R0';
  };

  useEffect(() => subscribeToCustomerWallet(user?.uid, setWallet, (nextError) => setError(nextError.message)), [user?.uid]);

  if (error) return <ErrorState message={error} />;
  if (!wallet) return <LoadingState label="Loading payment" />;

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false} stickyHeaderIndices={[0]}>
      <StickyScreenHeader
        backLabel="Back to profile"
        onBack={() => navigate('Profile')}
        subtitle="Manage your cards and review your current Uncedo balance."
        title="Payment"
      />

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Outstanding balance</Text>
        <Text style={[styles.balance, hasOutstandingBalance ? styles.balanceDanger : styles.balancePositive]}>
          {formatMoney(walletBalance)}
        </Text>
        <Text style={[styles.copy, hasOutstandingBalance ? styles.outstandingCopy : null]}>
          {hasOutstandingBalance
            ? `Outstanding amount owed to Uncedo: ${formatMoney(Math.abs(walletBalance))}.`
            : 'No outstanding balance.'}
        </Text>
      </Card>

      {message ? (
        <Card style={styles.messageCard}>
          <Text style={styles.messageText}>{message}</Text>
        </Card>
      ) : null}

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Payment cards</Text>
        <PaymentMethodsManager user={user} setUser={setUser} onMessage={setMessage} />
      </Card>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Payment policies</Text>
        <Text style={styles.copy}>Review billing, pricing, refund, and card handling terms.</Text>
        <View style={styles.policyLinks}>
          <Pressable accessibilityRole="button" onPress={() => Linking.openURL(LEGAL_URLS.payment).catch(() => null)}>
            <Text style={styles.policyLink}>Payment and Pricing Policy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => Linking.openURL(LEGAL_URLS.refund).catch(() => null)}>
            <Text style={styles.policyLink}>Refund Policy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => Linking.openURL(LEGAL_URLS.privacy).catch(() => null)}>
            <Text style={styles.policyLink}>Privacy Policy</Text>
          </Pressable>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
    paddingBottom: 32,
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    gap: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  balance: {
    fontSize: 30,
    fontWeight: '900',
  },
  balancePositive: {
    color: '#a21caf',
  },
  balanceDanger: {
    color: '#e11d48',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  outstandingCopy: {
    color: '#b45309',
  },
  messageCard: {
    gap: 8,
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  policyLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  policyLink: {
    color: colors.brand,
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});
