# Revised Implementation Plan - WhatsApp Interactive Service Discovery & Sales Flow

## Overview
This revised plan details the implementation for robust WhatsApp service exploration. It introduces a dual-tool architecture: an internal reasoning tool (`getAvailableServices`) and an interactive outbound carousel tool (`sendServicesToUser`), alongside enhanced service details retrieval (`getServiceDetails`), price estimation, helper availability checks, and conversation history service context caching.

---

## Detailed Architecture & Components

### 1. Tool Registry Updates (`functions/whatsapp/toolRegistry.js`)
We will define and register two separate service tools:
- **`getAvailableServices` (Internal Retrieval / Reasoning)**:
  - **Purpose**: Used by the AI internally to query the full service catalogue (IDs, names, categories, descriptions) for reasoning without sending raw text blocks to the user.
  - **Roles**: `guest`, `customer`, `helper`.
  - **Output Schema**: Array of service summaries.
- **`sendServicesToUser` (Interactive Outbound Action)**:
  - **Purpose**: Triggered when the user asks to see available services. Executes a backend function that fetches published services from Firestore, extracts the primary image (`images[0].uri` or fallback), name, and description, and constructs a WhatsApp **Carousel Message** via the Meta API.
  - **Parameters**: `category` (optional filter).
  - **Carousel Structure**:
    - Horizontal swappable cards (up to 10 items).
    - Header: Image link (first picture).
    - Body: Service name, category, and short description.
    - Buttons: 
      1. **"Book"** (Quick reply ID: `wa_book_svc_<serviceId>`)
      2. **"Details"** (Quick reply ID: `wa_details_svc_<serviceId>`)
  - **Roles**: `guest`, `customer`, `helper`.
- **`getServiceDetails` (Detailed Lookup & Pricing)**:
  - **Purpose**: Triggered when a user requests details on a specific service (or clicks "Details"). Requires `serviceId`.
  - **Backend Action**: 
    - Queries the service catalog and questionnaire options (e.g., specific hairstyles, cuts, cleaning extras).
    - Extracts configured pricing (`priceRange.minimumTotal` to `maximumTotal`).
    - Checks helper availability (counts active providers offering this service).
  - **Output**: Natural language response with price range estimation, options breakdown, helper status, and a call-to-action button to book.

### 2. Conversation Memory & Context Optimization (`functions/whatsapp/conversationMemory.js` / `agentLoop.js`)
- **Recent Service ID Caching**:
  - Store `lastViewedServiceId` and recent service query results in the conversation session state.
  - When a user sends a follow-up message (e.g., "How much are braids?"), the AI prompt and context builder inject the `lastViewedServiceId`, allowing the AI to call `getServiceDetails` immediately without re-listing all services.

### 3. WhatsApp Interactive Messaging (`functions/whatsapp/metaClient.js` & `servicePresentation.js`)
- Extend `metaClient.js` to support sending interactive carousel messages (`type: 'carousel'`) containing media headers and reply buttons.
- Use `buildWhatsAppServiceCarousel` from `servicePresentation.js` to format the carousel payload according to Meta Cloud API specifications.

### 4. Unit Testing (`functions/whatsapp/toolRegistry.test.js`)
- Add unit tests for:
  - `getAvailableServices` catalog retrieval.
  - `sendServicesToUser` carousel payload formatting and button structure.
  - `getServiceDetails` pricing range calculation and helper availability check.
  - Conversation memory state persistence of `lastViewedServiceId`.

---

## Step-by-Execution Flow

1. **User asks**: *"What services do you offer?"* or *"Show me hairstyles"*
2. **AI Action**: Calls `sendServicesToUser`.
3. **Backend Action**: Fetches services from Firestore, builds WhatsApp carousel payload with image, title, description, and "Book" / "Details" buttons, and sends via Meta Cloud API.
4. **User clicks**: *"Details"* on Barber Grooming.
5. **Webhook Handler**: Captures quick-reply `wa_details_svc_svc_barber`, sets `lastViewedServiceId = 'svc_barber'` in session state, and invokes `getServiceDetails` with `serviceId: 'svc_barber'`.
6. **Backend Action**: Fetches service questionnaire options, price range (`R150 - R300`), and active helper count.
7. **AI Response**: Formulates a sales-focused response explaining the options, estimated price, active helper availability, and offers a "Book Now" button.

---
