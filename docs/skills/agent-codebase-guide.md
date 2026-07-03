# Uncedo Codebase Guide

This codebase is structured as a monorepo containing a Firebase Cloud Functions backend, two Expo-based React Native mobile applications (`uncedo` and `helpers`), one public React+Vite website (`web`), one React+Vite admin application (`admin`), and shared configurations.

Use the mapping below to find files, logic, and concepts when asked to modify or debug the codebase.

---

## 1. Firebase Cloud Functions Backend (`/functions`)
* **Common References**: "Firebase backend", "functions backend", "cloud functions", "API functions".
* **Purpose**: Houses server-side logic for customer service-request orchestration, secure payment and email integrations, customer recommendations, and helper payout automation, while helper agreement acceptance/publishing, admin-triggered request reconciliation nudges, and customer-side cancellation state writes now run client-side against shared Firebase data.
* **Key Files & Logic**:
  * [functions/index.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js): Main entry point declaring the retained Cloud Functions for service-request matching, secure service billing and cancellation-charge calculation, customer recommendation event aggregation, email delivery, and weekly helper payout automation.
  * [functions/pricingEngine.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/pricingEngine.js): Core logic for estimation, price quotes, and billing snapshots.
  * [functions/serviceMarketplacePricing.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/serviceMarketplacePricing.js): Dynamic marketplace pricing engine for live services and bundle-style services stored in `serviceCatalog`.
  * [functions/legalAgreements.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/legalAgreements.js): Database interactions, version publishing, and signed-record generation for helper agreements.
  * [functions/helperLegalAgreements.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/helperLegalAgreements.js): Helper-agreement versioning, immutable acceptance records, and signed PDF generation used by the admin and helper apps.

---

## 2. Uncedo Student / Customer Mobile App (`/uncedo`)
* **Common References**: "Student app", "Student mobile app", "Uncedo app", "Customer app", "Student/customer mobile client".
* **Purpose**: An Expo React Native application designed for customers to book requests, complete guided intake flows, view active track maps, and join WebRTC classroom sessions.
* **Key Folders & Screens (`/uncedo/src/screens/`)**:
  * **Student Surfaces (`screens/student/`)**:
    * [DashboardScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/DashboardScreen.js): Home dashboard featuring request composer, quick suggestions, and navigation drawer access.
    * [RequestStatusScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/RequestStatusScreen.js): Student/class request status summary screen for non-service request flows.
    * [SessionRoomScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/SessionRoomScreen.js): Full-screen bare classroom interface hosting WebView-backed WebRTC audio and tutor screen-sharing view.
    * [WalletScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/WalletScreen.js): Shows balance, outstanding debt, and integration with the Paystack WebView credit card addition flow.
  * **Customer Surfaces (`screens/customer/`)**:
    * [CustomerHomeScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerHomeScreen.js): Customer home surface with the randomized service discovery feed, full-catalog search overlay, helper-photo-backed quick access tiles, and the request CTA that now opens service browsing instead of the free-form chat composer.
    * [CustomerServiceSelectionScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerServiceSelectionScreen.js): Customer service review screen that shows the selected tile details, auto-adds the category to the customer profile when needed, collects required answers, calculates a client-side marketplace quote, and submits directly into helper matching and tracking.
    * [CustomerOnboardingScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerOnboardingScreen.js): Customer profile completion flow, including service-category preferences and payment setup.
    * [CustomerDetailsScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerDetailsScreen.js): Editable customer profile details with service-category preferences.
    * [ServiceRequestTrackingScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/ServiceRequestTrackingScreen.js): Full-screen customer tracking surface with route-based helper travel display, compact bottom sheet status, ETA, wait timer, and cancellation controls.
  * **Key Client Services (`/uncedo/src/services/`)**:
    * [nearbyHelpersMapService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/nearbyHelpersMapService.js): Interfaces helper geolocation mapping.
    * [paystackService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/paystackService.js): Connects client to custom `/verify-paystack` functions.
    * [customerServiceMediaService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerServiceMediaService.js): Summarizes uploaded customer reference media so images or videos can influence the structured service request flow.
    * [customerServiceDiscoveryService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerServiceDiscoveryService.js): Builds the randomized customer home service feed from admin-approved catalog items, online helpers, and their uploaded work photos.
    * [customerRecommendationService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerRecommendationService.js): Reads and writes customer recommendation profiles, records service events, and ranks the customer home feed from engagement history.
    * [serviceCatalogService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/serviceCatalogService.js): Reads the live Firestore service catalog for customer discovery, request matching, live bundle services, and dynamic intake-question hydration.
    * [liveTrackingRealtimeService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/liveTrackingRealtimeService.js): Realtime Database adapter for accepted service request tracking under `liveTracking/serviceRequests/{requestId}`.
    * [customerServiceRequestService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/customerServiceRequestService.js): Customer-side request creation, quote persistence, cancellation routing with direct Firestore/live-tracking mutation plus backend cancellation billing handoff, and direct Firestore service-request rating writes.
    * [helperRequestStatsService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/helperRequestStatsService.js): Client-side helper metrics recomputation used after customer-side cancellation flows now that helper request stats are no longer trigger-driven.
    * [scripts/node-with-production-env.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/scripts/node-with-production-env.js): Android Gradle Node wrapper that sets `NODE_ENV=production` for Expo release bundling while preserving normal development commands.
  * **Key Customer Components (`/uncedo/src/components/customer/`)**:
    * [ServiceShowcaseCarousel.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/components/customer/ServiceShowcaseCarousel.js): Pinterest-style masonry discovery feed for customer service tiles, using helper photos, lightweight card metadata, and fast service/package selection.
    * [ServiceSearchOverlay.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/components/customer/ServiceSearchOverlay.js): Search overlay for available service and package discovery on the customer home screen.
    * [ServiceCategoryPicker.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/components/customer/ServiceCategoryPicker.js): Multi-select category picker used in profile completion and customer details.
  * [src/components/customer/CustomerHomeMap.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/components/customer/CustomerHomeMap.js): Dedicated customer home map with a live location marker and native Google Maps rendering, separate from the route-tracking map.

---

## 3. Helpers / Providers Mobile App (`/helpers`)
* **Common References**: "Helper app", "Helper mobile app", "Service helper application".
* **Purpose**: An Expo React Native application designed for helpers to accept job offers, track routing, set availability, and manage earnings.
* **Key Screens (`/helpers/src/screens/provider/`)**:
  * [ProviderDashboardScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/ProviderDashboardScreen.js): Dashboard with available job feed, active job alerts, and toggle switches for online/offline status.
  * [ActiveJobScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/ActiveJobScreen.js): Full-screen helper active job surface with route-based navigation, travel state actions (`driving`, `buying_resources`, `arrived`, `work_started`), wait timer handling, external maps handoff, and billing completion proof capture.
  * [AgreementScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/AgreementScreen.js): Live helper agreement review and signing screen with full contract text, typed-name acceptance, and signed-version history.
  * [EarningsScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/EarningsScreen.js): Financial summaries, payouts, and historical log charts.
  * [JobDetailsScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/JobDetailsScreen.js): Information overlay for offers, showing client names, locations, and attachment summaries.
  * [SkillCatalogScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/SkillCatalogScreen.js): Firestore-backed helper service catalog browser that replaces the hard-coded service list and includes admin-created bundle services.
  * [SkillDetailsScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/SkillDetailsScreen.js): Helper service detail and submission flow with multi-image uploads, pending approval, bundle-image inheritance, and service-photo management.
  * [src/components/app/HelperHomeMap.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/components/app/HelperHomeMap.js): Dedicated helper home map with a live location marker and 50 km service radius, separate from the active-job route map.
  * [src/services/helperPayoutService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/helperPayoutService.js): Subscribes to backend `helperWeeklyPayouts` records so the helper wallet, weekly payment status, and payout history reflect scheduler-written payout states.
  * [src/services/liveTrackingRealtimeService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/liveTrackingRealtimeService.js): Realtime Database adapter for accepted-job map tracking, route snapshots, and terminal tracking status.
  * [src/services/legalAgreementService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/legalAgreementService.js): Reads helper-agreement documents directly from Firestore, records signed acceptances client-side, and uploads the helper acceptance PDF to Firebase Storage.
  * [src/services/helperRequestStatsService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/helperRequestStatsService.js): Client-side replacement for helper offer/stat tracking, including helper-offer notification records and helper metric rollups derived from service-request transitions.
  * [src/services/serviceRequestService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/serviceRequestService.js): Helper-side request offer acceptance/decline, live status changes, billing finalization handoff, and direct Firestore service-request rating writes.
  * [src/services/serviceCatalogService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/serviceCatalogService.js): Reads the live Firestore service catalog for helper browsing and onboarding.
  * [scripts/node-with-production-env.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/scripts/node-with-production-env.js): Android Gradle Node wrapper that sets `NODE_ENV=production` for Expo release bundling while preserving normal development commands.

---

## 4. Uncedo Web App (`/web`)
* **Common References**: "Website", "landing page", "privacy page", "terms page".
* **Purpose**: Vite + React public website containing the landing page plus legal pages only.
* **Key Pages (`/web/src/pages/`)**:
  * [LandingPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/web/src/pages/LandingPage.jsx): Public Uncedo marketing landing page.
  * [PrivacyPolicyPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/web/src/pages/PrivacyPolicyPage.jsx): Public privacy policy page.
  * [TermsPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/web/src/pages/TermsPage.jsx): Public terms of service page.

---

## 5. Uncedo Admin App (`/admin`)
* **Common References**: "Admin app", "admin console", "helper moderation panel", "service approval console".
* **Purpose**: Standalone Vite + React admin console for helper moderation, service approval, photo review, customer lookup, and authentication-bound operational control.
* **Key Files & Logic**:
  * [admin/src/App.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/App.jsx): Admin routing and protected layout wiring.
  * [admin/src/pages/HelperAgreementsPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/HelperAgreementsPage.jsx): Admin contract-management screen for publishing new helper agreement versions and reviewing history.
  * [admin/src/pages/ProvidersPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/ProvidersPage.jsx): Provider profile review, suspension, verification, and per-service-offering moderation.
  * [admin/src/pages/ServicesPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/ServicesPage.jsx): Firestore-backed service catalog management, custom service creation, pricing-input editing, admin image uploads, and helper approval queue.
  * [admin/src/pages/ServiceBulkImagesPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/ServiceBulkImagesPage.jsx): Bulk admin uploader that stages multiple images in local state, assigns each one to one or more services, uploads each file once to Firebase Storage, and reuses the same image reference across selected services.
  * [admin/src/pages/ServiceDetailsPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/ServiceDetailsPage.jsx): Dedicated service detail editor for pricing controls, live intake questions, bundle composition, uploaded images, and helper moderation entry points.
  * [admin/src/pages/CustomersPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/CustomersPage.jsx): Customer directory and stored location/profile data.
  * [admin/src/constants/serviceCatalog.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/constants/serviceCatalog.js): Admin catalog seed data used to render the live service list and helper-approval workflow.
  * [admin/src/services/helperAgreementService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/services/helperAgreementService.js): Admin-side client for reading and publishing helper agreement versions through Cloud Functions.
  * [admin/src/services/serviceCatalogService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/services/serviceCatalogService.js): Firestore service-catalog reads/writes plus Firebase Storage image upload/delete helpers for the admin services page, including post-save request-reconciliation nudges.
  * [admin/src/services/requestReconciliationService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/services/requestReconciliationService.js): Admin-side request-reconciliation helper that nudges active service requests after helper approval/removal or service-catalog mutations so matching can re-run without the removed scheduled backend reconciler.

---

## 6. Releases Repository Directory (`/releases`)
* **Common References**: "Releases folder", "Android release location".
* **Purpose**: Houses the output APKs that are pushed to GitHub for mobile device installs.
* **Key Files**:
  * [releases/android/uncedo-release.apk](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/releases/android/uncedo-release.apk): Compiled installer for Uncedo.
  * [releases/android/helpers-release.apk](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/releases/android/helpers-release.apk): Compiled installer for Helpers.


## Service offering model note

- Helper service applications are stored in `helperServices/{helperId}_{serviceId}` and use service/offering terminology. Backend matching builds `helperDispatchIndex/{helperId}` from `helperServices`, `users`, and `serviceCatalog`; do not reintroduce nested helper `services[].offerings` or legacy skill terminology for dispatch/admin moderation.
- `serviceCatalog/{serviceId}` uses `type` (`service`, `bundle`, or `package`) rather than `kind`; bundles/packages expand through `includedServiceIds`.
