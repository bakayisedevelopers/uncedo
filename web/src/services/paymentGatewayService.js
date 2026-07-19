export async function chargeCard({ amount, card }) {
  if (!card) {
    return {
      ok: false,
      status: 'failed',
      reason: 'no_card_selected',
      transactionId: null,
    };
  }

  // In production, this would make an API call to your backend
  // which would then use the Paystack API to charge the card using the authorization code
  const shouldDecline = card.paystackAuthorizationCode?.toLowerCase().includes('decline') ||
                       card.paystackAuthorizationCode?.toLowerCase().includes('fail');

  if (shouldDecline) {
    return {
      ok: false,
      status: 'failed',
      reason: 'gateway_declined',
      transactionId: null,
    };
  }

  return {
    ok: true,
    status: 'paid',
    provider: 'paystack',
    amount,
    transactionId: `paystack_txn_${crypto.randomUUID().slice(0, 12)}`,
  };
}

export async function fundWalletWithCard({ amount, card }) {
  return chargeCard({ amount, card });
}
