import { useState } from 'react';
import { setDefaultPaymentMethod, removePaymentMethod } from '../../services/paymentMethodService';
import { initializeCardAuthorization, verifyCardAuthorization } from '../../services/paystackService';
import { syncStudentGrowth } from '../../services/studentGrowthService';

export default function PaymentMethodsManager({ user, setUser, onMessage }) {
  const [isAuthorizingCard, setIsAuthorizingCard] = useState(false);

  const setMessage = (message) => {
    if (onMessage) {
      onMessage(message);
    }
  };

  const syncGrowthState = async () => {
    const syncedProfile = await syncStudentGrowth().catch(() => null);
    if (!syncedProfile) return;
    setUser((prev) => ({ ...prev, ...syncedProfile }));
  };

  const addCard = async () => {
    setIsAuthorizingCard(true);

    try {
      await initializeCardAuthorization({
        email: user.email,
        onSuccess: async (response) => {
          try {
            const result = await verifyCardAuthorization(response.reference, { userId: user.uid });
            setUser((prev) => {
              const existingMethods = Array.isArray(prev?.paymentMethods) ? prev.paymentMethods : [];
              const alreadyExists = existingMethods.some((method) => method.id === result.card.id);
              return {
                ...prev,
                paymentMethods: alreadyExists ? existingMethods : [...existingMethods, result.card],
              };
            });
            await syncGrowthState();

            setMessage(
              result.refunded
                ? `Card ending in ${result.card.last4} added successfully. Your R1 authorization has been refunded.`
                : result.refundMessage || `Card ending in ${result.card.last4} was added. Refund is still processing.`,
            );
          } catch (error) {
            setMessage(error.message || 'We could not verify and save this card. Please try again.');
          } finally {
            setIsAuthorizingCard(false);
          }
        },
        onClose: () => {
          setMessage('Card authorization cancelled.');
          setIsAuthorizingCard(false);
        },
      });
    } catch (error) {
      setMessage(`Failed to initialize payment: ${error.message}`);
      setIsAuthorizingCard(false);
    }
  };

  const handleSetDefault = async (cardId) => {
    const next = await setDefaultPaymentMethod(user, cardId);
    setUser((prev) => ({ ...prev, ...next }));
    await syncGrowthState();
    setMessage('Primary card updated.');
  };

  const handleRemoveCard = async (cardId) => {
    const next = await removePaymentMethod(user, cardId);
    setUser((prev) => ({ ...prev, ...next }));
    await syncGrowthState();
    setMessage('Card removed.');
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={addCard}
        disabled={isAuthorizingCard}
        className="rounded-2xl bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isAuthorizingCard ? 'Authorizing card…' : 'Add a Card'}
      </button>
      <p className="text-sm text-zinc-600">We charge R1 to securely authorize your card, then immediately refund it after verification.</p>

      {!user?.paymentMethods?.length ? <p className="text-sm text-zinc-500">No cards added yet.</p> : null}
      <div className="space-y-2">
        {(user?.paymentMethods || []).map((card) => (
          <div key={card.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">{card.nickname}</p>
              <p className="text-xs text-zinc-600">
                {card.brand} •••• {card.last4}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleSetDefault(card.id)}
                className="rounded-xl border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700"
              >
                {card.isDefault ? 'Primary' : 'Set Primary'}
              </button>
              <button
                type="button"
                onClick={() => handleRemoveCard(card.id)}
                className="rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-600"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
