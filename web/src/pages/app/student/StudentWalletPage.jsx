import { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../../components/ui/PageHeader';
import SectionCard from '../../../components/ui/SectionCard';
import SelectField from '../../../components/ui/SelectField';
import { useAuth } from '../../../hooks/useAuth';
import { getOutstandingAmount, payOutstandingBalance } from '../../../services/walletService';
import PaymentMethodsManager from '../../../components/app/PaymentMethodsManager';

export default function StudentWalletPage() {
  const { user, setUser } = useAuth();
  const [cardId, setCardId] = useState(user?.paymentMethods?.find((card) => card.isDefault)?.id || user?.paymentMethods?.[0]?.id || '');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const walletBalance = Number(user?.wallet?.balance || 0);
  const outstanding = getOutstandingAmount(user?.wallet);

  const payOutstanding = async (event) => {
    event.preventDefault();
    setMessage('');

    try {
      setIsLoading(true);
      const result = await payOutstandingBalance({ user, cardId });

      setUser((prev) => ({ ...prev, ...result.profile }));
      setMessage(result.message || `Outstanding balance paid successfully. Txn: ${result.charge?.transactionId || 'confirmed'}`);
    } catch (error) {
      setMessage(error.message || 'Unable to pay the outstanding balance right now.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Payment" description="Manage payment cards and settle any outstanding Parakleo balance." />

      <SectionCard title="Outstanding balance">
        <p className={`text-3xl font-black ${walletBalance < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>R{walletBalance.toFixed(2)}</p>
        {outstanding > 0 ? (
          <p className="mt-2 text-sm text-amber-700">Outstanding amount owed to Parakleo: R{outstanding.toFixed(2)}.</p>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">No outstanding balance.</p>
        )}
      </SectionCard>

      {outstanding > 0 ? (
        <SectionCard title={`Pay outstanding amount of R${outstanding.toFixed(2)}`} subtitle="Charge your selected saved card and clear your Parakleo balance.">
          <form className="grid gap-4 md:grid-cols-2" onSubmit={payOutstanding}>
            <SelectField
              label="Payment Card"
              name="cardId"
              value={cardId}
              onChange={(event) => setCardId(event.target.value)}
              options={(user?.paymentMethods || []).map((card) => ({
                value: card.id,
                label: `${card.nickname.charAt(0).toUpperCase() + card.nickname.slice(1)} ${card.isDefault ? ' (Primary)' : ''}`,
              }))}
            />
            <div className="flex items-end">
              <button type="submit" disabled={isLoading || !cardId} className="rounded-2xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
                {isLoading ? 'Processing...' : 'Pay outstanding balance'}
              </button>
            </div>
            {message ? <p className="md:col-span-2 text-sm text-zinc-700">{message}</p> : null}
          </form>
        </SectionCard>
      ) : message ? (
        <p className="text-sm text-zinc-700">{message}</p>
      ) : null}

      <SectionCard title="Payment cards">
        <PaymentMethodsManager user={user} setUser={setUser} onMessage={setMessage} />
      </SectionCard>

      <SectionCard title="Payment policies" subtitle="Review billing, pricing, refund, and card handling terms.">
        <div className="flex flex-wrap gap-3 text-sm font-semibold">
          <Link to="/payment-pricing-policy" className="text-brand underline">Payment and Pricing Policy</Link>
          <Link to="/refund-policy" className="text-brand underline">Refund Policy</Link>
          <Link to="/privacy-policy" className="text-brand underline">Privacy Policy</Link>
        </div>
      </SectionCard>
    </div>
  );
}
