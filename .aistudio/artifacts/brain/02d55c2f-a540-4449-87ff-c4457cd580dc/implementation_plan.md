# Advanced Service Questions, Multiplier Pricing, Conditional Gating & WhatsApp Visual Carousel Integration

## Overview & Core Concept

This implementation plan covers the enhancement of the Uncedo service catalog and WhatsApp intake system to support:
1. **Advanced Option Pricing**: Support both additive (`adder`) and proportional (`multiplier`) pricing models on service question options.
2. **Conditional Question & Option Gating**: Rule-based dependencies where specific questions or options are filtered, enabled, or excluded based on prior customer answers (e.g., hiding hair dye options if "chiscope" is selected).
3. **Visual Image Attachments**: Enabling image attachments on service options (such as haircut styles: fade, brush cut, chiscope) in the Admin app.
4. **WhatsApp Intake Enhancements**:
   - Rendering visual options as interactive WhatsApp carousel cards with images and action buttons.
   - Using WhatsApp list menus when option sets are large or numerous.

---

## 1. Overview & Core Concept

- **What It Does**: Empowers administrators to configure rich service questions with conditional dependencies, multiplier pricing, and visual image references. Dynamically adapts WhatsApp service discovery and intake prompts into interactive carousels (for visual choices) or list menus (for large option lists).
- **Target Audience / Persona**: Admin operators configuring service catalogs, and customers booking services via WhatsApp.
- **Key Value**: Delivers accurate dynamic pricing, eliminates incompatible service selections (e.g., dyeing a chiscope), and provides a polished visual shopping experience on WhatsApp.

---

## 2. User Experience & Visual Design

- **Admin App (Web)**:
  - Service Details & Question Editor: Enhanced UI to toggle pricing type (`adder` vs `multiplier`), specify factor/value, set conditional dependency rules (e.g., "depends on question X option Y"), and upload/attach option images.
- **WhatsApp Bot / Intake Flow**:
  - Carousel Presentation: Sends rich interactive card templates with image headers, titles, descriptions, and action buttons (`Request`, `View Details`) when questions have picture enablement.
  - List Menu Presentation: Sends interactive list messages when options exceed standard button limits (e.g., >3 options without images).

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Rule-Based Gating Schema**
  - *Chosen Approach*: Store dependency rules (`dependsOnQuestionId`, `matchingOptionId`, `excludeOptionIds`) directly on question/option metadata in Firestore.
  - *Why*: Allows flexible client-side and backend evaluation during WhatsApp intent routing and intake step generation without complex rule engines.
- **Decision 2: Multiplier Pricing Execution**
  - *Chosen Approach*: Evaluate base price first, apply all selected additive modifiers (`adder`), and then apply the selected multiplier factor (e.g., `total = (base + adders) * multiplier`).
  - *Why*: Mathematically robust and matches standard quoting conventions.

---

## 4. Technical Architecture & Data Strategy

```
┌─────────────────────────┐
│     Admin App (React)   │
│  - Question Builder     │
│  - Multiplier / Gating  │
│  - Image Attachments    │
└────────────┬────────────┘
             │ Saves config
             ▼
┌─────────────────────────┐
│  Firestore / Catalog    │
│  - services / questions │
│  - options & rules      │
└────────────┬────────────┘
             │ Evaluates rules & pricing
             ▼
┌─────────────────────────┐
│  WhatsApp Cloud Engine  │
│  - Carousel Cards       │
│  - List Menus           │
│  - Conditional Intake   │
└─────────────────────────┘
```

- **Data Model Updates**:
  - `option`: `{ id, label, price, pricingType: 'adder'|'multiplier', factor: 1.0, imageUrl: '' }`
  - `question`: `{ id, prompt, options: [...], dependencyRule?: { questionId: string, allowedOptionIds?: string[], excludedOptionIds?: string[] } }`
- **Execution Strategy**: No code has been modified yet; this plan awaits review and approval before execution and deployment.
