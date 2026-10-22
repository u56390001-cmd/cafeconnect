# CafeConnect — AI & WhatsApp Implementation Audit

**Scope:** inspection of the existing repository only. **No code was modified** to produce this report.
**Method:** read-through of every AI, WhatsApp, order, tenancy, security and API module, plus read-only probes against the deployed production app (chat latency, webhook signature handling, stored document shapes).
**Secrets:** only environment variable **names** are referenced. No keys, tokens, customer phone numbers or personal data appear here.
**Unverifiable items are explicitly marked `UNKNOWN`.**

---

## 1. Project Architecture

### 1.1 Tech stack (verified from `package.json`, `tsconfig.json`, `next.config.mjs`)

| Layer | Technology |
|---|---|
| Framework | Next.js 14.2.35 (App Router), React 18, TypeScript 5.5 with `strict: true` |
| UI | Tailwind CSS + shadcn-style primitives in `src/components/ui/*` (button, card, badge, input, select, switch, sheet, field, table, alert, empty, toggle-group, skeleton, checkbox, radio-group, textarea, separator) |
| Auth | Firebase Authentication (client SDK 10, email/password + Google popup); server verification with `firebase-admin` 12 |
| Database | Cloud Firestore, accessed **only** through `firebase-admin` on the server |
| AI | **Gemini REST API** `v1beta` (`generateContent`, `streamGenerateContent?alt=sse`). The npm SDK `@google/generative-ai` is still in `package.json` but the AI path no longer imports it (see §2.1) |
| WhatsApp | Two adapters: QR-session provider (`whatsapp.qasimhussain.com`) and Meta Cloud API (Graph API) |
| Hosting | Vercel, git-connected auto-deploy. `vercel.json`: `framework: nextjs`, `regions: ["iad1"]`, one daily cron |
| Serverless helper | `@vercel/functions` → `waitUntil` for post-response background work |
| Secret storage | AES-256-GCM application-level encryption (`src/lib/security/encryption.ts`), master key from env |
| Tooling | `next lint` + `next build`. **No test runner, no test files, no CI workflow** (verified: zero `*.test.*` / `*.spec.*` files, no `.github/workflows`) |

### 1.2 Folder structure (actual)

```
src/
  app/
    (auth)/          signup, onboarding
    api/             28 route handlers (see §1.4)
    dashboard/       overview, menu, offers, orders, bookings, chats, knowledge, settings,
                     ai-tester, packages (static stub), layout.tsx (sidebar nav)
    store/           public storefront (menu + cart + checkout)
    widget/          public chat widget page
  components/        chat/ChatWidget.tsx, settings/* (6 cards), dashboard/NoTenantNotice.tsx, ui/*
  context/           AuthContext.tsx (Firebase client session + `authFetch`)
  lib/
    ai/              context-builder, prompt-builder, orchestrator, gemini-client, tools
    whatsapp/        qr-provider, qr-trial, qr-webhook, worker, inbox, meta-cloud, mapping
    services/orders.ts   order creation + pricing (single source of truth for money)
    tenancy/resolver.ts  tenant scoping + role checks
    settings/keys.ts     tenant API-key lookup (encrypted, cached)
    security/encryption.ts, auth/session.ts, api/response.ts, widget/service.ts
  types/schema.ts    TypeScript interfaces — partially aspirational (see §7.4 item 15)
```

### 1.3 Frontend

- **Public chat widget** — `src/app/widget/page.tsx` → `src/components/chat/ChatWidget.tsx`: resolves the widget, message thread, typing indicator, suggestion chips, retry button, "new conversation" reset; posts to the **SSE** endpoint `/api/widget/message/stream`.
- **Public storefront** — `src/app/store/page.tsx`: category filter, client-side cart, delivery/pickup choice, checkout, idempotent order submit.
- **Dashboard** — all client components; every call goes through `authFetch` (`Authorization: Bearer <Firebase ID token>`) in `src/context/AuthContext.tsx`. Sidebar nav in `dashboard/layout.tsx`: Overview, Menu, Offers, Orders, Bookings, Conversations, AI Tester, Knowledge, Settings.
- **AI Tester** — `dashboard/ai-tester/page.tsx`: embeds the same widget against the logged-in tenant's own widget key; the intended manual-QA surface.

### 1.4 Backend — route handlers (`src/app/api`)

Auth model: `getSession(request)` (`src/lib/auth/session.ts`) verifies the Firebase ID token → `requireTenantScope(tenantId, uid, requiredRole)` (`src/lib/tenancy/resolver.ts`) loads `tenants/{tid}/members/{uid}` (must be `active`) and compares role level.

Role levels: `owner 50 > admin 40 > manager 30 > orderStaff 20 = knowledgeEditor 20 > readOnly 10`. Required roles: `member` (≥10), `orders` (≥20), `manage` (≥30), `owner` (owner only).

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/auth/signup` | public | Creates Firebase user + tenant + owner membership + `users/{uid}` |
| `GET /api/auth/me` | session | Returns `tenantId`/`role`; **auto-provisions a tenant** if the user has none |
| `POST /api/onboarding/tenant` | session, owner | Writes `profile/main` + `settings/ai` |
| `GET/POST/PATCH/DELETE /api/menu/categories` | session, manage | Category CRUD (delete = archive) |
| `GET/POST/PATCH/DELETE /api/menu/items` | session, manage | Item CRUD with `availability` + `publicationStatus` |
| `GET/POST/PATCH/DELETE /api/offers` | session, manage | `percentage` / `fixedDiscount` / `freeDelivery`, min order, window, `scopeCategoryIds` |
| `GET/POST /api/knowledge` | session, member | Knowledge read/create (no update/delete route) |
| `GET/POST/PATCH /api/bookings` | session, member | Bookings CRUD (pending/confirmed/cancelled/completed) |
| `GET/PATCH /api/conversations` | session, member | Conversation list / message list; status `open|waitingForHuman|resolved|closed` |
| `GET/PATCH /api/orders` | session, `orders` | Order list; status + `paymentStatus` updates |
| `GET /api/overview` | session, member | Dashboard count cards |
| `GET/POST/DELETE /api/settings/ai-key` | session, manage/member | Encrypted key store (`gemini`, `meta_whatsapp`, `qr_provider`), masked hints only |
| `GET/POST /api/settings/business` | session, manage | Business profile + delivery settings + AI personality (writes 3 docs) |
| `GET/POST /api/settings/whatsapp` | session, manage | Mode switch `meta` \| `qr_trial` |
| `GET/POST /api/settings/whatsapp/qr` | session, manage | QR trial start/refresh/stop, provider session status, per-tenant webhook URL |
| `GET/POST /api/settings/whatsapp/meta` | session, manage | Phone-number-id mapping + live Graph API connection check |
| `GET/POST /api/settings/widget` | session, manage | Public widget id bootstrap |
| `GET/POST /api/store` | public (widget key) | Public catalog + public order submission |
| `GET /api/widget/resolve` | public (widget key) | Greeting + business name |
| `POST /api/widget/message` | public (widget key) | Non-streaming chat (rate limited) |
| `POST /api/widget/message/stream` | public (widget key) | SSE streaming chat |
| `POST /api/webhooks/whatsapp/qr`, `POST /api/webhooks/whatsapp/qr/[token]` | provider signature | QR provider inbound |
| `GET/POST /api/webhooks/whatsapp/meta` | provider signature | Meta inbound (GET = verify challenge) |
| `GET/POST /api/cron/whatsapp` | `CRON_SECRET` | Drains the pending WhatsApp inbox |

### 1.5 Database (Firestore) — actual collection layout

```
tenants/{tenantId}/
  profile/main                businessName, businessType[], country, currency, timezone, phone, address, hours
  settings/ai                 greeting, tone, language, handoffNote
  settings/delivery           deliveryFeeMinor, minimumOrderMinor, deliveryArea, pickupAvailable,
                              paymentMethods, orderInstructions
  settings/whatsapp           mode, provider, status, phoneNumberId, qrWebhookToken, qrWebhookSecret (encrypted),
                              qrTrial{status, trialStartedAt, trialEndsAt, linkedPhone, messagesUsed, messageQuota}
  members/{uid}               role, status
  apiKeys/{keyId}             provider, ciphertext/nonceOrIv/authTag/keyVersion/salt, maskedHint, status
  menuCategories/{id}         name, sortOrder, status(active|archived)
  menuItems/{id}              name, description, basePriceMinor, categoryId, availability,
                              publicationStatus, status, imageReferences, branchId
  offers/{id}                 name, type, valuePct, valueMinor, minOrderMinor, scopeCategoryIds,
                              startAt, endAt, status
  knowledgeBase/{id}          title, contentReference, category(faq|policy|businessInfo|document),
                              language, status, version
  orders/o_{idempotencyKey}   orderNumber, channel, status, paymentStatus, items[],
                              subtotal/discount/delivery/totalMinor, currency, appliedOffer,
                              customer{name,phone}, fulfilment{type,address}, notes, idempotencyKey
  bookings/{id}               type, customerName, phone, date, time, partySize, notes, status
  conversations/{conversationId}   channel, customerReference, status, messageCount, lastMessageAt
    messages/{messageId}       direction, senderType, content, processingStatus, deliveryStatus,
                               sourceReferences, createdAt
  whatsappInbox/{eventId}     channel, customerReference, text, status(pending|processing|sent|failed|skipped),
                               attempts, lastError
Top-level:
  users/{uid}                       email, displayName, tenantId, role
  widgetConfigs/{publicWidgetId}    tenantId, enabled, greeting, primaryColor, allowStore
  whatsappEventLog/{eventId}        channel, tenantId, from, to, receivedAt   (dedupe)
  whatsappSessions/{phone}          tenantId, provider                        (QR phone → tenant)
  qrWebhookTokens/{token}           tenantId                                 (per-tenant webhook path)
  metaPhoneNumbers/{phoneNumberId}  tenantId                                 (Meta number → tenant)
```

Money convention: **integer minor units** (PKR paisa) — `basePriceMinor: 35000` = PKR 350.

### 1.6 Deployment

- Vercel, git-connected: every push to `main` builds and deploys to production; there is no manual deploy step in the current workflow.
- `vercel.json`: `framework: nextjs`, `buildCommand: next build`, `installCommand: npm install`, `regions: ["iad1"]` (moved from `bom1` to cut Gemini round-trip latency), cron `GET /api/cron/whatsapp` at `0 3 * * *` (daily).
- Environment variables (names only): `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `SECRET_ENCRYPTION_KEY`, `SECRET_ENCRYPTION_KEY_VERSION`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `META_GRAPH_API_VERSION`, `QR_PROVIDER_BASE_URL`, `QR_PROVIDER_API_KEY`, `QR_PROVIDER_WEBHOOK_SECRET`, `QR_PROVIDER_WEBHOOK_BASE_URL`, `CRON_SECRET`.
- `firestore.rules` denies everything by default and gates client access on `request.auth.token.tenantId` / `token.role`. In practice the client SDK only performs auth — all data access is Admin-SDK — so these rules are effectively **inert** for the current architecture (see §7.4 item 20).
- `UNKNOWN`: whether the production Meta Cloud API variables hold real values (the repo only shows placeholders in `.env.example`), the Firestore database region, the Vercel plan (cron frequency is capped on lower tiers), and whether a custom domain points at the app.

---

## 2. AI Implementation

### 2.1 Model selection and transport

`src/lib/ai/gemini-client.ts`:

- `modelCandidates()` → ordered list: `GEMINI_MODEL` (env) → `gemini-3.5-flash-lite` → `gemini-3.6-flash` → `gemini-3.1-flash-lite` (deduplicated). The chain exists because the configured model was observed returning 503 "high demand" and, in one case, taking minutes per call.
- Transport is **raw REST**: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…` and `:streamGenerateContent?alt=sse&key=…`.
- The file header documents why: the current API rejects the legacy `role: "function"` that the SDK sends for tool results, and requires the model's `thoughtSignature` to be echoed back.
- Timeouts: `MODEL_TIMEOUT_MS = 9000`, `STREAM_TIMEOUT_MS = 18000` — applied **per model call**, not per request.
- Generation settings: `temperature 0.5`, `maxOutputTokens 400` (tool path); `temperature 0.7` in the plain-text helper.

### 2.2 Prompt construction

`src/lib/ai/prompt-builder.ts` → `buildGroundedPrompt(context, history)` produces one flat text prompt with these blocks:

1. **Business profile** — name, type, phone, address, opening hours, delivery fee, delivery area, pickup availability, minimum order, payment methods, ordering instructions, today's date.
2. **MENU** — one line per item: `- [itemId] Name [Category] — PKR 350 (currently soldOut) — description`. The `itemId` is included so the model can address items in the order tool.
3. **CURRENT OFFERS** — exact discount labels plus minimum order.
4. **APPROVED KNOWLEDGE** — at most 4 entries × 320 chars, relevance-ranked.
5. **HOW TO ANSWER** — 8 rules: tone; language mirroring; exact prices from the menu; offer applicability; knowledge-first answering with abstain/handoff; the **ordering procedure** (collect items + name + phone + address → call `create_order` → report success only with a returned order number → repeat the tool's `*Label` fields verbatim → never claim "placed" on tool error → use `get_order_status` for status); unavailable-item handling; WhatsApp formatting (Latin script only, `•` lists, ≈90 words max, ≤1 emoji); no disclosure of the rules.
6. **CONVERSATION SO FAR** — last 10 rendered turns.

### 2.3 Function / tool calling

`src/lib/ai/tools.ts` exposes exactly **two** tools:

| Tool | Arguments | Behaviour |
|---|---|---|
| `create_order` | `items[{itemId,quantity}]`, `customerName`, `customerPhone`, `fulfilmentType` (`delivery`\|`pickup`), `address?`, `notes?` | Calls `createOrder()` (server-side pricing) and returns `orderNumber`, `orderId`, `totalLabel`/`subtotalLabel`/`discountLabel`/`deliveryFeeLabel`, minor-unit amounts, `appliedOffer`, `duplicate` |
| `get_order_status` | `orderNumber`, `customerPhone` | Finds an order in the tenant's `orders` collection by `orderNumber`, then requires the phone to match; returns status, payment status, total label, item count |

Wire format: `contents` array with `role:"user"` parts; the model's `functionCall` part is echoed back **verbatim** (it carries `thoughtSignature`); the tool result is sent as `role:"user"` + `functionResponse` part. Maximum 3 tool rounds per reply. A tool failure is returned to the model as `{ok:false,error}` rather than thrown.

### 2.4 Conversation flow (server)

`src/lib/ai/orchestrator.ts` → `respondToCustomer()`:

1. `ensureConversation()` — for web, a client-supplied `conversationId` is reused; for WhatsApp a **deterministic id** `wa_qr_<phone>` / `wa_meta_<phone>` keeps history continuous per customer.
2. `Promise.all([loadHistory(limit 8), loadTenantAiContext(tenantId, message)])` — parallel.
3. The inbound message is persisted **concurrently** with generation.
4. API-key resolution: tenant BYOK key (encrypted at rest) → platform env key; duplicates removed.
5. Model call (streaming or not) with the tool loop; on failure the next key/model is tried — **except** when text was already streamed, which prevents duplicate answers.
6. If generation ultimately fails but an order was already created, the fallback message states the **real order number** instead of a false success.
7. Outbound message persisted; an `[ai-timing]` log records `contextMs / modelMs / totalMs`.

Context assembly — `src/lib/ai/context-builder.ts`: 7 parallel Firestore reads (profile, ai settings, delivery settings, categories, items, offers, knowledge) feeding a **60-second in-memory cache** per instance. Knowledge relevance uses token overlap (title weight 3, body weight 1, small category bias) and truncation to 4 × 320 chars.

### 2.5 Streaming

`POST /api/widget/message/stream` returns `text/event-stream` with `{type:"delta"|"done"|"error"}` events. The browser appends deltas to the in-flight assistant bubble. Gemini SSE frames are separated by `\r\n\r\n`; the parser handles CRLF explicitly (a `\n\n`-only parser silently loses all deltas).

---

## 3. Restaurant Configuration

### 3.1 What a restaurant can configure today

| Area | Where | Stored in | Live? |
|---|---|---|---|
| Business name/type/phone/address/hours | Settings → Business & AI Profile | `profile/main` | yes |
| Delivery fee, minimum order, delivery area, pickup flag, payment methods, order instructions | same card | `settings/delivery` | yes |
| Greeting, tone, language, handoff message | same card | `settings/ai` | yes |
| Menu categories (name, sort order) | Dashboard → Menu | `menuCategories` | yes |
| Menu items (name, description, price, category, availability, published/draft) | Dashboard → Menu | `menuItems` | yes |
| Offers (type, value, min order, window, optional category scope) | Dashboard → Offers | `offers` | yes |
| Knowledge base (title, category, text) | Dashboard → Knowledge | `knowledgeBase` | yes (create-only in the UI) |
| Bookings | Dashboard → Bookings | `bookings` | yes, but **not AI-integrated** |
| WhatsApp mode (Meta / QR trial), provider key, phone-number-id | Settings → WhatsApp cards | `settings/whatsapp`, `apiKeys` | yes |
| Public widget id + embed snippets | Settings → Widget & Store | `widgetConfigs` | yes |
| Plan/package tiers | Dashboard → Packages | — | **no** — static stub, "Create package" button disabled |

### 3.2 Live data vs. static text

**Live (queried per request, subject to the 60 s context cache):** item names/descriptions/prices, item availability, publication status, category names, offer values/minimums/windows, business profile fields, delivery settings, AI personality fields, knowledge text (published entries only).

**Static / prompt-authored:** every rule in the "HOW TO ANSWER" block; the fallback and acknowledgement strings in `orchestrator.ts` and `worker.ts`; the tool descriptions; the `handoffNote` sentence. Delivery/confirmation timings are usually derived from the tenant's `orderInstructions`/knowledge — **if a tenant has not written one, the model may invent a delivery time** (see §8.5).

**Not represented anywhere in code:** item variants/customisations (no variant collection; `menuItems.imageReferences` / `branchId` are unused), taxes or service charges, table reservations, structured ingredient/allergen data, structured opening hours (a single free-text `hours` string), staff shifts, inventory/stock counts, delivery slots.

---

## 4. Memory and Context

| Aspect | Implementation | Gap |
|---|---|---|
| Conversation identity | `conversations/{id}` with `channel`, `customerReference`, `status`, `messageCount` | Web visitors are identified by `web:<ip>` or a client-supplied string → IP-based, spoofable, and unstable across networks |
| WhatsApp identity | `customerReference` = normalised phone; deterministic conversation id `wa_qr_<phone>` | One phone = one conversation per tenant; no profile or name persistence |
| Message history | Last 8 messages loaded (`loadHistory`), rendered as the last 10 turns | Short memory; no summarisation for long conversations |
| Customer name / preferences | Only inside order documents (`customer.name`, `customer.phone`) | **No customer profile, no favourites, no "last order" memory, no preference learning** |
| Returning-customer recognition | Only via `get_order_status` (order number + matching phone) | No "welcome back" behaviour, no reorder suggestion |
| Cart | **No server-side cart.** The public store keeps a React-state cart; the AI collects items in conversation text and hands them to the tool | No saved carts, no abandoned-cart recovery, no cart TTL |
| Tenant isolation of memory | All reads via `tenantCollection`/`tenantDoc`; the tool context carries `tenantId` from the server, never from the model | Correctly scoped |
| Cross-tenant leakage surface | `get_order_status` scans only the tenant's own `orders`; webhooks resolve the tenant from server-side mappings | No cross-tenant read path found |

---

## 5. Order Management

### 5.1 Pricing and persistence (authoritative path)

`src/lib/services/orders.ts` → `createOrder(input)`:

- **Validation:** 1–20 items; quantity integer 1–20; item id ≤64 chars; customer name 1–100 chars; phone `/^[+\d][\d\s-]{6,15}$/`; delivery address 8–300 chars; idempotency key `/^[a-zA-Z0-9_-]{8,64}$/`.
- **Idempotency:** document id `o_{idempotencyKey}`; an existing document returns the stored order with `duplicate: true` (no double order).
- **Reads (parallel, one round trip):** menu items, `settings/delivery`, active `offers`.
- **Price:** `subtotal = Σ unitPriceMinor × qty`; best discount offer wins; **scoped offers** (`scopeCategoryIds`) discount only the matching lines and their minimum order is checked against the *scoped* subtotal; `freeDelivery` waives the delivery fee only; `total = subtotal − discount + deliveryFee`.
- **Write:** `status:"received"`, `paymentStatus:"unpaid"`, `channel` = `web | whatsapp_qr | whatsapp_meta`, `orderNumber = TC-YYMMDD-XXXX` (4 random hex characters).
- **Rejections:** unpublished item → "Menu item not available"; unavailable item → "<name> is currently unavailable"; unknown id → "Menu item not found".

### 5.2 Three entry points to an order

1. **AI** (chat widget or WhatsApp) — the model calls `create_order`; the tool supplies real item ids and the server computes the price.
2. **Public storefront** — `POST /api/store` (public, widget key) with a client-generated `crypto.randomUUID()` idempotency key; errors are sanitised into friendly text by `sanitizeStoreError`.
3. **Dashboard** — `GET /api/orders` (role ≥ orderStaff) list; `PATCH` status (`received|confirmed|preparing|ready|dispatched|completed|declined|cancelled`) and `paymentStatus` (`unpaid|paid|refunded`).

### 5.3 Error handling and false-confirmation control

- Tool errors return to the model as `{ok:false,error}`; the prompt forbids claiming success.
- If the order was created but the final generation failed, the orchestrator's fallback states the **real order number** and that the team will call to confirm.
- Order creation is atomic per idempotency key; the dashboard order list is the source of truth for staff.
- **Not implemented:** customer-facing cancellation, payment capture, delivery assignment/rider, kitchen display, order ETA computation, receipts/notifications (email/SMS), reorder, tips, table orders, order splitting, an audit trail of who changed a status, and order→booking conversion.

### 5.4 Verified end-to-end journey (live production probe)

1. A WhatsApp message reaches the provider, which POSTs to `/api/webhooks/whatsapp/qr/{token}`.
2. HMAC-SHA256 signature verified with the tenant's stored secret; unknown tenant → 404; bad signature → 403.
3. Duplicate provider message id → `{received:true,duplicate:true}` (no second reply).
4. Trial/quota check (`checkTrialAllowed`) — expired trial or exceeded quota ⇒ no reply.
5. The event is enqueued in `whatsappInbox`; HTTP 200 is returned **immediately** and background processing starts via `waitUntil`.
6. Worker → AI turn → `create_order` tool → `createOrder` (fresh prices) → order document written.
7. The model replies with the order number and the tool's `totalLabel`; the worker sends it through the provider (`POST /api/send`).
8. If the AI takes longer than 5 s, an acknowledgement message is sent first, then the real reply.
9. The web widget follows the same path via `/api/widget/message` (non-streaming) or `/api/widget/message/stream` (SSE).

Live probe confirmed: a WhatsApp order was created with the correct server-computed subtotal, scoped discount, delivery fee and total, and the customer-facing reply quoted exactly those numbers.

---

## 6. WhatsApp and Chat Widget

### 6.1 QR-session provider adapter (`src/lib/whatsapp/qr-provider.ts`)

- `getQrSession(token)` → `GET /api/session` → `{status, phone, qr, webhook, message}`; `status ∈ connected|starting|qr|disconnected`.
- `sendQrText(token, to, text)` → `POST /api/send` (Bearer token). The provider also supports image/document/audio, but **only text is used**.
- `registerQrWebhook(token, url)` → `POST /api/webhook`; the provider returns a **per-webhook secret**, which is encrypted and stored in `settings/whatsapp.qrWebhookSecret`.
- Credential precedence: the tenant's own `qr_provider` key (encrypted at rest) → platform `QR_PROVIDER_API_KEY` fallback.

### 6.2 Trial management (`src/lib/whatsapp/qr-trial.ts`)

- 7-day trial with **server-side** `trialStartedAt` / `trialEndsAt`; 500-message quota; statuses `not_configured|pending_scan|connected|disconnected|expired|error`; per-tenant webhook path token; phone→tenant mapping in `whatsappSessions`.
- Browser clock changes cannot extend a trial — every check is server-side.

### 6.3 Inbound handling and duplicate protection

- Two routes: `/api/webhooks/whatsapp/qr` (platform secret) and `/api/webhooks/whatsapp/qr/[token]` (per-tenant secret; the tenant is resolved from a server-side mapping, never from the payload).
- Signature: `X-Webhook-Signature: sha256=HMAC_SHA256(rawBody, secret)`, compared with `timingSafeEqual`.
- Dedupe: `whatsappEventLog/{providerMessageId}`.
- Reliability: HTTP 200 is returned **before** AI processing (the provider retries on 5xx/timeout); the work completes via `waitUntil`, with `/api/cron/whatsapp` (`CRON_SECRET` auth) as a safety net draining `whatsappInbox`.

### 6.4 Meta Cloud API adapter (`src/lib/whatsapp/meta-cloud.ts`, `src/app/api/webhooks/whatsapp/meta/route.ts`)

- `GET` = verify challenge against `WHATSAPP_VERIFY_TOKEN`; `POST` = `x-hub-signature-256` verification → event normalisation → `metaPhoneNumbers/{phoneNumberId}` → tenant → enqueue → background processing.
- Outbound: `POST https://graph.facebook.com/{META_GRAPH_API_VERSION}/{phoneNumberId}/messages` (text only).
- `MetaChannelCard.tsx` validates the phone-number-id against Graph API and shows the callback URL to paste into Meta.

### 6.5 Web widget

- `GET /api/widget/resolve?key=` → business name + greeting; `POST /api/widget/message[/stream]` → AI reply.
- Rate limiting: in-memory, **30 requests/minute per IP** (`src/lib/widget/service.ts`), with separate buckets for widget messages, widget stream and store.
- The widget id is a random public token (`wa_<24 hex>`) mapped server-side to a tenant.

### 6.6 Human handoff — partially implemented

- `conversations/{id}.status` can be set to `waitingForHuman` / `resolved` / `closed` from the dashboard Chats page (`PATCH /api/conversations`), and the UI shows a "Needs Human" badge.
- **Gap:** the AI path never reads conversation status — the assistant keeps replying to a customer who was flagged for a human, and there is no staff-reply composer in the dashboard (the Chats page only lists messages and toggles status). `aiEnabled` exists in `src/types/schema.ts` but is **not implemented anywhere**.

---

## 7. Existing Capabilities and Gaps

### 7.1 Implemented and working

- Multi-tenant SaaS skeleton: signup → tenant auto-provision → onboarding → dashboard, with Firebase token auth and server-side role checks on every privileged route.
- Menu / category / offer / knowledge / bookings CRUD in the dashboard, with availability and publication controls.
- Grounded AI: menu, offers, profile and knowledge injected; prices only from the menu; abstention rule; per-tenant tone, greeting, language and handoff note.
- Working **order booking by the agent** via a bounded tool with server-side pricing, category-scoped offers, idempotency and truthful confirmation.
- Public chat widget (streaming) plus a public storefront ordering flow.
- WhatsApp: QR provider (per-tenant or platform credential, 7-day trial, quota, per-tenant webhook secret, dedupe, async processing, cron drainer) and Meta Cloud API (signature verification, number→tenant mapping, Graph API sending).
- Encrypted secret storage with masked hints; server-only Admin SDK; deny-by-default Firestore rules.
- Safe error surface: `handleApiError` converts internal failures into generic 500s and logs scope-tagged messages; auth errors are user-friendly.

### 7.2 Partially implemented

| Area | What exists | What is missing |
|---|---|---|
| Human handoff | Status flag + dashboard badge | AI does not honour it; no staff reply UI; no assignment/routing |
| Knowledge base | Manual create + AI retrieval (4 × 320 chars, token overlap) | No update/delete, no document ingestion, no chunking/embeddings (`knowledgeChunks` unused), no per-language content, no review/expiry workflow |
| Booking assistant | Bookings CRUD in the dashboard | No AI tool, no AI-facing booking flow, no table/reservation model |
| Meta channel | Adapter, settings, webhook | No template messages (24 h service window), no media, no read receipts, no retry queue, minimal per-tenant onboarding UI |
| Storefront | Cart + checkout + order creation | No saved cart, no upsell/bundles, no delivery-slot or payment choice, no customer-facing order tracking |
| Packages / plans | Type definitions + stub page | No CRUD, no billing, no trial gating (the QR trial is hard-coded to 7 days) |
| Recommendations | Offers are surfaced when applicable | No "popular items", no pairing, no personalised suggestions |
| Image support | `imageReferences` field on items | No upload pipeline, no storage rules for tenant assets, no images in the AI context or storefront |

### 7.3 Missing

Automated tests (zero test files, no runner, no CI), an AI evaluation harness, structured logging/tracing (only `console.log` lines), analytics of drop-off/conversion, an order-level audit trail, shared multi-tenant rate limiting, team/user management UI (member documents exist but no invitation flow), alerting when the WhatsApp queue stalls, preference memory for returning customers, an order-ETA/delivery-slot model, refunds beyond a status flag, tax/service charge, promo-code redemption.

### 7.4 Verified bugs and architectural weaknesses

1. **AI ignores handoff status** — `waitingForHuman` is never read by `respondToCustomer` (no reference anywhere in `src/lib`).
2. **Stale availability in the prompt** — the AI context cache is 60 s old and `invalidateAiContext()` is never called from the menu/offers routes, so a just-sold-out item can still be offered (order creation then correctly rejects it, producing a promise/result mismatch).
3. **Minimum order value is not enforced** — `settings/delivery.minimumOrderMinor` appears only in the prompt; `createOrder` never compares the subtotal with it, so a sub-minimum order can be created.
4. **Delivery area is not enforced** — `deliveryArea` is prompt-only; there is no server-side address validation, so out-of-area orders are avoided only if the model volunteers it.
5. **Order-number collision risk** — `TC-YYMMDD-XXXX` uses 4 random hex characters (65 536 combinations/day) with no uniqueness check.
6. **Expensive order-status lookup** — `get_order_status` reads the tenant's **entire** `orders` collection per call.
7. **Cache invalidation gaps** — `getTenantApiKey` caches for 60 s and is never invalidated on save/delete, so a revoked key stays usable for up to a minute; the AI context cache has the same problem.
8. **`meta_whatsapp` tokens are never validated** — they are stored with status `pending_validation`, and `getTenantApiKey` accepts `pending_validation`, so an invalid Meta token is used at runtime.
9. **Rate limiting is per-instance and in-memory** — it resets on scale-out/cold start; widget, widget-stream and store use separate buckets; the WhatsApp webhook path has no IP limit of its own.
10. **Unbounded in-memory rate-limit map** — `rateBuckets` is never pruned.
11. **No prompt-injection hardening** — no rule tells the model to treat customer text, knowledge documents and menu descriptions as untrusted data; a customer could try to override prices or extract the rules, which live in a plain-text prompt.
12. **No Meta template fallback** — messages sent outside the 24-hour service window are rejected by Meta and the code does not detect or fall back to a template.
13. **Single-message WhatsApp replies** — no read receipts, typing indicator or media replies; the 5-second acknowledgement is fixed English text and may clash with the tenant's tone.
14. **No retention policy on top-level collections** — `whatsappEventLog` (contains sender numbers), `whatsappSessions`, `qrWebhookTokens` and `metaPhoneNumbers` grow indefinitely and hold personal data.
15. **`src/types/schema.ts` is aspirational** — `aiEnabled`, `assignedTo`, `channelConversationId`, `toolActionReferences`, `providerMessageId` and `KnowledgeChunk` are declared but never written or read, which misleads maintainers.
16. **Silent tenant auto-provisioning** — any authenticated user without a tenant gets a new tenant and a `users` document on `GET /api/auth/me`; there is no rate limit or per-user tenant cap. (This path is what previously made dashboard pages render blank.)
17. **No CI gates** — lint and type-check run manually; only the Vercel build guards production.
18. **Model-API coupling** — the AI path depends on Gemini 3.x REST semantics (`thoughtSignature`, uppercase schema types, `role:"user"` function responses). A model or API-version change (as with the observed 503s and the SDK's `role:"function"` rejection) breaks the tool loop and silently degrades to the generic fallback message.
19. **English tool errors reach the customer** — tool error strings are passed to the model verbatim and can surface in the reply; the public store path sanitises them, the AI path does not.
20. **Firestore rules are effectively broken if the client SDK is ever used for writes** — they check `request.auth.token.tenantId` / `token.role`, but the app never sets those custom claims; the Admin SDK bypasses the rules entirely.

---

## 8. AI Quality and Sales

### 8.1 Natural conversation

- The agent is stateless per request apart from the last 8 messages: no turn planner, no intent classifier, no clarification loop, and no memory of a partially collected order other than raw chat text. A customer who says "2 biryani" and then changes their mind can leave a stale item in the model's head.
- Length and formatting rules (≈90 words, `•` lists, ≤1 emoji) are prompt-only, not enforced; the model sometimes returns Markdown bold or a full menu dump.
- The "ask for missing details in one short message" rule is not validated afterwards — the model may proceed with partial data and let the tool reject it, producing a confusing error instead of a graceful re-ask.

### 8.2 Multilingual behaviour

- The prompt instructs language mirroring (English/Urdu/Roman Urdu) and the retrieval tokenizer includes Urdu stop-words.
- A hard rule forces **Latin script only** for WhatsApp, because a non-Latin greeting was observed rendering incorrectly on some clients.
- There is no per-language content: the knowledge base has a `language` field that the AI context ignores — all published entries are injected regardless of language.
- The fallback and acknowledgement strings are Roman-Urdu/English only, so a customer writing in Urdu receives an English fallback whenever the model fails.

### 8.3 Customer memory and returning customers

- Effectively none beyond the conversation window: no favourites, no "your last order was…", no address book, no recognition of a returning WhatsApp customer (the deterministic conversation id preserves text history only).
- Sales impact: every returning customer must restate name, phone and address, and the agent cannot offer "your usual".

### 8.4 Recommendations, upselling and conversion

- The agent can surface **active offers** (they are in the prompt) but there is no deliberate upsell or cross-sell behaviour: no "frequently ordered together", no "add a drink for PKR 50", no bundle logic, no popularity data (no order-frequency aggregation exists anywhere), and no recommendation tool.
- Conversion mechanics that do exist: server-priced order creation, an order number the customer can quote, a staff confirmation step, and a 5-second WhatsApp acknowledgement to reduce perceived latency.
- Missing levers: abandoned-cart recovery, reorder from history, delivery-threshold nudges driven by the live minimum order, "add more for free delivery" prompts, and urgency messaging for offers with a date window (the agent is not instructed to mention expiry).

### 8.5 Hallucination risk

Mitigations in place: prices only from the menu; display amounts supplied by the tool as authoritative `*Label` strings; an explicit abstain/handoff rule; "never say placed without an order number"; availability included in the menu lines; no raw provider errors surfaced on the store path.

Residual risks (all traceable to the code):

- The model can still paraphrase item descriptions and **invent delivery timings** when a tenant has no `orderInstructions`/knowledge entry — no rule forbids quoting a time that is not in the context.
- The prompt's menu snapshot can be up to 60 s stale, so "available now" may be wrong (the tool will then reject the order, producing a promise/result mismatch).
- Offers are listed in the prompt without their scope/minimum in a machine-checkable form, so the model may quote an offer the pricing engine refuses.
- System rules live in one plain-text prompt with no injection defence; a crafted message could try to override prices, reveal the rules, or instruct the model to call `create_order` with fabricated ids (the tool rejects unknown ids, so the blast radius is limited to a poor experience).

### 8.6 Recovery from misunderstandings

- Tool errors return to the model, which is expected to explain them; in practice the raw English error text can leak into the reply.
- There is no fuzzy item matching: the model must map free text to a menu `itemId`. It usually works because the id is in the prompt line, but a mis-typed or unsupplied id produces "Menu item not found".
- No clarification state machine, no "did you mean" support, and no recovery flow for partially supplied orders (missing address → the model should re-ask; this is prompt-only behaviour).
- After ordering, the customer has no self-service status page; status requires the AI tool with order number + phone, and the dashboard has no customer-facing link.

---

## 9. Relevant Code References

| Concern | File / symbol |
|---|---|
| AI entry point | `src/lib/ai/orchestrator.ts` → `respondToCustomer()` |
| Prompt | `src/lib/ai/prompt-builder.ts` → `buildGroundedPrompt()` |
| Grounding data | `src/lib/ai/context-builder.ts` → `loadTenantAiContext()`, `buildTenantAiContext()`, `scoreKnowledge()` |
| Gemini transport, timeouts, model chain, streaming | `src/lib/ai/gemini-client.ts` → `modelCandidates()`, `restCall()`, `restStream()`, `generateGeminiTextWithTools()`, `generateGeminiTextWithToolsStream()` |
| Tool declarations + handlers | `src/lib/ai/tools.ts` → `toolDeclarations`, `runTool()`, `runCreateOrder()`, `runGetOrderStatus()` |
| Order engine (pricing, idempotency, offers) | `src/lib/services/orders.ts` → `createOrder()`, `selectEligibleOffer()`, `selectFreeDeliveryOffer()` |
| Tenant scoping + roles | `src/lib/tenancy/resolver.ts` → `requireTenantScope()`, `tenantCollection()`, `tenantDoc()` |
| Session auth | `src/lib/auth/session.ts` → `getSession()`; client: `src/context/AuthContext.tsx` → `authFetch()` |
| Secret encryption | `src/lib/security/encryption.ts` → `encrypt()`, `decrypt()`, `maskHint()`; `src/lib/settings/keys.ts` → `getTenantApiKey()` (60 s cache) |
| API envelope + error masking | `src/lib/api/response.ts` → `createApiResponse()`, `createApiError()`, `handleApiError()` |
| Widget identity + rate limit | `src/lib/widget/service.ts` → `ensureWidgetConfig()`, `resolveWidget()`, `checkRateLimit()` |
| QR provider adapter | `src/lib/whatsapp/qr-provider.ts` → `getQrSession()`, `sendQrText()`, `registerQrWebhook()` |
| QR trial lifecycle + mappings | `src/lib/whatsapp/qr-trial.ts` → `startQrTrial()`, `refreshQrTrialConnection()`, `checkTrialAllowed()`, `recordTrialUsage()`, `resolveTenantByPhone()`, `resolveTenantByWebhookToken()` |
| QR inbound (verify, dedupe, enqueue) | `src/lib/whatsapp/qr-webhook.ts` → `handleQrWebhook()`; routes `src/app/api/webhooks/whatsapp/qr/route.ts`, `src/app/api/webhooks/whatsapp/qr/[token]/route.ts` |
| Async worker + slow-reply ack | `src/lib/whatsapp/worker.ts` → `processInboxEvent()`, `drainInbox()`; `src/lib/whatsapp/inbox.ts` → `enqueueInboxEvent()`, `listPendingInboxEvents()` |
| Cron drainer | `src/app/api/cron/whatsapp/route.ts` (auth: `CRON_SECRET`) |
| Meta adapter + webhook + mapping | `src/lib/whatsapp/meta-cloud.ts` (`verifyMetaSignature()`, `normalizeInboundMessages()`, `sendMetaText()`), `src/app/api/webhooks/whatsapp/meta/route.ts`, `src/lib/whatsapp/mapping.ts` (`mapMetaPhoneNumberId()`, `resolveTenantByMetaPhoneNumberId()`) |
| Chat UI | `src/components/chat/ChatWidget.tsx`, `src/app/widget/page.tsx`, `src/app/dashboard/ai-tester/page.tsx` |
| Storefront | `src/app/store/page.tsx`, `src/app/api/store/route.ts` |
| Dashboard surfaces | `src/app/dashboard/{page,menu,offers,orders,bookings,chats,knowledge,settings,ai-tester}/page.tsx`, `src/components/settings/*` |
| Rules & config | `firestore.rules`, `vercel.json`, `.env.example`, `src/types/schema.ts` (partially unimplemented) |

---

## 10. Recommended Improvements

### P0 — correctness, money and safety (next release)

1. **Keep the order tool as the single price authority, and verify the reply.** Return machine-readable `lines[]` (name, qty, unit label, line total) from `create_order`; add a post-generation validator that re-computes the total from the stored order and rewrites the reply when the numbers differ. This is the strongest guard against wrong prices reaching a customer.
2. **Enforce business rules server-side** in `createOrder`: minimum order value, delivery-area/address validation, and an optional intake window. Return typed, translatable errors (`MIN_ORDER_NOT_MET`, `OUT_OF_DELIVERY_AREA`, `ITEM_UNAVAILABLE`, `ADDRESS_REQUIRED`) that the model can act on instead of raw English strings.
3. **Restrict the model to quoted facts.** Inject a deterministic "facts" block (delivery fee, minimum order, delivery window, order instructions, payment methods) sourced from `settings/delivery` and forbid any other time/fee/policy claim; add a reply post-check that replaces currency amounts with the tool-verified labels.
4. **Honour human handoff.** Read `conversations/{id}.status` in `respondToCustomer`; when `waitingForHuman` or `closed`, store the customer message without auto-replying and surface it for staff. Add a staff reply composer that writes a `senderType:"staff"` message and sends it to the customer on the same channel.
5. **Cache correctness.** Call `invalidateAiContext(tenantId)` from the menu/offers/knowledge/business write routes and `invalidateTenantApiKeyCache(tenantId)` from the ai-key routes; shorten the AI context TTL to ~15 s or add an explicit menu-version token in the prompt so stale availability cannot be quoted.
6. **Order-number uniqueness.** Replace the 4-hex suffix with a longer, collision-checked identifier (e.g. date + 6 chars + existence check) and index `orders` by `orderNumber` for O(1) status lookups.

### P1 — reliability, security and multi-tenancy

7. **Prompt-injection defence.** Mark untrusted content explicitly in the prompt (customer text, knowledge bodies, item descriptions) and instruct the model to treat it as data, never as instructions; add a "price/policy statements must come from the MENU/FACTS blocks" rule plus a reply validator.
8. **Validate the Meta token** on save (Graph API call) so an invalid token cannot reach production; fail the tenant's channel state visibly in the dashboard.
9. **Shared rate limiting.** Move the in-memory buckets to a shared store (Firestore transaction / Upstash) and unify widget, widget-stream, store and webhook limits per IP **and** per widget key; prune expired buckets.
10. **Data retention.** Add TTL/cleanup jobs for `whatsappEventLog`, `whatsappSessions`, `qrWebhookTokens`, and `metaPhoneNumbers`; store only a hash of customer numbers where a lookup is not required; document a retention window in the PRD.
11. **Webhook and secret hygiene.** Rotate the QR provider webhook secret on re-registration, verify the signature against a per-tenant secret only (drop the platform-wide fallback for tenant traffic), and record which secret version validated each event.
12. **Queue observability.** Emit metrics for queue depth, oldest pending age, tool failures, model timeouts and fallback usage; alert when the WhatsApp inbox has pending items older than N minutes (the daily cron is not a sufficient safety net).
13. **Fix the Firestore rules** to reflect reality (either set the custom claims the rules expect, or make the rules deny client writes and document the Admin-SDK-only model).
14. **Restrict tenant auto-provisioning** to the signup/onboarding path (or cap it per user) so `GET /api/auth/me` cannot create tenants on demand.

### P2 — product quality, memory and conversion

15. **Persistent customer memory.** Store a customer profile keyed by normalised phone (`customers/{tenantId}/{phone}`) with name, last order, favourites and consent; let the agent greet returning customers and offer "your usual". Respect a retention/consent policy.
16. **Structured knowledge.** Replace free-text knowledge rows with typed records (hours per weekday, delivery areas and fees, payment methods, policies, allergens) so facts are queried, not prompted; add document ingestion with chunking (the `knowledgeChunks` type already exists) and per-language entries.
17. **Recommendations and upsell.** Add a `recommend_items` tool and aggregate order-frequency data (`items` sold per day) so the agent can propose a starter, a side or a top-up; surface bundles and "free delivery above X" nudges using the live minimum order.
18. **Booking and reservation tools.** Add `create_booking` (and optionally table reservation) so the WhatsApp assistant can book tables with the same validation as the dashboard; wire the existing `bookings` collection into the AI context.
19. **Cart service.** Move the cart server-side (`carts/{tenantId}/{cartId}`) so the widget, storefront and WhatsApp can share one cart, enabling abandoned-cart reminders and consistent totals.
20. **Order lifecycle extensions.** Customer-visible status page, cancellation request, ETA/delivery-slot fields, reorder, and a status-change audit log (`who`, `when`, `from` → `to`).
21. **Multi-channel parity.** Implement Meta templates for out-of-window sends, media replies (the QR provider already supports image/document/audio), and read receipts, so both channels behave consistently.
22. **Guardrails and evaluation.** Build an evaluation harness: a fixed set of customer questions per tenant (prices, sold-out items, offers, out-of-area delivery, sub-minimum order, injection attempts, unknown facts) asserted against the live agent, run in CI. Assert specifically that the agent never states an order number it did not receive from the tool, never quotes a price that is not in the menu, and never claims a confirmation without a tool result.
23. **Testing and CI.** Add unit tests for `createOrder` (pricing, scoped offers, idempotency, min-order), for the tool argument validation, and integration tests for the webhook signature/dedupe/trial paths; wire `lint` + `typecheck` + `build` + tests into a GitHub Actions workflow.
24. **Observability for prompts.** Version the prompt (a `promptVersion` field per message) so regressions can be reproduced and rolled back, and record `sourceReferences` (currently always empty) on assistant messages for grounding audits.




