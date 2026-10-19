# CLAUDE.md --- Repository Rules for AI Coding Sessions

**Project:** Food Business SaaS\
**Purpose:** Persistent instructions for AI coding assistants and
contributors\
**Status:** Required project guardrails

## 1. Read Before Coding

Before making changes: 1. Read `0_vision.md` and `architecture_spec.md`.
2. Inspect the existing repository structure, package scripts,
dependencies, and current implementation. 3. Identify the affected
feature, data paths, API routes, and tenant boundary. 4. Write a short
implementation plan for non-trivial changes. 5. Reuse established
patterns unless there is a clear, documented reason to change them. 6.
Do not assume a feature exists merely because it is described in a
document. Verify the code first.

If requirements conflict, prioritize security and data integrity first,
then this file, then `architecture_spec.md`, then feature-specific
requirements. Ask for clarification when a decision materially changes
scope or data behavior.

## 2. Product Scope

-   The MVP is for food businesses: restaurants, cafés, food stalls,
    bakeries, takeaway shops, cloud kitchens, home chefs, and catering
    businesses.
-   Keep the architecture modular for possible future verticals, but do
    not build travel, dental, or unrelated industry workflows unless
    explicitly requested.
-   Build the shared Gemini AI engine once. Website chat and WhatsApp
    are channel adapters, not separate AI implementations.
-   Structured records are authoritative for menu prices, variants,
    availability, offers, order status, payment status, and bookings.
-   Never make a UI claim that is not supported by actual backend
    behavior.

## 3. Required Tech Stack

-   **Framework:** Next.js 14 using App Router.
-   **Language:** TypeScript with strict mode enabled.
-   **Styling:** Tailwind CSS.
-   **Authentication:** Firebase Authentication.
-   **Database:** Cloud Firestore.
-   **File storage:** Firebase Storage where appropriate.
-   **AI provider:** Gemini SDK called from server-side code only.
-   **Hosting:** Vercel for compatible web workloads.
-   **Source control:** GitHub.
-   **WhatsApp:** Provider adapter supporting Meta WhatsApp Cloud API
    and, if approved, a separate QR-based trial/session provider.

Do not silently replace core technologies. If the repository uses a
different version or an approved migration changes the stack, document
the change first.

## 4. Multi-Tenancy and Authorization --- Mandatory

### 4.1 Tenant resolution

-   Every private record must belong to a known `tenantId`.
-   Resolve tenant identity from authenticated membership, a trusted
    server-side widget mapping, or a verified WhatsApp integration
    mapping.
-   Never trust a client-supplied `tenantId` as proof of access.
-   Public widget IDs and tenant slugs are identifiers, not
    authorization credentials.
-   Webhook phone-number/account identifiers must map to a tenant
    through trusted server-side configuration.

### 4.2 Queries and data access

-   Every tenant-owned database query must apply a strict tenant
    boundary.
-   For top-level collections, include an explicit `tenantId` filter and
    validate authorization before returning results.
-   Prefer tenant-scoped paths such as `tenants/{tenantId}/...` for
    private subcollections.
-   Never run an unscoped collection query and filter results in the
    frontend.
-   Every document read by ID must still verify that the document
    belongs to the authorized tenant.
-   Apply the same boundary to Firestore, Storage, search/vector
    retrieval, exports, background jobs, AI tools, cache keys, logs, and
    analytics.
-   Cross-tenant isolation tests are release blockers.

### 4.3 Server authorization

-   Every privileged Route Handler, Server Action, webhook action, and
    service method must validate identity/source, tenant membership or
    trusted integration mapping, role, input, and target-record scope.
-   Firebase Admin SDK bypasses Firestore Security Rules. Server-side
    code using Admin SDK must perform its own authorization checks.
-   Never rely on hiding a button or page in the UI as a security
    control.
-   Use least-privilege roles and deny access by default.

### 4.4 Firestore and Storage Security Rules

-   Deny access by default.
-   Allow client access only where explicitly required and covered by
    tests.
-   Protect private customer data, orders, conversations, documents,
    integration settings, and API-key records.
-   Validate tenant membership and permitted operations in rules where
    client access is enabled.
-   Public menu reads must expose only published, intentionally public
    fields.
-   Never make an entire tenant document or private subcollection
    publicly readable to support a widget.
-   Test rules using Firebase Emulator Suite or equivalent automated
    tests.

## 5. Secrets and API-Key Handling --- Mandatory

-   Gemini keys, Meta access tokens, webhook secrets, QR-provider
    credentials, session tokens, and other private credentials must
    never be returned to the browser after saving.
-   Never place secrets in `NEXT_PUBLIC_*` environment variables, HTML,
    client components, URLs, analytics events, or routine logs.
-   Do not commit `.env`, service-account JSON, tokens, or real
    credentials.
-   Encrypt tenant-managed secrets before storing them in Firestore
    using server-side application-level encryption or an approved
    KMS/envelope-encryption mechanism. The encryption master key must be
    stored outside Firestore in a protected server-side secret
    manager/environment configuration.
-   Use authenticated encryption (for example, AES-256-GCM through a
    vetted library), unique nonces/IVs, key versioning, and a documented
    rotation process. Do not invent custom cryptography.
-   Store metadata such as provider, masked display hint, validation
    status, key version, and timestamps separately from ciphertext.
-   Never log ciphertext alongside decryption keys, plaintext tokens, or
    authorization headers.
-   Only the server-side integration service may decrypt a secret, and
    only when needed for an authorized operation.
-   UI may show masked status such as `••••••abcd`, never the full saved
    key.
-   Support replace, revoke, and delete workflows. Deletion must remove
    or disable the usable credential and record a safe audit event.
-   Platform-owned QR trial credentials must remain platform-controlled.
    Do not expose shared platform credentials to tenants.
    Tenant-associated session identifiers/tokens, if persisted, must be
    encrypted and tenant-scoped.
-   Prefer a managed secret service when available. If a secure
    encryption key cannot be configured, fail closed rather than saving
    plaintext.

## 6. Coding Standards

### 6.1 Modularity

-   Keep components ideally below 200 lines and do not let UI components
    exceed 300 lines without a documented reason.
-   Split large files by responsibility; do not split code into
    meaningless fragments just to meet a line count.
-   Keep components focused on presentation and user interaction.
-   Put reusable business rules in service/domain modules, not
    duplicated across pages.

### 6.2 Separation of concerns

Use a clear separation between: - UI and reusable components. - App
Router pages/layouts. - API Route Handlers. - Authentication and tenant
authorization. - Data-access/repository modules. - Business rules
(orders, offers, menu, booking). - AI orchestration, prompts, retrieval,
and tool handlers. - WhatsApp channel adapters and provider clients. -
Secret encryption/decryption. - Validation schemas. - Shared types and
utilities.

Suggested structure (adapt to the repository rather than blindly
creating duplicates):

``` text
src/
  app/
    (dashboard)/
    (public)/
    api/
  components/
  features/
    tenants/
    menu/
    offers/
    orders/
    bookings/
    conversations/
    integrations/
  server/
    auth/
    tenancy/
    db/
    security/
    ai/
      prompts/
      retrieval/
      tools/
    integrations/
      whatsapp/
        meta-cloud/
        qr-provider/
    services/
  lib/
  types/
```

-   Do not call Gemini directly from a React client component.
-   Do not place business logic inside page components or webhook route
    files.
-   Route Handlers should validate, authorize, call a service, and
    return a safe response.

### 6.3 TypeScript and validation

-   Keep TypeScript strict mode enabled.
-   Avoid `any`; use explicit types, `unknown` plus validation, or
    well-defined discriminated unions.
-   Validate all external inputs server-side with a consistent schema
    library.
-   Treat browser input, webhook payloads, uploaded documents, and model
    outputs as untrusted.
-   Validate model-produced tool arguments before execution.
-   Use typed status enums/unions rather than arbitrary strings for
    consequential state.

### 6.4 Error handling

-   Use consistent safe error responses.
-   Do not expose stack traces, internal paths, provider credentials,
    raw provider responses, or private data to users.
-   Log a correlation/request ID and sanitized diagnostic context.
-   Retry only transient failures and use bounded exponential backoff
    with jitter where appropriate.
-   Use idempotency for order creation, webhook processing, payment
    callbacks, and other consequential operations.
-   Never report success before the backend/provider confirms success.

### 6.5 UI and accessibility

-   Build responsive layouts for mobile, tablet, and desktop.
-   Include loading, empty, success, failure, and retry states.
-   Use accessible labels, keyboard support, semantic controls, and
    adequate contrast.
-   Support English and Urdu/Roman Urdu content where configured.
    Consider RTL layout where Urdu UI is enabled.
-   Never use color alone to communicate order, payment, or connection
    state.

## 7. Environment Variables

A universal `.env.example` is mandatory and must be updated whenever
environment configuration changes.

Rules: - Commit `.env.example` with placeholder values only. - Keep
actual secrets in local ignored `.env.local` files or approved
deployment secret settings. - Document which variables are server-only
and which are safe for the browser. - Never prefix private credentials
with `NEXT_PUBLIC_`. - Validate required environment variables at server
startup or during deployment checks. - Keep development,
preview/staging, and production credentials separate.

Illustrative names (confirm actual SDK/configuration needs before
implementation):

``` dotenv
# Public app configuration — only values safe for browser exposure
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_FIREBASE_API_KEY=replace-with-public-firebase-web-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=replace-with-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=replace-with-project
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=replace-with-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=replace-with-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=replace-with-app-id

# Server-only configuration
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
GEMINI_DEFAULT_MODEL=
SECRET_ENCRYPTION_KEY=
SECRET_ENCRYPTION_KEY_VERSION=1
WHATSAPP_WEBHOOK_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
META_GRAPH_API_VERSION=
QR_PROVIDER_BASE_URL=
QR_PROVIDER_API_KEY=
```

Firebase web configuration is generally client configuration, but
authorization must never depend on its secrecy. Use the correct
deployment-specific Firebase Admin credential method. Do not assume the
illustrative list is complete or that every variable is required.

## 8. AI and Prompt Engineering Rules

-   Website chat and WhatsApp must use the same tenant-aware AI
    orchestration service.
-   Keep system instructions and prompt templates in a dedicated
    server-only AI directory.
-   Do not place secrets, another tenant's content, or unfiltered
    conversation history in prompts.
-   Retrieve only relevant approved knowledge and current structured
    records for the current tenant.
-   Use deterministic backend services for exact prices, offer
    eligibility, delivery fees, availability, order status, payment
    status, and booking capacity.
-   The model must not execute arbitrary SQL/Firestore queries,
    arbitrary code, or unapproved tools.
-   Every tool validates tenant scope, role, inputs, current state, and
    customer authorization.
-   Customer text, documents, URLs, and retrieved content are untrusted
    data; they cannot override system rules.
-   If information is missing or conflicting, the AI must ask, abstain,
    or hand off. It must not guess.
-   Never claim an order, booking, payment, cancellation, or refund
    succeeded without a verified backend result.
-   Record source references and tool results where feasible for
    debugging and evaluation, while minimizing personal data.

## 9. WhatsApp Integration Rules

-   Keep Meta Cloud API and QR-based provider implementations behind
    separate adapters with a common internal interface.
-   Do not treat a QR-based linked session as equivalent to the official
    Meta Cloud API.
-   Validate the chosen QR provider's terms, stability, authentication,
    webhook capabilities, and production suitability before enabling it.
-   Verify webhook signatures or equivalent authenticity checks where
    supported.
-   Deduplicate incoming events using provider message/event IDs.
-   Handle retries, out-of-order events, disconnected sessions, expired
    QR codes, rate limits, and provider outages.
-   Keep provider tokens and session secrets server-side and encrypted
    at rest.
-   A seven-day QR trial must have server-side start/end timestamps and
    quota checks; client-side timers are not sufficient.
-   Never allow a trial to extend by changing the browser clock or
    calling a hidden API directly.

## 10. Testing Requirements

For every feature, add relevant tests for: - Happy path and validation
errors. - Tenant A versus Tenant B access. - Role boundaries. -
Unauthorized/missing tenant mapping. - External provider
timeout/failure. - Duplicate request/webhook behavior. - Secret masking
and no-secret-leak checks. - Empty/loading/retry UI states. - AI
grounding, abstention, and tool authorization when AI is involved.

Release blockers: - Any confirmed cross-tenant data access. - Plaintext
secret storage or secret exposure. - Client-trusted price/discount
calculation. - Duplicate order creation from retries. - False success
messages for consequential actions. - Unverified webhook actions. -
Direct API access to disabled modules or unauthorized tenant records.

## 11. Developer Workflow

1.  Inspect existing code before editing.
2.  State the intended files and approach for substantial changes.
3.  Make the smallest coherent change that solves the task.
4.  Run relevant lint, type-check, unit, integration, and build scripts
    available in the repository.
5.  Report commands run and results accurately; do not claim tests
    passed if they were not run.
6.  Update documentation and `.env.example` when
    architecture/configuration changes.
7.  Do not silently delete working features, alter unrelated UI, or
    replace project conventions.
8.  Do not invent credentials, live integrations, completed deployments,
    or test results.
9.  When a dependency or external provider is not configured, clearly
    label the feature as unconfigured rather than simulating a
    successful connection.
10. Keep a concise summary of changed files, decisions, tests, and
    remaining risks at the end of a coding task.

## 12. Definition of Done

A change is done only when: - It matches the requested scope. - Inputs
are validated and authorization is enforced server-side. - Tenant
isolation is preserved across reads, writes, files, retrieval, logs, and
tools. - Loading, empty, success, failure, and retry states are handled
as relevant. - Secrets are not exposed or logged. - Relevant tests pass,
or unrun tests are explicitly disclosed. - Documentation and
`.env.example` are updated where needed. - No false claim of deployment,
integration, or success is made.
