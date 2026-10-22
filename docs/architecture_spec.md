# Architecture Specification --- Food Business SaaS

**File:** `architecture_spec.md`\
**Version:** 1.0\
**Status:** Planning baseline for Step 1 --- Planning & Architecture
Setup\
**Primary vertical:** Food businesses\
**Last updated:** 2026-10-19

## 1. Purpose

Define the initial technical blueprint for a secure multi-tenant SaaS
product where one tenant-aware Gemini AI service powers both a website
chat widget and a WhatsApp chatbot.

The architecture is food-business-first and supports menu data,
deals/offers, business policies, order-related workflows, and future
optional booking/pre-order modules. It should be modular enough to
support other verticals later without making them part of the MVP.

## 2. Architecture Goals

1.  Strict isolation of tenant data, integrations, knowledge,
    conversations, and usage.
2.  One shared AI orchestration layer for all customer-facing channels.
3.  Structured business data for exact facts and consequential actions.
4.  A Hybrid RAG knowledge layer for FAQs, policies, and explanatory
    content.
5.  Separate adapters for Meta WhatsApp Cloud API and QR-based
    trial/session provider.
6.  Server-side secret encryption and safe credential workflows.
7.  Observable, retryable, and idempotent message/order processing.
8.  Deployability using Next.js 14 App Router, TypeScript, Tailwind CSS,
    Firebase, and Vercel-compatible workloads.

## 3. High-Level System Context

``` text
Customer
  |                         |
  v                         v
Website Chat Widget     WhatsApp Channel
  |                         |
  v                         v
Widget API Adapter      WhatsApp Webhook Adapter
  |                         |
  +------------+------------+
               |
               v
     Trusted Tenant Resolver
               |
               v
      Auth / Quota / Rate Limit
               |
               v
     Shared AI Orchestration Service
       |        |          |
       |        |          +--> Approved Tool Registry
       |        |                    |
       |        |                    +--> Menu / Offers / Orders / Bookings
       |        |
       |        +--> Hybrid Retrieval (tenant-filtered)
       |                    |
       |                    +--> Approved Knowledge Base
       |
       +--> Gemini SDK Service (server-only)
               |
               v
       Response Validation / Audit
               |
       +-------+-----------------+
       |                         |
       v                         v
 Website Widget Reply       WhatsApp Send Adapter

Shared platform services:
Firebase Auth | Firestore | Firebase Storage | Secret Encryption
Usage Metering | Audit Logs | Monitoring | Trial/Plan Enforcement
```

## 4. Technology Stack

  -----------------------------------------------------------------------
  Layer                   Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Web framework           Next.js 14 App Router   Dashboard, public
                                                  pages, widget
                                                  endpoints, Route
                                                  Handlers

  Language                TypeScript              Types, contracts,
                                                  server/client
                                                  separation

  Styling                 Tailwind CSS            Responsive UI

  Identity                Firebase Authentication User identity

  Operational database    Cloud Firestore         Tenants, memberships,
                                                  menu, offers, orders,
                                                  conversations, usage

  Media/documents         Firebase Storage        Business images and
                                                  private knowledge
                                                  documents

  AI provider             Gemini SDK              Server-side generation

  Retrieval               Tenant-filtered         Approved knowledge
                          keyword + semantic      search
                          retrieval as            
                          implemented             

  Hosting                 Vercel for compatible   Web app and
                          web workloads           request/response APIs

  Source control          GitHub                  Version control and CI

  Messaging               Meta Cloud API          WhatsApp ingress/egress
                          adapter + optional QR   
                          provider adapter        
  -----------------------------------------------------------------------

**Deployment note:** A QR provider that requires a persistent process,
long-lived socket, or session worker may not fit a short-lived Vercel
function. Validate the provider's runtime requirements. If needed, host
that adapter in a separate persistent service with authenticated
server-to-server communication. Do not assume Vercel can safely maintain
every WhatsApp session.

## 5. Core Architectural Decisions

### 5.1 One AI engine, multiple channel adapters

The widget and WhatsApp adapter normalize incoming messages into a
shared internal payload. Both call the same orchestration service.
Channel adapters are responsible for authentication/verification, tenant
resolution, message normalization, and response delivery---not their own
separate prompts or retrieval logic.

### 5.2 Structured records plus Hybrid RAG

Use structured queries for exact current facts: - Menu prices, variants,
modifiers, and item availability. - Active offers and offer
eligibility. - Business hours, delivery zones, fees, and minimum
order. - Order, payment, booking, and capacity states.

Use approved knowledge retrieval for: - FAQs. -
Delivery/pickup/cancellation policies. - Business descriptions. -
Service explanations and owner-approved informational documents.

Do not treat vector similarity as proof of live availability, price, or
transaction status.

### 5.3 Tenant resolution is trusted server-side behavior

-   Widget: resolve a public widget ID to a tenant configuration on the
    server; validate allowed origin/rate limits. Do not trust a freely
    supplied `tenantId`.
-   Meta Cloud API: map the verified business phone-number/account
    identifier to a tenant using server-side integration records.
-   QR provider: map a verified provider session/account reference to a
    tenant using protected integration records.
-   Dashboard: resolve tenant from authenticated user membership and
    requested workspace, then authorize access.

### 5.4 Server-authoritative actions

Order totals, discounts, availability, delivery eligibility, booking
capacity, payment status, and consequential status transitions must be
calculated or verified by server-side domain services. AI tool calls are
requests to these services, not authority to bypass them.

## 6. Firestore Data Model

The following is a conceptual schema. Choose either nested tenant
subcollections or top-level collections with a mandatory `tenantId`
consistently; do not mix patterns casually. The preferred private-data
model is tenant-scoped subcollections, with selected global collections
for user identity and platform administration.

### 6.1 Preferred logical structure

``` text
users/{userId}
  # Global identity/profile fields only; no tenant-private data

tenants/{tenantId}
  profile/main
  settings/general
  settings/ai
  settings/publicWidget
  settings/delivery
  settings/payments
  trial/main
  usage/current

  members/{userId}
  branches/{branchId}

  menuCategories/{categoryId}
  menuItems/{itemId}
  modifierGroups/{modifierGroupId}
  offers/{offerId}
  deliveryZones/{zoneId}

  knowledgeBase/{knowledgeDocumentId}
  knowledgeChunks/{chunkId}

  conversations/{conversationId}
    messages/{messageId}

  orders/{orderId}
  bookings/{bookingId}
  cateringRequests/{requestId}
  customers/{customerId}
  tasks/{taskId}
  payments/{paymentId}
  auditLogs/{eventId}

  integrations/{integrationId}
  apiKeys/{keyId}

platform/
  settings
  plans
  featureRegistry
  trialPolicies
  providerHealth
```

If existing project conventions require top-level collections such as
`Tenants`, `Users`, `KnowledgeBase`, `ChatLogs`, and `ApiKeys`, each
tenant-owned record must include a validated `tenantId`, and every
server query must explicitly scope by it. The project should choose one
canonical naming convention and use it consistently; Firestore
collection names are case-sensitive.

### 6.2 `Tenants`

Suggested fields: - `tenantId` - `businessName` - `businessType` or
`businessTypes[]` - `status` (`active`, `suspended`,
`pendingDeletion`) - `ownerUserId` - `country` - `timezone` -
`currency` - `enabledModules[]` - `createdAt` - `updatedAt`

Do not place secrets or large knowledge content directly in the tenant
root document.

### 6.3 `Users` and tenant membership

`users/{userId}` stores global identity/profile information only. Tenant
roles belong in `tenants/{tenantId}/members/{userId}`: - `userId` -
`role` (`owner`, `admin`, `manager`, `orderStaff`, `knowledgeEditor`,
`readOnly`) - `status` - `invitedBy` - `createdAt` - `updatedAt`

A user can belong to more than one tenant, but membership in one tenant
grants no access to another.

### 6.4 `KnowledgeBase`

Suggested fields: - `documentId` - `tenantId` - `title` -
`contentReference` or extracted content - `category` (`faq`, `policy`,
`businessInfo`, `document`) - `language` - `branchId` (optional) -
`sourceType` - `sourceReference` - `status` (`draft`, `processing`,
`published`, `failed`, `archived`) - `version` - `effectiveAt` -
`reviewAt` - `createdBy` - `updatedBy` - `createdAt` - `updatedAt`

Knowledge chunks should retain `tenantId`, `documentId`, version,
language, status, source offsets/metadata, and any embedding/index
reference. Filter by tenant and publication state before content is
passed to the model. Menu prices and offers remain in structured
menu/offer records, not as the only copy in knowledge documents.

### 6.5 `ChatLogs` / conversations and messages

Prefer separate conversation and message records rather than an
unbounded message array in one document.

Conversation fields: - `conversationId` - `tenantId` - `channel` (`web`,
`whatsapp_meta`, `whatsapp_qr`) - `channelConversationId` -
`customerReference` (optional) - `status` (`open`, `waitingForHuman`,
`resolved`, `closed`) - `assignedTo` - `aiEnabled` - `lastMessageAt` -
`createdAt` - `updatedAt`

Message fields: - `messageId` - `tenantId` - `conversationId` -
`providerMessageId` (where available) - `direction` (`inbound`,
`outbound`) - `senderType` (`customer`, `assistant`, `staff`,
`system`) - `content` or protected content reference -
`processingStatus` - `deliveryStatus` - `sourceReferences[]` -
`toolActionReferences[]` - `createdAt`

Store only necessary personal data. Do not log API keys, authorization
headers, or unnecessary full addresses/payment details.

### 6.6 `ApiKeys` / integration credentials

Suggested record metadata: - `keyId` - `tenantId` (for tenant-managed
credentials) - `provider` (`gemini`, `meta_whatsapp`, `qr_provider`) -
`credentialType` - `ciphertext` - `nonceOrIv` - `authTag` if required by
the encryption format - `keyVersion` - `maskedHint` - `status`
(`active`, `invalid`, `revoked`, `deleted`) - `lastValidatedAt` -
`createdBy` - `createdAt` - `updatedAt`

The precise encryption envelope depends on the chosen library/KMS. Keep
encryption keys outside Firestore. Never save plaintext credentials.
Platform-owned QR trial credentials should be held in
platform-controlled server-side secret storage; do not expose shared
trial credentials to tenants. Tenant-specific session tokens, if they
must be persisted, must be encrypted and tenant-scoped.

### 6.7 Menu, offer, and order entities

**Menu item:** name, category, description, images, price/currency,
variants, modifier group IDs, availability, publication state, declared
ingredients/allergens if verified, version, timestamps.

**Offer:** type/value, eligible items/categories, minimum order,
schedule, validity dates, usage limits, stacking policy, status, terms,
timestamps.

**Order:** tenant, order number, customer reference, immutable
item/price snapshots, subtotal, discount, delivery fee, tax if
configured, total/currency, fulfilment type, payment status, order
status, idempotency reference, timestamps.

Store money in a documented decimal-safe representation (commonly
integer minor units plus currency). Do not trust prices or totals
supplied by the browser or model. Historical order snapshots must not
change when the current menu changes.

## 7. Tenant Isolation and Firestore Security

1.  Deny by default in Firestore Security Rules.
2.  Dashboard access requires authenticated identity plus current tenant
    membership/role.
3.  Server routes using Firebase Admin SDK must authorize independently
    because Admin SDK bypasses Security Rules.
4.  Every tenant-owned query must use an explicit tenant scope. With
    nested paths, the path itself provides a boundary, but authorization
    is still required.
5.  Public menu/widget endpoints return only intentionally public
    published fields.
6.  Knowledge retrieval filters tenant, status, branch, language, and
    applicable dates before returning candidates.
7.  Storage paths should be tenant-scoped, with private documents
    inaccessible to the public.
8.  Cache keys must include tenant and relevant configuration/version
    context.
9.  Background jobs and exports must preserve the same tenant scope.
10. Add automated cross-tenant tests for read, write, update, delete,
    search, retrieval, file access, AI tools, and channel mapping.

## 8. Unified Gemini AI Engine

### 8.1 Internal normalized message contract

``` ts
export type Channel = "web" | "whatsapp_meta" | "whatsapp_qr";

export interface InboundMessage {
  eventId: string;
  channel: Channel;
  tenantId: string; // populated only after trusted server-side resolution
  conversationId: string;
  externalConversationId?: string;
  externalMessageId?: string;
  customerReference?: string;
  text: string;
  receivedAt: string;
  metadata?: Record<string, unknown>; // validated allowlisted fields only
}

export interface OutboundMessage {
  tenantId: string;
  channel: Channel;
  conversationId: string;
  text: string;
  correlationId: string;
  sourceReferences?: string[];
}
```

Do not accept `tenantId` from an untrusted client and immediately trust
it. Adapters must resolve and authorize the tenant before constructing
the internal message. Validate `metadata`; do not forward arbitrary
provider payloads into prompts.

### 8.2 Suggested service boundaries

``` text
src/server/ai/
  orchestrator.ts
  gemini-client.ts
  prompt-builder.ts
  context-builder.ts
  retrieval/
    hybrid-search.ts
    structured-context.ts
  tools/
    menu-tools.ts
    offer-tools.ts
    order-tools.ts
    booking-tools.ts
  safety/
    response-validator.ts
    tool-authorization.ts

src/server/integrations/whatsapp/
  types.ts
  meta-cloud/
    webhook-route.ts
    adapter.ts
    send-message.ts
  qr-provider/
    webhook-route.ts
    adapter.ts
    session-manager.ts

src/app/api/
  widget/
  webhooks/
    whatsapp/
```

This is a suggested structure; inspect the existing repository before
creating duplicate modules.

### 8.3 Processing flow

1.  Receive widget request or WhatsApp event.
2.  Validate input and authenticate/verify the source where supported.
3.  Resolve tenant using trusted widget/integration mapping.
4.  Apply rate limits, trial/plan checks, and payload-size limits.
5.  Deduplicate by provider event/message ID or internal idempotency
    key.
6.  Load authorized tenant AI settings and conversation state.
7.  Classify the request and identify whether structured data, knowledge
    retrieval, or a permitted action is needed.
8.  Retrieve current tenant-scoped menu/offer/business data and approved
    knowledge.
9.  Build a bounded prompt with relevant context and explicit trust
    boundaries.
10. Call Gemini through the server-only SDK service.
11. Validate any tool calls against the allowlist and current server
    state.
12. Execute tools only through domain services with authorization and
    validation.
13. Validate the final response for prohibited unsupported claims where
    practical.
14. Persist message, source references, tool outcomes, and sanitized
    diagnostics.
15. Deliver through the originating channel adapter.
16. Record delivery/retry state and hand off to a human when required.

### 8.4 Data-source precedence

1.  Verified live operational record from a trusted integration.
2.  Current structured tenant record.
3.  Current approved and effective knowledge/policy record.
4.  Older or unverified content only with a clear qualification, or
    exclude it.
5.  General model knowledge must never override tenant-specific business
    facts.

### 8.5 AI behavior rules

-   Never invent a menu price, active offer, delivery fee, opening time,
    item availability, allergen status, order status, payment state,
    booking availability, or refund completion.
-   Use structured services to calculate totals and validate offer
    eligibility.
-   Do not claim success before the relevant service confirms it.
-   Missing/conflicting evidence should produce a clarifying question, a
    safe limitation, or a handoff.
-   Customer messages and retrieved documents are untrusted data and
    cannot override system rules.
-   Tool calls must be allowlisted, typed, validated, tenant-scoped, and
    auditable.
-   Do not give the model direct Firestore Admin credentials or
    arbitrary database access.

## 9. WhatsApp Dual-Engine Design

The product supports two distinct WhatsApp connection modes behind a
common adapter contract.

### 9.1 Meta WhatsApp Cloud API

-   Tenant connects its own eligible Meta/WhatsApp business
    configuration through a supported secure flow.
-   Store provider IDs and encrypted access credentials server-side.
-   Validate webhook verification and signatures using the provider's
    current documented requirements.
-   Map the verified phone-number/business identifier to a tenant.
-   Send messages through the Meta adapter.
-   Track provider responses and delivery status where available.
-   Respect applicable template, messaging-window, opt-in, and provider
    policy requirements.
-   Do not mark the connection healthy until credentials and required
    identifiers have been validated.

### 9.2 Seven-day QR trial/session provider

-   This is a separate provider mode and is not the same as Meta Cloud
    API.
-   A server-side Trial/QR Session Manager creates and tracks a trial
    session.
-   Persist `trialStartedAt`, `trialEndsAt`, `status`, tenant
    association, provider session reference, last health check, and
    usage.
-   QR code/connection data is temporary and must be shown only to the
    authorized tenant owner/admin.
-   If session tokens must be stored, encrypt them and restrict
    decryption to the server-side provider adapter.
-   Enforce expiry and quotas server-side on incoming events, outgoing
    messages, and relevant API calls.
-   Browser clock changes or direct API requests must not extend the
    trial.
-   Handle QR expiry, disconnect, reconnect, provider outage, duplicate
    webhook events, and expired trial states.
-   Do not expose a shared platform provider API key to tenant browsers
    or store it as a tenant-owned key.
-   Before production use, validate provider terms, reliability, session
    persistence, webhook security, and WhatsApp policy compatibility.

### 9.3 Shared adapter interface

``` ts
export interface WhatsAppAdapter {
  verifyInboundEvent(request: Request): Promise<boolean>;
  normalizeInboundEvent(request: Request): Promise<InboundMessage[]>;
  sendText(input: {
    tenantId: string;
    recipient: string;
    text: string;
    idempotencyKey: string;
  }): Promise<{ providerMessageId?: string; accepted: boolean }>;
  getConnectionStatus(tenantId: string): Promise<{
    status: "connected" | "disconnected" | "pending" | "expired" | "error";
    checkedAt: string;
  }>;
}
```

The interface is illustrative; provider-specific requirements may
require separate verification/normalization signatures. Do not weaken
authentication to force both providers into an identical implementation.

## 10. Settings Screen and API-Key Workflow

### 10.1 Settings sections

-   Business profile and operating hours.
-   Menu and public page settings.
-   AI agent settings.
-   Knowledge base.
-   Website widget.
-   WhatsApp connection.
-   Delivery/pickup settings.
-   Team and roles.
-   Trial, usage, and plan.
-   Privacy/data management.

### 10.2 Gemini key workflow

1.  Authorized owner/admin opens AI settings.
2.  UI explains why the key is needed and how it is used.
3.  User submits the key over HTTPS to a protected server endpoint.
4.  Server validates session, tenant membership, role, payload, and rate
    limit.
5.  Server tests the key with a minimal safe provider request where
    supported.
6.  Server encrypts the credential using an approved server-side
    encryption mechanism.
7.  Ciphertext and safe metadata are stored in the tenant's `apiKeys`
    path.
8.  API returns only success/failure and a masked hint.
9.  UI never receives the saved plaintext key again.
10. Replacement and deletion follow the same authorization and audit
    requirements.

If validation fails, do not silently activate the credential. Show a
safe actionable error without exposing the provider's raw response or
the key.

### 10.3 Meta Cloud API workflow

1.  Owner/admin selects Connect WhatsApp.
2.  Use the chosen supported Meta authorization/onboarding flow; do not
    invent a fake connection flow.
3.  Validate required business/phone identifiers and webhook setup.
4.  Encrypt and store tenant-owned access tokens server-side.
5.  Map the verified phone-number/account ID to the tenant.
6.  Show a connection state based on actual validation.
7.  Support token rotation/revocation and safe disconnect.
8.  Verify webhook authenticity and deduplicate inbound messages.

### 10.4 QR trial workflow

1.  Eligible tenant starts the seven-day trial.
2.  Server creates a provider session and stores trial timestamps/state.
3.  Authorized UI receives only the QR/session information required to
    connect.
4.  Server monitors connection status and enforces quotas/expiry.
5.  On expiry, stop trial messaging and show upgrade/reconnect guidance.
6.  Do not delete unrelated tenant data automatically; apply the
    documented retention policy.

### 10.5 Credential status fields

Expose only safe status such as `not_configured`, `pending_validation`,
`connected`, `invalid`, `disconnected`, `expired`, or `error`. Never
return ciphertext, nonce, auth tag, raw token, or decrypted key to a
browser.

## 11. Public Website Widget

-   Each tenant has a public widget identifier mapped to server-side
    configuration.
-   Allow only published business data in public responses.
-   Apply allowed-origin configuration where practical; do not treat
    origin checks as the only security control.
-   Apply rate limits, payload limits, spam protection, and usage
    quotas.
-   Resolve tenant from widget mapping rather than arbitrary client
    input.
-   The widget may start a conversation but must not expose private
    order history or dashboard APIs.
-   Customer order lookup, if supported, needs a secure verification
    mechanism.
-   Widget and WhatsApp use the same orchestration, retrieval, tool
    registry, and safety policy.

## 12. API Route Responsibilities

Illustrative route groups: - `/api/widget/session` --- validate widget
configuration and create/continue public conversation. -
`/api/widget/message` --- validate, rate-limit, resolve tenant, and call
shared AI orchestration. - `/api/webhooks/whatsapp/meta` --- verify and
normalize Meta events. - `/api/webhooks/whatsapp/qr` --- verify and
normalize QR-provider events. - `/api/settings/ai-key` --- secure
credential create/replace/delete. - `/api/settings/whatsapp` --- start,
validate, disconnect, or inspect authorized tenant connection. -
`/api/menu/*` --- authorized menu CRUD. - `/api/offers/*` --- authorized
offer CRUD and deterministic eligibility. - `/api/orders/*` ---
validated order operations. - `/api/bookings/*` --- optional
booking/pre-order operations.

Route names are suggestions. Follow existing repository conventions.
Each route should be thin: validate input, authenticate/resolve tenant,
authorize, call a service, and return a safe response.

## 13. Reliability, Idempotency, and State

-   Use provider message/event IDs for inbound deduplication where
    available.
-   Use idempotency keys for order creation, consequential tool actions,
    and payment callbacks.
-   Store processing states so a retry can resume safely.
-   Retry transient failures with bounded backoff; do not retry invalid
    credentials indefinitely.
-   Separate "accepted by provider" from "delivered" when provider
    semantics distinguish them.
-   Separate order status from payment status.
-   Separate booking request received from booking confirmed.
-   Never turn an uncertain timeout into a success claim.
-   If the order is written but notification delivery fails, retry the
    notification rather than creating a second order.

## 14. Security and Privacy Controls

-   Server-side authorization for every private operation.
-   Firestore Security Rules deny by default.
-   Server Admin SDK code performs independent authorization.
-   Encrypt credentials using application-level encryption/KMS;
    encryption keys stay outside Firestore.
-   No secrets in browser bundles, URLs, logs, source control, or
    analytics.
-   Tenant-filtered retrieval, storage, caching, exports, background
    tasks, and tools.
-   Webhook verification, replay/deduplication controls, input
    validation, and rate limits.
-   Upload validation and SSRF protection if URL ingestion is
    implemented.
-   Minimize personal data in AI prompts and logs.
-   Define data retention, export, and deletion workflows.
-   Test prompt injection and attempts to retrieve another tenant's
    data.
-   Treat missing allergen/ingredient data as unknown; never invent
    safety guarantees.

## 15. Observability and Metrics

Track: - Widget and WhatsApp inbound/outbound counts. - Time to first
response and full completion latency. - Gemini latency, quota errors,
and failures. - Retrieval latency, empty retrieval, stale content, and
index errors. - Tool calls, validation failures, and action outcomes. -
Duplicate webhook/order prevention. - Provider connection health and
disconnects. - Trial usage/expiry and quota enforcement. - Authorization
denials and suspected cross-tenant attempts. - Handoff rate and
unanswered-question categories.

Logs must be sanitized. Never log plaintext credentials, authorization
headers, or unnecessary customer information.

## 16. Testing and Release Gates

### Required test categories

-   Unit: tenant resolver, authorization, price calculations, offer
    eligibility, state transitions, encryption wrapper.
-   Integration: Firestore, Storage, Gemini, Meta adapter, QR adapter,
    retrieval/index updates.
-   Security: cross-tenant read/write/search/retrieval, role escalation,
    secret leakage, public endpoint abuse.
-   End-to-end: onboarding, menu publication, widget chat, WhatsApp
    inbound/outbound, key setup, trial expiry.
-   Failure: duplicate webhooks, timeout, quota exhaustion, disconnected
    session, invalid key, failed order write, failed notification.
-   AI evaluation: factual grounding, abstention, tool permissions,
    Urdu/Roman Urdu/English, prompt injection.

### Release blockers

-   Any confirmed cross-tenant data leakage.
-   Plaintext credentials stored or exposed.
-   Client or model controls final price/discount without server
    validation.
-   AI falsely claims an order, booking, payment, or refund is
    successful.
-   Duplicate order/action from retried requests.
-   Unverified webhook triggers a consequential action.
-   Trial expiry can be bypassed by changing client time.
-   Draft/archived knowledge is returned as current public information.
-   Private order/customer information is exposed through the public
    widget.

## 17. Deployment and Environment Strategy

-   Maintain separate development, preview/staging, and production
    Firebase projects/configuration where practical.
-   Use separate provider credentials and webhook secrets per
    environment.
-   Keep server-only environment variables out of client bundles.
-   Commit a complete `.env.example` with placeholders.
-   Validate required configuration at startup/deployment.
-   Run type-check, lint, tests, and build in CI.
-   Use protected branches and reviewed pull requests.
-   Apply database/index/rule changes through reviewed, versioned
    deployment steps.
-   Confirm whether QR provider sessions require a separate persistent
    service before production deployment.
-   Do not claim a live integration until a real end-to-end test
    succeeds.

## 18. Open Architecture Decisions

Resolve before production: 1. Which QR-based WhatsApp provider is being
used, and does its policy/runtime support the intended deployment? 2.
Will the provider require a persistent session worker outside Vercel? 3.
Which secret manager/KMS or server-side encryption key-management
approach will be used? 4. Which Gemini model and quota strategy are
selected? 5. Which keyword/semantic retrieval implementation is
selected? 6. What are the seven-day trial's exact activation event,
message limits, expiry behavior, and retention rules? 7. Which order
states and auto/manual confirmation rules launch first? 8. Which payment
methods are enabled in the MVP? 9. What customer-message retention and
deletion policy applies? 10. Is RTL dashboard UI required for the first
release, or only Urdu/Roman Urdu content?

## 19. Recommended Build Sequence

1.  Repository audit, environment separation, lint/type-check/build.
2.  Firebase Auth, tenant creation, membership, and server
    authorization.
3.  Firestore rules, tenant-scoped repository pattern, and cross-tenant
    tests.
4.  Business profile and food-business onboarding.
5.  Menu/products/offers as structured records.
6.  Knowledge base and tenant-filtered retrieval.
7.  Shared Gemini orchestration and AI evaluation harness.
8.  Website widget adapter.
9.  Meta Cloud API adapter and/or separately validated QR trial adapter.
10. Secure settings screen and encrypted credential workflow.
11. Conversation history, handoff, usage tracking, and monitoring.
12. Public ordering/booking modules after the foundational security and
    data model pass release gates.

**Architecture invariant:** Every channel resolves to a trusted tenant,
every retrieval/tool operation is tenant-scoped and authorized,
structured records govern exact business facts, and both website and
WhatsApp call the same shared AI orchestration service.
