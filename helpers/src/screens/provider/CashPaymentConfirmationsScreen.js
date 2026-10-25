import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { ActionButton, Card, EmptyState, Screen } from '../../components/app/HelperUi';
import { getPendingCashPaymentConfirmations, respondToCashPaymentConfirmation } from '../../services/serviceRequestService';
import { colors } from '../../theme/colors';

function money(value) {
  return `R${Number(value || 0).toFixed(2)} ZAR`;
}

export function CashPaymentConfirmationsScreen({ goBack }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getPendingCashPaymentConfirmations());
    } catch (error) {
      Alert.alert('Unable to load confirmations', error?.message || 'Try again shortly.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const respond = async (item, action) => {
    setBusyId(item.attemptId);
    try {
      await respondToCashPaymentConfirmation({ requestId: item.requestId, attemptId: item.attemptId, action });
      await refresh();
      Alert.alert(action === 'confirm' ? 'Payment confirmed' : 'Payment not confirmed', action === 'confirm' ? 'The request is now marked paid.' : 'The request remains unpaid.');
    } catch (error) {
      Alert.alert('Confirmation not completed', error?.message || 'Check the current payment status.');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Screen title="Cash payment confirmations" description="Confirm only payments you personally received from the customer.">
      <Card>
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Cash includes physical cash, EFT and direct bank transfer. A customer report alone does not settle payment.
        </Text>
        <ActionButton label={loading ? 'Refreshing…' : 'Refresh'} tone="secondary" disabled={loading} onPress={refresh} />
      </Card>
      {loading && !items.length ? <Card><EmptyState title="Loading confirmations" description="Checking completed requests assigned to you." /></Card> : null}
      {!loading && !items.length ? <Card><EmptyState title="No pending confirmations" description="When a customer reports paying you directly, the request will appear here." /></Card> : null}
      {items.map((item) => (
        <Card key={item.attemptId}>
          <View style={{ gap: 5 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '900' }}>{item.service || 'Completed service'}</Text>
            <Text style={{ color: colors.muted }}>Request {item.requestReference}</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '900' }}>{money(item.amount)}</Text>
            <Text style={{ color: colors.muted, lineHeight: 19 }}>Confirm only if this amount reached you. Confirming records the customer payment; it does not initiate a transfer to you.</Text>
          </View>
          <ActionButton label={busyId === item.attemptId ? 'Saving…' : 'Yes, I received it'} disabled={Boolean(busyId)} onPress={() => respond(item, 'confirm')} />
          <ActionButton label="No, I have not received it" tone="secondary" disabled={Boolean(busyId)} onPress={() => respond(item, 'reject')} />
        </Card>
      ))}
      <ActionButton label="Back" tone="secondary" onPress={() => goBack?.('Services')} />
    </Screen>
  );
}
