# Uncedo Codebase Guide

This codebase is structured as a monorepo containing a Firebase Cloud Functions backend, two Expo-based React Native mobile applications (`uncedo` and `helpers`), two React+Vite web applications (`web` and `admin`), and shared configurations.

Use the mapping below to find files, logic, and concepts when asked to modify or debug the codebase.

---

## 1. Firebase Cloud Functions Backend (`/functions`)
* **Common References**: "Firebase backend", "functions backend", "cloud functions", "API functions".
* **Purpose**: Houses all server-side logic, third-party integrations (Paystack, Resend, Gemini), and secure endpoints.
* **Key Files & Logic**:
  * [functions/index.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js): Main entry point declaring all Cloud Functions, including service-request matching, marketplace pricing quotes, billing completion, and customer recommendation event aggregation.
  * [functions/pricingEngine.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/pricingEngine.js): Core logic for estimation, price quotes, and billing snapshots.
  * [functions/serviceMarketplacePricing.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/serviceMarketplacePricing.js): Dynamic marketplace pricing engine for live services and bundle-style services stored in `serviceCatalog`.
  * [functions/customerServiceAi.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/customerServiceAi.js): LLM processing logic for automated customer service threads.
  * [functions/aiSubjectExtraction.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/aiSubjectExtraction.js): Processes files/images to detect subject areas.
  * [functions/legalAgreements.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/legalAgreements.js): Database interactions, version publishing, and signed-record generation for helper agreements.
  * [functions/helperLegalAgreements.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/helperLegalAgreements.js): Helper-agreement versioning, immutable acceptance records, and signed PDF generation used by the admin and helper apps.
  * [functions/index.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js): Main function registry for the backend HTTP, Firestore, and scheduler functions, including marketplace pricing, matching, billing, and recommendation aggregation.

---

## 2. Uncedo Student / Customer Mobile App (`/uncedo`)
* **Common References**: "Student app", "Student mobile app", "Uncedo app", "Customer app", "Student/customer mobile client".
* **Purpose**: An Expo React Native application designed for customers to book requests, receive AI assistance, view active track maps, and join WebRTC classroom sessions.
* **Key Folders & Screens (`/uncedo/src/screens/`)**:
  * **Student Surfaces (`screens/student/`)**:
    * [DashboardScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/DashboardScreen.js): Home dashboard featuring request composer, quick suggestions, and navigation drawer access.
    * [RequestStatusScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/RequestStatusScreen.js): Student/class request status summary screen for non-service request flows.
    * [SessionRoomScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/SessionRoomScreen.js): Full-screen bare classroom interface hosting WebView-backed WebRTC audio and tutor screen-sharing view.
    * [WalletScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/WalletScreen.js): Shows balance, outstanding debt, and integration with the Paystack WebView credit card addition flow.
  * **Customer Surfaces (`screens/customer/`)**:
    * [CustomerHomeScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerHomeScreen.js): Customer home surface with the randomized service discovery feed, full-catalog search overlay, helper-photo-backed quick access tiles, and the request CTA that now opens service browsing instead of the free-form chat composer.
    * [CustomerServiceSelectionScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerServiceSelectionScreen.js): Customer service review screen that shows the selected tile details, auto-adds the category to the customer profile when needed, collects required answers, calculates a backend marketplace quote, and submits directly into helper matching and tracking.
    * [CustomerServiceCallScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerServiceCallScreen.js): Core customer chat screen (formerly support voice call) that now seeds package selections into the AI intake flow.
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
  * [SkillCatalogScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/SkillCatalogScreen.js): Firestore-backed helper service catalog browser that replaces the hard-coded skill list and includes admin-created bundle services.
  * [SkillDetailsScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/SkillDetailsScreen.js): Helper service detail and submission flow with multi-image uploads, pending approval, bundle-image inheritance, and service-photo management.
  * [src/components/app/HelperHomeMap.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/components/app/HelperHomeMap.js): Dedicated helper home map with a live location marker and 50 km service radius, separate from the active-job route map.
  * [src/services/legalAgreementService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/legalAgreementService.js): Calls helper-agreement Cloud Functions to fetch the active contract bundle and submit signed acceptances.
  * [src/services/serviceCatalogService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/services/serviceCatalogService.js): Reads the live Firestore service catalog for helper browsing and onboarding.

---

## 4. Uncedo Web App (`/web`)
* **Common References**: "Web dashboard", "Uncedo website".
* **Purpose**: Vite + React web interface containing marketing landing pages and web flows.
* **Key Pages (`/web/src/pages/`)**:
  * [SessionRoomPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/web/src/pages/app/SessionRoomPage.jsx): Full classroom view embedding WebRTC voice broadcasting and the complete tldraw board canvas.
  * [OnboardingPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/web/src/pages/app/OnboardingPage.jsx): Registration wizard capturing credentials and pricing setups.

---

## 5. Uncedo Admin App (`/admin`)
* **Common References**: "Admin app", "admin console", "helper moderation panel", "service approval console".
* **Purpose**: Standalone Vite + React admin console for helper moderation, service approval, photo review, customer lookup, and authentication-bound operational control.
* **Key Files & Logic**:
  * [admin/src/App.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/App.jsx): Admin routing and protected layout wiring.
  * [admin/src/pages/HelperAgreementsPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/HelperAgreementsPage.jsx): Admin contract-management screen for publishing new helper agreement versions and reviewing history.
  * [admin/src/pages/ProvidersPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/ProvidersPage.jsx): Provider profile review, suspension, verification, and per-skill moderation.
  * [admin/src/pages/ServicesPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/ServicesPage.jsx): Firestore-backed service catalog management, custom service creation, pricing-input editing, admin image uploads, and helper approval queue.
  * [admin/src/pages/ServiceDetailsPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/ServiceDetailsPage.jsx): Dedicated service detail editor for pricing controls, live intake questions, bundle composition, uploaded images, and helper moderation entry points.
  * [admin/src/pages/CustomersPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/pages/CustomersPage.jsx): Customer directory and stored location/profile data.
  * [admin/src/constants/serviceCatalog.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/constants/serviceCatalog.js): Admin catalog seed data used to render the live service list and helper-approval workflow.
  * [admin/src/services/helperAgreementService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/services/helperAgreementService.js): Admin-side client for reading and publishing helper agreement versions through Cloud Functions.
  * [admin/src/services/serviceCatalogService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/admin/src/services/serviceCatalogService.js): Firestore service-catalog reads/writes plus Firebase Storage image upload/delete helpers for the admin services page.

---

## 6. Releases Repository Directory (`/releases`)
* **Common References**: "Releases folder", "Android release location".
* **Purpose**: Houses the output APKs that are pushed to GitHub for mobile device installs.
* **Key Files**:
  * [releases/android/uncedo-release.apk](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/releases/android/uncedo-release.apk): Compiled installer for Uncedo.
  * [releases/android/helpers-release.apk](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/releases/android/helpers-release.apk): Compiled installer for Helpers.
