# Uncedo Service Request Implementation Plan

This document breaks the work into two phases:

1. Customer app (`uncedo`)
2. Helper app (`helpers`)

The goal is to move from placeholder customer request entry and placeholder helper skills into a shared, category-driven marketplace model where:

- categories define the pricing engine boundary
- services live inside categories
- each service can define its own pricing parameters
- customers request one category at a time, with one or more services inside that category
- helpers declare categories and skills they can perform
- helper skills require proof images
- helper skills are only matchable after verification

## Core Domain Model

### 1. Category

A category is the top-level service family and owns the pricing engine.

Initial categories to support:

- `cleaning`
- `yard_maintenance`
- `beauty`
- `barber`
- `care`
- `car_wash`

### 2. Service

A service belongs to one category. A customer request can contain multiple services, but only within one category for the initial release.

Initial service grouping:

#### Cleaning

- dishwashing
- house cleaning
- room cleaning
- kitchen cleaning
- bathroom cleaning
- floor cleaning
- event cleanup
- laundry
- ironing
- folding
- stain treatment

#### Yard Maintenance

- grass cutting
- gardening
- landscaping
- tree trimming
- tree cutting
- hedge trimming
- weeding
- planting flowers
- planting trees
- yard tidy-up

#### Beauty

- hairstyles
- braiding
- makeup
- lashes
- nails
- manicure
- pedicure
- waxing prep

#### Barber

- haircut
- beard trim
- line-up
- shave
- hair dye

#### Care

- babysitting
- pet sitting
- pet feeding
- house sitting
- elder companionship

#### Car Wash

- exterior wash
- interior cleaning
- seat cleaning
- full body wash
- engine cleaning
- full detailing

### 3. Skill

On the helper side, a service is expressed as a skill offering.

Examples:

- category: `beauty`
- service: `lashes`
- helper skill: `Classic lashes`, `Volume lashes`, `Hybrid lashes`

For the first implementation, the helper app can start with service-level skills if sub-skill granularity is too early. The model should still allow deeper specialization later.

### 4. Pricing Engine

Each category has one pricing engine.

Each pricing engine accepts:

- shared request context
- service selection
- service parameters
- duration estimate
- optional quantity and complexity inputs

Each service can define its own pricing parameters inside the category engine. These can begin as constants and placeholders.

Example pattern:

- category engine: `beautyPricingEngine`
- service config: `lashes`
- parameters:
  - `basePrice`
  - `durationMinutes`
  - `complexityMultiplier`
  - `materialsIncluded`

## Shared Design Rules

### Request scope rule

Initial customer release rule:

- one request = one category
- one request may include multiple services inside that category

Examples:

- valid: `beauty` + `lashes`, `makeup`, `hairstyles`
- valid: `cleaning` + `dishwashing`, `kitchen cleaning`
- invalid for initial release: `beauty` + `house cleaning`

### Matching rule

A helper can only be matched if:

- the helper has the requested category
- the helper has the requested service or compatible skill
- the helper service proof is uploaded
- the helper service is verified or approved

### Verification rule

Helper services should move through a verification lifecycle:

- `pending`
- `under_review`
- `verified`
- `rejected`

Unverified helper skills may be saved in profile state, but they should not be used for matching.

## Phase 1: Customer App (`uncedo`)

This phase is split into two parts.

## Phase 1A: Category and Pricing Foundation

Goal:

- replace scattered placeholder category lists with a shared category and service taxonomy
- align customer-facing service structure with future helper matching
- make pricing engine ownership category-based

### Step 1. Introduce shared category schema

Create a customer-facing service catalog structure in `uncedo` that defines:

- category id
- category label
- category description
- pricing engine id
- services under the category
- each service's prompt labels
- each service's placeholder pricing parameters
- whether the service typically needs image selection later
- whether the service is sensitive and needs extra verification

Suggested shape:

```js
{
  id: 'beauty',
  label: 'Beauty',
  pricingEngine: 'beauty',
  services: [
    {
      id: 'lashes',
      label: 'Lashes',
      pricing: {
        basePrice: 0,
        durationMinutes: 90,
        complexityMultiplier: 1.05,
      },
      requiresPortfolioSelection: true,
    }
  ]
}
```

### Step 2. Replace the current placeholder customer category constants

Refactor the current customer constants so the app no longer relies on:

- flat placeholder suggestion text only
- orphaned MVP category arrays
- category names that do not reflect the intended grouped design

Replace with:

- category catalog
- services per category
- customer suggestion prompts generated from real services

### Step 3. Align category naming

Rename and regroup:

- move laundry under `cleaning`
- replace `gardening` category with `yard_maintenance`
- keep `barber` separate from `beauty`
- add `care`
- add `car_wash`

### Step 4. Rebuild pricing engines around categories

Replace or refactor the current pricing engine files so they represent category engines, not isolated service buckets.

Expected engines:

- `cleaningPricingEngine`
- `yardMaintenancePricingEngine`
- `beautyPricingEngine`
- `barberPricingEngine`
- `carePricingEngine`
- `carWashPricingEngine`

Each engine should:

- accept a selected service list
- read service-specific parameters
- produce a placeholder quote structure
- support later extension into dynamic pricing

### Step 5. Add service parameter placeholders

For each service, add placeholder parameters such as:

- base callout
- default duration
- complexity multiplier
- quantity multiplier
- materials included flag
- fixed price vs time-based price mode

This step is mainly structural. Real pricing logic can remain simple at first.

### Step 6. Define the request payload contract

Before wiring AI, define the request payload shape the customer flow will eventually submit.

Suggested payload fields:

- `categoryId`
- `serviceIds`
- `summary`
- `conversationTranscript`
- `structuredAnswers`
- `selectedPortfolioReferences`
- `attachments`
- `pricingSnapshot`
- `location`
- `serviceAddress`
- `safetyFlags`

This is necessary so the AI flow does not invent a payload later that the helper side cannot consume.

## Phase 1B: AI Conversation Request Flow

Goal:

- replace the expanding text composer with a call-first request flow
- collect category, services, and request details conversationally
- preserve a phone-call-like experience

### Step 1. Keep the home map and small bottom composer footprint

On `CustomerHomeScreen`:

- keep the map
- keep the bottom anchored surface
- stop expanding the bottom sheet height
- replace the large text-driven interaction with a single primary CTA

Primary CTA concept:

- `Call for help`
- phone icon
- optionally a smaller secondary entry later for text fallback

### Step 2. Add a dedicated AI call screen

Create a new full-screen request experience that looks like a live call, similar to a phone or WhatsApp call layout.

This screen should support:

- connection state
- mute / end / speaker controls
- live transcript area
- AI guidance text
- dynamic selection panel shown during the call
- optional image picker when triggered by the AI flow

### Step 3. Use Gemini 2.5 Flash live conversation

Wire the conversation screen to Gemini live APIs for:

- voice input
- voice output
- structured extraction
- real-time follow-up questioning

The system prompt should make the AI do one job:

- determine category
- determine one or more services within that category
- gather enough details for matching and quote preparation

### Step 4. Add structured conversation state

The live call screen should maintain structured state while the call is happening.

Suggested tracked fields:

- detected category
- detected services
- missing required fields
- user preferences
- request urgency
- duration estimate
- location/service address
- required image or portfolio selection state
- transcript

### Step 5. Trigger visual selection only when needed

The call UI should stay phone-call-first, but when the AI determines a visual selection is needed, show a selection module inside the call screen.

Examples:

- nails: show helper work images
- hairstyles: show style examples from helper profiles
- lashes: show helper lash examples

Rules:

- only show selections for the currently active category
- only show portfolio items from verified helper skills
- allow the user to reject and continue the conversation

### Step 6. Add category guardrails

The AI flow should enforce:

- one category per request
- multiple services allowed only inside that category

If a user requests cross-category work:

- explain that separate bookings are needed for now
- either keep the current category
- or restart the classification for the chosen category

### Step 7. Produce a structured review object

At the end of the call, the AI should produce a normalized review object, not just free text.

The review object should include:

- category
- selected services
- summary
- collected answers
- selected examples
- estimated price
- missing warnings

### Step 8. Replace the placeholder thread screen path

The existing `JobRequestThreadScreen` is placeholder-only.

Plan:

- do not build the final flow on top of the current placeholder thread behavior
- either replace it with the AI call screen route
- or keep it only as a later post-request job thread after matching begins

Recommended direction:

- `CustomerHome` -> `AiCallRequestScreen`
- after structured request completion -> `RequestReviewScreen`
- after submit -> `RequestStatusScreen`

### Step 9. Connect to real request creation

Once the customer flow is structured, replace the current placeholder navigation-only behavior with real request submission.

The customer flow should submit into the real backend request pipeline, but with renamed and generalized request semantics instead of the student-class legacy naming.

This likely requires either:

- refactoring `classRequestService` into a general service request module
- or creating a new service request layer and migrating request screens to it

### Step 10. Preserve a fallback path

If live voice fails, allow:

- text transcript fallback
- manual text input
- continue conversation without dropping the request

This should be a secondary path, not the primary one.

## Phase 2: Helper App (`helpers`)

Goal:

- align helper service definitions with the customer taxonomy
- replace photo URL entry with actual image upload selection
- support verification status per service or skill
- make only verified offerings matchable

## Phase 2A: Shared Category and Skill Catalog

### Step 1. Replace the current helper catalog

The current helper catalog has:

- `laundry`
- `cleaning`
- `gardening`
- `beauty`

It should be replaced with the new shared category structure:

- `cleaning`
- `yard_maintenance`
- `beauty`
- `barber`
- `care`
- `car_wash`

Laundry should become services under `cleaning`.

### Step 2. Define helper-facing skill structures

Each helper category should contain:

- services
- helper skills or specializations
- proof requirements
- verification status

Suggested model:

```js
{
  categoryId: 'beauty',
  serviceId: 'lashes',
  skillId: 'classic_lashes',
  pictures: [],
  verificationStatus: 'pending'
}
```

### Step 3. Keep helper terminology explicit

Use:

- customer side: `category` and `service`
- helper side: `category`, `service`, and `skill`

That keeps the mental model clear:

- the customer requests services
- the helper offers skills

## Phase 2B: Helper Service Selection and Proof Upload

### Step 1. Replace URL input with local image upload

The current `ServicesOfferedScreen` asks for a pasted image URL.

This should be replaced with:

- image picker from device
- support for multiple images per skill
- preview gallery
- remove image action

### Step 2. Allow multi-category and multi-skill setup

Helpers should be able to:

- activate multiple categories
- activate multiple services inside each category
- attach multiple skills under those services
- upload multiple proof images per skill

### Step 3. Add pending verification state

When a helper adds a new skill or service proof:

- save it immediately
- mark it `pending` by default
- do not expose it for customer matching yet

### Step 4. Add verification metadata fields

For later admin use, add fields such as:

- `verificationStatus`
- `verifiedAt`
- `verifiedBy`
- `verificationNotes`
- `referenceChecks`
- `safetyFlags`

### Step 5. Mark sensitive categories

Categories like `care` need stricter treatment.

For these, require additional helper metadata later:

- references
- police clearance
- interview status
- internal admin approval

This can begin as schema support and UI badges before full admin tools are built.

## Phase 2C: Matching Alignment

### Step 1. Build compatibility between customer requests and helper skills

A request should carry:

- category
- services
- optional style references or portfolio selections

A helper profile should expose:

- verified categories
- verified services
- verified skills
- proof images

Matching should only compare against verified helper offerings.

### Step 2. Prepare customer-facing portfolio sourcing

For services like:

- nails
- hairstyles
- lashes
- makeup

the customer should eventually browse from verified helper proof images rather than external images.

That means helper image storage should be planned as reusable marketplace media, not just profile decoration.

## Implementation Order

Recommended execution order:

1. Create shared category and service schema for `uncedo` and `helpers`
2. Refactor pricing engines around categories
3. Update helper catalog to match customer categories
4. Replace helper photo URL flow with image upload and gallery support
5. Add verification status fields to helper service records
6. Replace customer home composer with `Call for help` entry
7. Build AI live call request screen
8. Build structured extraction and category/service collection
9. Add request review screen
10. Submit into real request storage and status tracking
11. Match only against verified helper offerings

## Immediate Build Scope

If we keep the first coding pass tight, the best first slice is:

### Customer app

- add shared category and service catalog
- refactor pricing engines to category ownership
- replace home composer CTA with `Call for help`
- create the new AI call screen shell

### Helper app

- replace current helper catalog with the new categories
- replace URL photo input with image upload
- add verification status to saved skills

## Deferred Items

These should be planned but not required in the first pass:

- full admin verification console
- multi-category booking in one request
- advanced dynamic pricing formulas
- reference collection workflows
- sensitive-category onboarding documents
- customer browsing of helper proof galleries before request finalization

## Notes About Existing Code

### Customer app

Current reality:

- `CustomerHomeScreen` is still a placeholder entry surface
- `JobRequestThreadScreen` is still placeholder conversation UI
- the actual backend request creation still lives in the older request flow

Implication:

- the new customer flow should not keep building on placeholder thread logic
- it should replace that entry path with the AI request flow and then connect into real request creation

### Helper app

Current reality:

- helper categories already exist in `serviceCatalog`
- helper profile already stores `services -> skills -> pictures`
- onboarding already requires at least one skill with a photo
- photo collection is currently URL-based

Implication:

- the helper-side data shape is a usable foundation
- the biggest immediate changes are taxonomy alignment, upload method, and verification state
