import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';
import { StatusBadge } from '../ui/StatusBadge';
import { PaystackAuthorizationModal } from './PaystackAuthorizationModal';
import { removePaymentMethod, setDefaultPaymentMethod } from '../../services/paymentMethodService';
import { verifyCardAuthorization } from '../../services/paystackService';
import { syncStudentGrowth } from '../../services/studentGrowthService';
import { colors } from '../../theme/colors';

export function PaymentMethodsManager({ user, setUser, onMessage }) {
  const [isAuthorizingCard, setIsAuthorizingCard] = useState(false);

  async function syncGrowthState() {
    const syncedProfile = await syncStudentGrowth().catch(() => null);
    if (syncedProfile) {
      setUser((prev) => ({ ...prev, ...syncedProfile }));
    }
  }

  async function handleAuthorizationSuccess(response) {
    try {
      const result = await verifyCardAuthorization(response.reference, {
        userId: user.uid,
      });
      setUser((prev) => {
        const existing = Array.isArray(prev?.paymentMethods) ? prev.paymentMethods : [];
        const alreadyExists = existing.some((method) => method.id === result.card.id);
        return {
          ...prev,
          paymentMethods: alreadyExists ? existing : [...existing, result.card],
        };
      });
      await syncGrowthState();
      onMessage?.(
        result.refunded
          ? `Card ending in ${result.card.last4} added successfully. Your R1 authorization has been refunded.`
          : result.refundMessage || `Card ending in ${result.card.last4} was added.`,
      );
    } catch (error) {
      onMessage?.(error.message || 'We could not verify and save this card. Please try again.');
    } finally {
      setIsAuthorizingCard(false);
    }
  }

  function handleAuthorizationClose() {
    setIsAuthorizingCard(false);
    onMessage?.('Card authorization cancelled.');
  }

  function handleAuthorizationError(error) {
    setIsAuthorizingCard(false);
    onMessage?.(`Failed to initialize payment: ${error.message}`);
  }

  async function makeDefault(cardId) {
    const next = await setDefaultPaymentMethod(user, cardId);
    setUser((prev) => ({ ...prev, ...next }));
    await syncGrowthState();
    onMessage?.('Primary card updated.');
  }

  async function removeCard(cardId) {
    const next = await removePaymentMethod(user, cardId);
    setUser((prev) => ({ ...prev, ...next }));
    await syncGrowthState();
    onMessage?.('Card removed.');
  }

  const methods = Array.isArray(user?.paymentMethods) ? user.paymentMethods : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.form}>
        <Button
          disabled={isAuthorizingCard}
          onPress={() => setIsAuthorizingCard(true)}
          icon={<Ionicons name="add-circle-outline" size={18} color="#ffffff" />}
        >
          {isAuthorizingCard ? 'Authorizing card...' : 'Add a Card'}
        </Button>
        <Text style={styles.copy}>We charge R1 to securely authorize your card, then immediately refund it after verification.</Text>
      </View>

      <PaystackAuthorizationModal
        email={user?.email}
        onClose={handleAuthorizationClose}
        onError={handleAuthorizationError}
        onSuccess={handleAuthorizationSuccess}
        visible={isAuthorizingCard}
      />

      {!methods.length ? <EmptyState title="No cards added yet" message="Add a verified card before sending a job request." /> : null}

      {methods.map((card) => (
        <View key={card.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>{card.nickname || 'Card'}</Text>
              <Text style={styles.copy}>{card.brand || 'Card'} ending {card.last4 || '----'}</Text>
            </View>
            {card.isDefault ? <StatusBadge label="Primary" tone="success" /> : null}
          </View>
          <View style={styles.actions}>
            <Button
              variant="secondary"
              disabled={card.isDefault}
              onPress={() => makeDefault(card.id)}
              icon={<Ionicons name="checkmark-circle-outline" size={16} color={colors.brand} />}
            >
              Set primary
            </Button>
            <Button
              variant="secondary"
              onPress={() => removeCard(card.id)}
              icon={<Ionicons name="trash-outline" size={16} color={colors.brand} />}
            >
              Remove
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
  },
  form: {
    gap: 12,
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#fafafa',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  actions: {
    gap: 8,
  },
});
