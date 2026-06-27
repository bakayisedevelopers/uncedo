import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/ui/Card';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PaymentMethodsManager } from '../../components/student/PaymentMethodsManager';
import { LEGAL_URLS } from '../../constants/legal';
import { useAuth } from '../../context/AuthContext';
import { subscribeToStudentWallet } from '../../services/walletService';
import { colors } from '../../theme/colors';

export function WalletScreen() {
  const { setUser, user } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const walletBalance = Number(wallet?.balance || 0);
  const hasOutstandingBalance = walletBalance < 0;

  function openLegalUrl(url) {
    Linking.openURL(url).catch(() => null);
  }

  useEffect(() => subscribeToStudentWallet(user?.uid, setWallet, (nextError) => setError(nextError.message)), [user?.uid]);

  if (error) return <ErrorState message={error} />;
  if (!wallet) return <LoadingState label="Loading payment" />;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Payments & Wallet</Text>
        <Text style={styles.description}>Manage your cards and review any current Uncedo balance.</Text>
      </View>

      <Card style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Outstanding balance</Text>
        <Text style={[styles.balance, hasOutstandingBalance ? styles.balanceDanger : styles.balancePositive]}>
          R{walletBalance.toFixed(2)}
        </Text>
        <Text style={[styles.copy, hasOutstandingBalance ? styles.outstandingCopy : null]}>
          {hasOutstandingBalance
            ? `Outstanding amount owed to Uncedo: R${Math.abs(walletBalance).toFixed(2)}.`
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
          <Pressable accessibilityRole="button" onPress={() => openLegalUrl(LEGAL_URLS.payment)}>
            <Text style={styles.policyLink}>Payment and Pricing Policy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => openLegalUrl(LEGAL_URLS.refund)}>
            <Text style={styles.policyLink}>Refund Policy</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => openLegalUrl(LEGAL_URLS.privacy)}>
            <Text style={styles.policyLink}>Privacy Policy</Text>
          </Pressable>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 16,
  },
  header: {
    gap: 6,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
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
