# Uncedo Codebase Guide

This codebase is structured as a monorepo containing a Firebase Cloud Functions backend, two Expo-based React Native mobile applications (`uncedo` and `helpers`), a React+Vite web dashboard, and shared configurations.

Use the mapping below to find files, logic, and concepts when asked to modify or debug the codebase.

---

## 1. Firebase Cloud Functions Backend (`/functions`)
* **Common References**: "Firebase backend", "functions backend", "cloud functions", "API functions".
* **Purpose**: Houses all server-side logic, third-party integrations (Paystack, Resend, Gemini), and secure endpoints.
* **Key Files & Logic**:
  * [functions/index.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/index.js): Main entry point declaring all Cloud Functions.
  * [functions/pricingEngine.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/pricingEngine.js): Core logic for estimation, price quotes, and billing snapshots.
  * [functions/customerServiceAi.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/customerServiceAi.js): LLM processing logic for automated customer service threads.
  * [functions/aiSubjectExtraction.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/aiSubjectExtraction.js): Processes files/images to detect subject areas.
  * [functions/legalAgreements.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/functions/legalAgreements.js): Database interactions and templates for tutor/provider service contracts.

---

## 2. Uncedo Student / Customer Mobile App (`/uncedo`)
* **Common References**: "Student app", "Student mobile app", "Uncedo app", "Customer app", "Student/customer mobile client".
* **Purpose**: An Expo React Native application designed for students and customers to book requests, receive AI assistance, view active track maps, and join WebRTC classroom sessions.
* **Key Folders & Screens (`/uncedo/src/screens/`)**:
  * **Student Surfaces (`screens/student/`)**:
    * [DashboardScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/DashboardScreen.js): Home dashboard featuring request composer, quick suggestions, and navigation drawer access.
    * [RequestStatusScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/RequestStatusScreen.js): Student/class request status summary screen for non-service request flows.
    * [SessionRoomScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/SessionRoomScreen.js): Full-screen bare classroom interface hosting WebView-backed WebRTC audio and tutor screen-sharing view.
    * [WalletScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/student/WalletScreen.js): Shows balance, outstanding debt, and integration with the Paystack WebView credit card addition flow.
  * **Customer Surfaces (`screens/customer/`)**:
    * [CustomerServiceCallScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/CustomerServiceCallScreen.js): Core customer chat screen (formerly support voice call).
    * [ServiceRequestTrackingScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/screens/customer/ServiceRequestTrackingScreen.js): Full-screen customer tracking surface with route-based helper travel display, compact bottom sheet status, ETA, wait timer, and cancellation controls.
* **Key Client Services (`/uncedo/src/services/`)**:
  * [nearbyHelpersMapService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/nearbyHelpersMapService.js): Interfaces helper geolocation mapping.
  * [paystackService.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/uncedo/src/services/paystackService.js): Connects client to custom `/verify-paystack` functions.

---

## 3. Helpers / Providers Mobile App (`/helpers`)
* **Common References**: "Helper app", "Helper mobile app", "Provider app", "Service provider application".
* **Purpose**: An Expo React Native application designed for helpers (tutors or technicians) to accept job offers, track routing, set availability, and manage earnings.
* **Key Screens (`/helpers/src/screens/provider/`)**:
  * [ProviderDashboardScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/ProviderDashboardScreen.js): Dashboard with available job feed, active job alerts, and toggle switches for online/offline status.
  * [ActiveJobScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/ActiveJobScreen.js): Full-screen helper active job surface with route-based navigation, travel state actions (`driving`, `buying_resources`, `arrived`, `work_started`), wait timer handling, external maps handoff, and billing completion proof capture.
  * [EarningsScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/EarningsScreen.js): Financial summaries, payouts, and historical log charts.
  * [JobDetailsScreen.js](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/helpers/src/screens/provider/JobDetailsScreen.js): Information overlay for offers, showing client names, locations, and attachment summaries.

---

## 4. Uncedo Web App (`/web`)
* **Common References**: "Web dashboard", "tutor web portal", "Uncedo website", "admin panel".
* **Purpose**: Vite + React web interface containing marketing landing pages, tutor portal (WebRTC transmitter, tldraw whiteboard implementation), and administrative configuration dashboards.
* **Key Pages (`/web/src/pages/`)**:
  * [SessionRoomPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/web/src/pages/app/SessionRoomPage.jsx): Full classroom view embedding WebRTC voice broadcasting and the complete tldraw board canvas.
  * [OnboardingPage.jsx](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/web/src/pages/app/OnboardingPage.jsx): Registration wizard capturing credentials and pricing setups.

---

## 5. Releases Repository Directory (`/releases`)
* **Common References**: "Releases folder", "Android release location".
* **Purpose**: Houses the output APKs that are pushed to GitHub for mobile device installs.
* **Key Files**:
  * [releases/android/uncedo-release.apk](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/releases/android/uncedo-release.apk): Compiled installer for Uncedo.
  * [releases/android/helpers-release.apk](file:///C:/Users/Jabu%20Babb/Documents/Code/Uncedo/releases/android/helpers-release.apk): Compiled installer for Helpers.
