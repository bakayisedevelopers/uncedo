import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function PaymentPricingPolicyPage() {
  return (
    <LegalPageShell
      title="Payment and Pricing Policy"
      updatedAt="June 6, 2026"
      intro="This policy explains how Parakleo prices sessions, authorizes cards, manages wallet balances, handles outstanding debt, and pays tutors. Amounts are shown in South African rand unless clearly stated otherwise."
      contact="billing@parakleo.app"
    >
      <LegalSection title="1. Session pricing">
        <p>
          Parakleo calculates a session quote using lesson duration, base amount, rate per minute, subject, time of day,
          demand, tutor availability, seasonal adjustments, discounts, free minutes, and other configuration values shown
          before the request is submitted. Quotes may expire or change if request details, availability, discounts, or
          pricing configuration changes before confirmation.
        </p>
      </LegalSection>

      <LegalSection title="2. Card authorization and wallet balance">
        <p>
          Students may be required to add a valid card before requesting a class. On supported flows, Parakleo may perform a
          small card authorization charge and then refund it after verification. Parakleo may authorize, charge, capture,
          reverse, or refund payments through a payment provider. Wallet funds may be used for future sessions. If a charge
          fails or a completed session is not fully paid, the unpaid amount may appear as an outstanding wallet balance that
          must be settled before further use.
        </p>
      </LegalSection>

      <LegalSection title="3. Fees and taxes">
        <p>
          Prices may include platform fees, payment processing costs, taxes, discounts, credits, and promotional
          adjustments where applicable. The current app configuration uses a 73% tutor payout share and a 27% platform fee
          on eligible completed sessions. Users are responsible for any taxes, bank charges, data costs, or device costs
          that apply to their own use of Parakleo.
        </p>
      </LegalSection>

      <LegalSection title="4. Tutor payouts">
        <p>
          Tutors earn the tutor share shown in the app for eligible completed sessions. Payouts may be grouped weekly and
          marked as unpaid, processing, paid, or adjusted by administrators. Parakleo may delay or withhold payouts for
          verification, suspected fraud, student disputes, chargebacks, incorrect banking details, unlawful activity, or
          policy violations.
        </p>
      </LegalSection>

      <LegalSection title="5. Payment provider handling">
        <p>
          Card entry and sensitive payment processing are handled by third-party payment providers. Parakleo stores only the
          payment metadata needed to operate the service, such as token references, card brand, last four digits,
          transaction IDs, authorization state, and charge outcome. Payment providers may apply their own terms, security
          standards, settlement rules, and compliance obligations.
        </p>
      </LegalSection>

      <LegalSection title="6. Changes">
        <p>
          Parakleo may update prices, fees, discounts, payout shares, supported payment methods, and billing rules from
          time to time. Material changes apply prospectively unless required immediately for legal, fraud, security,
          provider, or platform integrity reasons.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
