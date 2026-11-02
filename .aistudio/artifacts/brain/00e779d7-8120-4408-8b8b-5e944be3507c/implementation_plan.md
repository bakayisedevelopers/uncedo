# Uncedo Pricing Engine Refinement, Integer Currency Rounding, WhatsApp Service Discovery & Deployment Plan

This implementation plan addresses pricing calculation accuracy, integer-only currency rounding across the entire app and payment gateways, WhatsApp intent routing for service discovery queries (returning carousels instead of booking), and final deployments of backend functions and admin hosting.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Pricing Accuracy**: Ensuring service quotes correctly incorporate base price, question adders, percentage multipliers, travel fees, and booking fees (fixed low pricing bugs where R800 services showed R50).
> - **Integer Currency Rounding**: All monetary values across calculations, quotes, summaries, and payment gateways (Paystack) will be rounded to whole integers (e.g. `R800`, not `R800.00` or decimals). Booking fee: 1% of base price, capped at R5, defaulting to a minimum of R1 if under R1.
> - **WhatsApp Service Discovery**: Queries like "what services does Uncedo offer" will trigger the service catalog carousel view (`buildWhatsAppServiceCarousel`) rather than incorrectly initiating a booking intake.
> - **Deployment**: Deploy updated Cloud Functions and build/deploy the admin frontend to Firebase Hosting.

---

## 1. Overview & Core Concept

- **What It Does**: Fixes pricing quote bugs, enforces strict integer-only currency representation everywhere, corrects WhatsApp intent handling for catalog browsing vs booking intake, and handles Firebase deployments.
- **Target Audience**: Uncedo customers using WhatsApp and admins managing the platform.
- **Key Value**: Accurate quotes, clean whole-number pricing with zero decimal discrepancies between quotes and payments, and reliable AI intent routing.

---

## 2. Technical Architecture & Implementation Details

### A. Pricing Engine & Integer Currency Rounding (`serviceMarketplacePricing.js` & related)
- **Quote Calculation**:
  - `computeMarketplaceQuote` and `createLeafQuote` will properly combine `basePrice`, question adders (`subtotalAdder`), and multipliers (`multiplier`).
  - Booking fee calculation: `Math.max(1, Math.min(5, Math.round(baseAmount * 0.01)))` (1% of base amount, capped at R5, minimum R1).
- **Integer Rounding**:
  - Replace `roundCurrency` with integer rounding (`Math.round(...)`) across all pricing, totals, line items, travel fees, and booking fees.
  - Ensure payment gateways (Paystack) receive the exact integer amount matching what was displayed to the user on WhatsApp.

### B. WhatsApp Service Discovery & Intent Routing (`aiIntentRouter.js`, `metaWebhook.js`, `servicePresentation.js`)
- **Intent Handling**:
  - When user asks "what services does Uncedo offer" or requests catalog/services list, route to catalog presentation (`buildWhatsAppServiceCarousel`) instead of starting service booking intake.
  - Ensure specific service queries return details and questionnaire context so the AI can answer accurately without prematurely locking into a booking flow.

### C. Build & Deployment Plan
- **Backend Functions**: Deploy updated Cloud Functions using `firebase deploy --only functions`.
- **Admin Frontend**: Build the admin web app (`npm --prefix admin run build`) and deploy to Firebase Hosting (`firebase deploy --only hosting`). Ensure `.env` build variables are bundled correctly.
