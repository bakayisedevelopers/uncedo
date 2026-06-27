import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ActionButton, Card, EmptyState, SectionHeading } from '../../components/app/HelperUi';
import { useHelpersApp } from '../../context/HelpersAppContext';
import { formatCurrency } from '../../utils/payouts';
import { colors } from '../../theme/colors';

export function JobOffersScreen({ goBack }) {
  const { jobOffers, actions } = useHelpersApp();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.wrap} showsVerticalScrollIndicator={false}>
      <Pressable accessibilityRole="button" onPress={() => goBack('Services')} style={styles.backRow}>
        <Ionicons color={colors.brandDark} name="chevron-back" size={18} />
        <Text style={styles.backText}>Back to services</Text>
      </Pressable>

      <View style={styles.header}>
        <Text style={styles.title}>Job offers</Text>
        <Text style={styles.copy}>Incoming helper offers follow the same accept or decline rhythm as the live overlay.</Text>
      </View>

      <Card>
        <SectionHeading
          title="Offer queue"
          subtitle="Review payout estimate, customer brief, service fit, and requested skills before accepting."
        />
        {!jobOffers.length ? (
          <EmptyState title="No queued offers" description="Go online on the home screen to receive new helper offers." />
        ) : (
          jobOffers.map((offer) => {
            const secondsLeft = Math.max(0, Math.ceil((offer.offerExpiresAt - now) / 1000));
            return (
              <View key={offer.id} style={styles.offerCard}>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerCopy}>{offer.description}</Text>
                <Text style={styles.offerMeta}>Customer: {offer.customerName}</Text>
                <Text style={styles.offerMeta}>Area: {offer.area}</Text>
                <Text style={styles.offerMeta}>Skills: {(offer.requestedSkills || []).join(', ')}</Text>
                <Text style={styles.offerAmount}>{`${formatCurrency(offer.payoutEstimate)} | ${secondsLeft}s remaining`}</Text>
                <View style={styles.buttonRow}>
                  <ActionButton label="Accept offer" onPress={() => actions.acceptOffer(offer.id)} />
                  <ActionButton label="Decline" tone="secondary" onPress={() => actions.declineOffer(offer.id)} />
                </View>
              </View>
            );
          })
        )}
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
  offerCard: {
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  offerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
  offerCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  offerMeta: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  offerAmount: {
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: '900',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});
