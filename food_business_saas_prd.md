# Product Requirements Document (PRD)

## Multi-Tenant AI-Powered Food Business SaaS for Pakistan

**Working product name:** Food Business AI SaaS (final branding TBD)\
**Version:** 1.0\
**Status:** Draft for product, design, engineering, security, and QA
review\
**Primary market:** Pakistan-based small food businesses\
**Platform:** Responsive web application, public ordering/booking pages,
embeddable chat widget\
**Initial business types:** Food stalls, small restaurants, cafés, home
chefs, bakeries, takeaway shops, cloud kitchens, and small catering
businesses\
**Technology baseline:** Next.js App Router, JavaScript, Tailwind CSS,
Firebase Authentication, Cloud Firestore, Firebase Storage, Gemini API,
GitHub, and Vercel\
**Channels:** Existing QR-based WhatsApp provider and website chat
widget\
**Last updated:** 19 October 2026

------------------------------------------------------------------------

## Document Purpose

This PRD defines the product vision, requirements, architecture, data
model, AI behavior, ordering and booking workflows, acceptance criteria,
edge cases, QA strategy, rollout phases, and open questions for a
multi-tenant SaaS platform serving small food businesses in Pakistan.

The product is not merely a chatbot. It is a simple digital operating
system combining: - Business profile and menu/product management. -
Deals, discounts, and combo offers. - A public menu and online order
page. - Booking, pre-order, and catering inquiry pages where relevant. -
Order, customer, and conversation management. - One tenant-specific AI
agent shared by WhatsApp and website chat. - A knowledge base using
Hybrid RAG and structured business data. - A seven-day trial and
subscription-ready SaaS foundation. - A platform Super Admin dashboard.

This document covers the MVP and future phases. Future features are
roadmap items, not claims that they are already implemented.

# 1. Executive Summary / Overview

## 1.1 Product vision

Build a simple, affordable, multi-tenant SaaS platform that lets small
food businesses publish their menu, promote offers, receive online
orders, answer repetitive questions with AI, and manage customers from
one dashboard.

A non-technical owner should be able to create a workspace, add products
and prices, create a deal, connect WhatsApp, test the AI, and publish an
order link without writing code.

The platform will have a shared SaaS foundation and a shared AI
orchestration service. Each business has a separate workspace with
isolated menu items, offers, orders, customers, conversations,
knowledge, integrations, settings, and usage records. Business templates
provide different defaults and optional modules for stalls, restaurants,
cafés, home chefs, bakeries, and catering businesses.

## 1.2 Core value proposition

Owners can: - Add products, dishes, drinks, sizes, variants, and
add-ons. - Set prices, hours, availability, and delivery rules. - Create
combo deals, percentage/fixed discounts, buy-one-get-one offers, and
free-delivery offers. - Publish a shareable public menu and online order
page. - Accept order requests and manage their status. - Enable table
bookings, scheduled pickup, home-chef pre-orders, or catering
inquiries. - Connect WhatsApp through the supported QR-based provider. -
Embed a website chat widget. - Use the same AI agent across WhatsApp and
website chat. - Answer common questions from approved business knowledge
and current structured records. - Transfer conversations to a human. -
Track orders, customer history, basic reports, and follow-ups. - Start
with a seven-day trial under defined limits.

## 1.3 Product principles

1.  **Simple for non-technical owners:** Owners should not need to
    understand prompts, embeddings, vector databases, or API internals.
2.  **One workspace per tenant:** Private data and credentials must be
    isolated.
3.  **One AI engine, multiple channels:** WhatsApp and web chat use the
    same tenant-aware orchestration service.
4.  **Structured menu data:** Prices, variants, offers, and availability
    are not maintained only as free-text documents.
5.  **Orders are real records:** AI must not claim an order is confirmed
    until the backend confirms the applicable state.
6.  **Offers are rule-driven:** The server validates eligibility and
    calculates discounts.
7.  **Human control:** AI actions are allowlisted, auditable, and
    restricted by tenant settings.
8.  **Local practicality:** PKR, mobile numbers, landmarks, COD, pickup,
    manual payment recording, Urdu/Roman Urdu, and local operating
    patterns are considered.
9.  **Optional modules:** A food stall does not need table booking; a
    home chef may need portion limits and pre-orders.
10. **Phased delivery:** Start with menu, offers, ordering, AI, and
    tenant security; expand after the pilot.

## 1.4 Working technical assumptions

-   Frontend: Next.js App Router, JavaScript, Tailwind CSS.
-   Backend: Next.js Route Handlers and server-side service modules.
-   Authentication: Firebase Authentication.
-   Operational database: Cloud Firestore.
-   File/media storage: Firebase Storage.
-   AI provider: Gemini API.
-   Credential model: Business supplies its own Gemini API key under the
    proposed bring-your-own-key (BYOK) model.
-   WhatsApp: Existing QR-based provider, subject to technical and
    policy validation.
-   Website chat: Embeddable widget using the shared AI orchestration
    service.
-   Hosting/source control: GitHub and Vercel for the web app; separate
    persistent infrastructure may be needed for WhatsApp sessions.
-   Trial: Seven days, with server-side expiry and usage enforcement.
-   Initial market: Small food businesses in Pakistan.
-   Initial payments: COD, cash on pickup, and manually recorded
    payments; automated gateway integrations can follow.
-   Architecture: One multi-tenant codebase, not a separate application
    deployment for each business.

## 1.5 Scope at a glance

  ----------------------------------------------------------------------------------
  Area                    MVP                     Future
  ----------------------- ----------------------- ----------------------------------
  SaaS core               Signup, workspace,      Reseller/white-label
                          roles, tenant isolation 

  Business setup          Profile, hours,         Advanced branches
                          business type, contact  

  Menu                    Categories, products,   Recipe costing/inventory
                          images, prices,         
                          variants, modifiers     

  Offers                  Basic offers, validity, Loyalty and campaigns
                          eligibility, limits     

  Public pages            Menu/order page, basic  Full website builder
                          booking/pre-order forms 

  Orders                  Order capture, status,  POS/delivery integrations
                          customer details        

  AI                      Gemini, Hybrid RAG,     Multiple AI providers
                          structured queries      

  Channels                QR WhatsApp provider,   Official Cloud API adapter
                          website widget          

  Payments                COD, pickup cash,       Automated
                          manual payment status   Raast/JazzCash/Easypaisa/gateway
                                                  integrations

  Operations              Basic availability and  KDS, ingredients, suppliers
                          optional booking        

  Trial/admin             Seven-day trial,        Automated subscriptions/invoices
                          quotas, Super Admin     

  Business templates      Restaurant, café, home  Other industries
                          chef, stall, bakery,    
                          takeaway                
  ----------------------------------------------------------------------------------

# 2. Problem Statement & Background

## 2.1 Problem statement

Small food businesses often manage customer messages through personal
WhatsApp accounts, calls, social media, paper notes, and spreadsheets.
Menus and prices are posted as images or status updates, while orders
are copied manually between chats and notebooks.

Owners repeatedly answer questions such as: - What is on the menu? -
What is the current price? - Is a deal available today? - Do you deliver
to my area? - What is the delivery fee? - Can I order for later? - Is
the item available? - How can I book a table or request catering? - What
is the status of my order?

A new stall or home kitchen may not afford a dedicated receptionist,
ordering website, POS, CRM, or custom AI system. A generic chatbot
cannot solve the problem if it does not know the current menu, validate
offers, create structured orders, or hand over complex conversations.

## 2.2 Pain points

-   Repetitive questions interrupt preparation and service.
-   Menus, prices, and offers become outdated across channels.
-   Orders are missed, duplicated, or recorded with wrong quantities.
-   Delivery fees and minimum order rules are inconsistently
    communicated.
-   Customers may order unavailable products.
-   Owners lack visibility into pending, preparing, ready, completed,
    and cancelled orders.
-   Customers cannot easily place an order without waiting for a manual
    reply.
-   New businesses need affordable ways to promote combo deals and
    launch offers.
-   Owners may not have technical skills to configure an AI system.
-   Staff need to take over complaints and exceptions.
-   Customer contact/address data must not be exposed to other tenants.
-   AI may hallucinate prices, offers, allergen information,
    availability, or order confirmations if it uses only free-text
    knowledge.

## 2.3 Business goals

1.  Enable a non-technical owner to publish an initial menu without
    developer assistance.
2.  Reduce repetitive customer support effort for answerable queries.
3.  Make a public menu/order link easy to share.
4.  Reduce errors in order details and offer calculations.
5.  Give owners a simple dashboard to manage orders and conversations.
6.  Support different food-business workflows through optional modules.
7.  Establish a secure multi-tenant foundation for future business
    types.
8.  Create a trial-to-paid path with measurable AI and messaging usage.

## 2.4 Expected outcomes

-   Customers can discover current products and offers.
-   Customers can submit orders or booking requests without waiting for
    manual chat replies.
-   AI answers common questions through WhatsApp and website chat.
-   Owners can see and update orders in one dashboard.
-   Offers are applied according to deterministic rules.
-   The platform avoids false order, payment, and booking confirmations.
-   One business cannot access another business's records or
    credentials.

# 3. Target Audience & User Personas

## 3.1 New food stall owner

**Goals:** Share a menu, receive WhatsApp orders, advertise deals, and
avoid missed messages.\
**Needs:** Simple setup, mobile-friendly dashboard, COD/pickup, sold-out
toggle, offer creation, notifications.\
**Pain points:** Limited budget, no dedicated staff, no website, manual
order tracking.\
**Success:** Share one link and manage orders with minimal effort.

## 3.2 Small restaurant/takeaway owner

**Goals:** Handle delivery and pickup orders, manage availability,
respond to questions, and track daily operations.\
**Needs:** Menu categories, modifiers, delivery zones, order statuses,
staff roles, optional table booking.\
**Success:** Orders arrive in a structured queue and questions receive
accurate answers.

## 3.3 Café owner

**Goals:** Sell drinks, snacks, combos, and seasonal items.\
**Needs:** Size variants, milk/syrup modifiers, combo deals, scheduled
offers, pickup scheduling.\
**Success:** Customer customizations and final prices are correct.

## 3.4 Home chef/home kitchen

**Goals:** Accept advance orders, control daily portions, schedule
pickup/delivery, and manage catering.\
**Needs:** Daily menu, quantity limits, cutoff times, lead times, slots,
family trays, meal plans.\
**Success:** The system stops accepting orders when configured capacity
is reached.

## 3.5 Customer

**Goals:** See the menu, understand prices/offers, order quickly, choose
delivery/pickup, and receive status updates.\
**Needs:** Clear mobile menu, accurate total, simple contact details,
familiar language.\
**Success:** Place an order or booking request with minimal friction.

## 3.6 Staff member

**Goals:** See orders, update status, prepare correct items, and resolve
issues.\
**Needs:** Order queue, customer notes, role-based access, clear status
controls.\
**Success:** Staff can see what to prepare and what action is needed.

## 3.7 Platform Super Admin

**Goals:** Operate the platform, manage trials, troubleshoot errors, and
prevent abuse.\
**Needs:** Tenant directory, usage metrics, integration health, safe
diagnostics, audit logs.\
**Success:** Diagnose issues without unnecessary access to private data.

## 3.8 Roles and permissions

-   **Platform Super Admin:** Platform tenant, plan, trial, and
    operational controls. Sensitive tenant content is not automatically
    visible.
-   **Workspace Owner:** Full control of business settings, menu,
    offers, orders, members, and integrations.
-   **Workspace Admin/Manager:** Manage permitted business settings,
    menu, offers, orders, and staff.
-   **Order Staff:** View/update permitted orders and customer service
    requests.
-   **Kitchen Staff:** View preparation details and update preparation
    states if enabled.
-   **Knowledge Editor:** Create/edit draft FAQs and policies;
    publishing may require approval.
-   **Read-only/Auditor:** Read permitted records and reports.
-   **Public customer:** Access public pages and authorized
    order/booking flows only.
-   **WhatsApp customer:** Interact through the connected channel;
    private order details require appropriate identity verification.

# 4. Product Scope and Business Template Model

## 4.1 Shared SaaS foundation

Authentication, workspace/tenant management, roles, AI orchestration,
knowledge retrieval, conversation storage, channel adapters, usage
metering, trial controls, audit logging, public widget infrastructure,
and billing entitlements.

## 4.2 Food-specific modules

Business profile, menu categories/products, variants/modifiers,
deals/offers, public menu/order page, order management, delivery
settings, booking/pre-order workflows, customer conversations, basic
reports, and optional kitchen display, inventory, catering, loyalty, and
payment integrations.

## 4.3 Business type selection

During onboarding, owner selects one or more: - Food stall. -
Restaurant. - Café/coffee shop. - Home chef/home kitchen. -
Bakery/dessert shop. - Takeaway. - Cloud kitchen. - Catering business.

Selection controls defaults and visible modules. It is not a security
boundary; permissions and entitlements are enforced separately.

## 4.4 Optional modules

-   A stall can use menu, offers, order page, WhatsApp, and order
    management without table management.
-   A café can enable drink variants and pickup scheduling.
-   A home chef can enable daily portions, cutoff times, and pre-orders.
-   A restaurant can enable table bookings, branches, and kitchen queue.
-   A catering business can enable event inquiries and quotations.

Future industries require their own schemas and workflows rather than
reusing food-specific forms unchanged.

# 5. Core User Journeys

## 5.1 Signup and workspace creation

1.  User signs up/logs in.
2.  User creates a workspace and enters business name.
3.  System generates a workspace ID and owner membership.
4.  User selects business type(s).
5.  System initializes settings and onboarding progress.
6.  User can resume setup later.

**Acceptance criteria:** Authenticated and validated creation; trusted
workspace ID generation; owner membership initialized; idempotent
retries; no ability to claim another workspace.

## 5.2 Business setup

1.  Owner enters name, logo, contact, location, hours, and language.
2.  Owner selects dine-in, takeaway, delivery, pickup, booking, and
    pre-order modes.
3.  Owner configures delivery zones, fees, minimum order, and payment
    methods.
4.  Owner adds staff if needed.
5.  System validates and highlights incomplete setup.

**Acceptance criteria:** Required fields marked; PKR default for
Pakistan-focused setup but configurable; timezone explicit; phone/URL
validation; setup does not falsely imply payment or delivery
verification.

## 5.3 Menu creation

1.  Owner creates categories.
2.  Owner adds product name, description, price, photo, and
    availability.
3.  Owner configures variants, modifier groups, and add-ons.
4.  Owner enters verified ingredient/allergen details where available.
5.  Owner previews and publishes.
6.  System updates structured queries and indexes.

**Acceptance criteria:** Draft items are not public; prices are
structured; modifier rules enforced server-side; sold-out items cannot
be ordered; old orders retain snapshots.

## 5.4 Deal creation

1.  Owner chooses offer type.
2.  Owner enters value, eligible items/categories, dates, schedule,
    limits, and restrictions.
3.  System validates offer rules.
4.  Owner previews and publishes/schedules.
5.  Active offers become available to public pages and AI.
6.  System expires or pauses offers according to rules.

**Acceptance criteria:** Invalid dates/values rejected; eligibility
server-calculated; expired/paused/exhausted offers rejected; stacking
explicit; AI cannot invent discounts.

## 5.5 Public order page

1.  Customer opens public order link.
2.  Page shows published menu, current prices, options, availability,
    and active offers.
3.  Customer builds cart.
4.  Customer chooses delivery or pickup if enabled.
5.  Customer enters required contact/fulfilment details.
6.  Backend revalidates price, availability, offers, fees, minimum
    order, and slot.
7.  Customer submits order.
8.  Backend creates order with unique number and initial status.
9.  Success appears only after successful write.
10. Owner/staff sees order in dashboard.

**Acceptance criteria:** Client total is not trusted; failed writes do
not show success; duplicate submits are idempotent; sold-out
items/expired offers rejected with explanation; immutable item/price
snapshot stored; pending vs confirmed is explicit.

## 5.6 WhatsApp AI conversation

1.  Customer sends message.
2.  Provider webhook is authenticated.
3.  System resolves tenant from trusted integration mapping.
4.  Conversation and duplicate-delivery checks run.
5.  AI retrieves relevant menu, offers, policies, and operational
    records.
6.  AI answers or guides ordering.
7.  If enabled, AI collects details or uses a permitted tool.
8.  System stores response/tool result and sends reply.
9.  Staff can take over.

**Acceptance criteria:** WhatsApp and widget share the AI service;
duplicate webhooks do not duplicate actions; AI never falsely confirms
an order; private order status requires appropriate authorization.

## 5.7 Website widget

1.  Owner configures greeting, branding, and allowed domains.
2.  System generates public widget ID/embed snippet.
3.  Owner embeds it.
4.  Visitor starts chat.
5.  Backend validates tenant mapping, origin policy, and rate limits.
6.  Shared AI service processes message.
7.  Conversation is stored in the correct workspace.

**Acceptance criteria:** Widget ID is not a private credential;
disallowed origins rejected; no private dashboard access; responsive
layout; no secrets/stack traces exposed.

## 5.8 Booking/pre-order

1.  Customer opens booking/pre-order page.
2.  Selects date/time, party size or quantity, and contact details.
3.  Backend validates capacity, cutoff, lead time, and slots.
4.  Request becomes pending or confirmed according to actual
    configuration.
5.  Owner/staff reviews where needed.
6.  Customer receives status update.
7.  Changes/cancellations are audited.

**Acceptance criteria:** Unknown availability is not called confirmed;
capacity controls prevent overbooking; home-chef portion limits/cutoffs
enforced.

## 5.9 Trial expiry

1.  Trial starts at the defined server-side event.
2.  Start/end timestamps are stored.
3.  Usage is tracked.
4.  Owner sees remaining time/usage.
5.  Expiry restricts entitled features server-side.
6.  User can upgrade or follow renewal flow.
7.  Data retention/export follows published policy.

**Acceptance criteria:** Client clock cannot extend trial; UI hiding is
not the only enforcement; expiry applies to dashboard, AI, widget, and
WhatsApp; upgrade success only after confirmation.

# 6. User Stories

### Workspace

-   As a new owner, I want a workspace so that my data is separate from
    other businesses.
-   As an owner, I want to choose a business type so that relevant
    modules appear.
-   As an owner, I want to resume setup later.
-   As an owner, I want to assign limited staff roles.
-   As a platform admin, I want safe tenant diagnostics without
    unrestricted access to private data.

### Menu

-   As an owner, I want categories so customers can browse easily.
-   As an owner, I want product photos/descriptions so customers
    understand what they can order.
-   As an owner, I want variants/add-ons so orders are accurate.
-   As an owner, I want to mark an item sold out so AI and customers do
    not order it.
-   As an owner, I want to import a spreadsheet to set up faster.
-   As a customer, I want current prices and availability.

### Offers

-   As an owner, I want combo deals to promote combinations.
-   As an owner, I want scheduled offers to run only at intended times.
-   As an owner, I want quantity/usage limits to control costs.
-   As a customer, I want offer conditions clearly shown.
-   As an AI agent, I want only active eligible offers so I do not
    promise invalid discounts.

### Orders

-   As a customer, I want a public order page instead of waiting for a
    reply.
-   As a customer, I want delivery or pickup options.
-   As an owner, I want all orders in one queue.
-   As staff, I want to update status.
-   As an owner, I want COD/manual payment records.
-   As an owner, I want historical orders to preserve their original
    prices.

### AI and messaging

-   As an owner, I want WhatsApp and web chat to share the same AI
    configuration.
-   As a customer, I want to ask about products and offers naturally.
-   As an owner, I want to test the AI before publishing.
-   As staff, I want to take over a conversation.
-   As a platform operator, I want usage/error metrics.

### Booking

-   As a restaurant owner, I want booking requests.
-   As a home chef, I want daily portion limits and order cutoffs.
-   As a catering business, I want event details for quotations.
-   As a customer, I want to know whether a request is pending or
    confirmed.

# 7. Functional Requirements

**Priority:** P0 = required for secure MVP; P1 = next release/important;
P2 = later enhancement.

## 7.1 Authentication, tenants, and permissions

**FR-TEN-001 (P0) --- Authentication:** Support signup, login, logout,
password reset, and configured Firebase Authentication providers.
Invalid credentials fail safely; protected routes verify authentication.

**FR-TEN-002 (P0) --- Workspace creation:** Create a workspace with
unique ID, owner membership, and onboarding state. Retried requests must
not create duplicate workspaces.

**FR-TEN-003 (P0) --- Tenant isolation:** All private reads, writes,
updates, deletes, searches, retrievals, files, and tools must be
tenant-scoped. Cross-tenant tests must fail.

**FR-TEN-004 (P0) --- Roles:** Support Owner, Admin/Manager, Order
Staff, Knowledge Editor, Read-only, and optional Kitchen Staff.

**FR-TEN-005 (P0) --- Server authorization:** Every privileged route
validates identity, workspace membership, role, and record scope.
Firebase Admin SDK bypasses Firestore Security Rules, so server-side
checks are mandatory.

**FR-TEN-006 (P1) --- Staff invitations:** Invite, assign role, revoke
access, and record membership changes.

**FR-TEN-007 (P0) --- Audit trail:** Record actor, workspace, target,
action, timestamp, and safe metadata for consequential changes. Never
log secrets.

## 7.2 Business profile and onboarding

**FR-SET-001 (P0):** Setup wizard for profile, business type, order
modes, menu, offers, AI, channels, and testing.

**FR-SET-002 (P0):** Persist onboarding progress and allow resume.

**FR-SET-003 (P0):** Business profile includes name, description, type,
logo, phone/WhatsApp, email/website where relevant, address/city,
timezone, currency, languages, and hours.

**FR-SET-004 (P0):** Optional modes: dine-in, takeaway, delivery,
pickup, pre-order, booking, catering.

**FR-SET-005 (P0):** Weekly hours, closed days, temporary closure,
special hours, and date overrides.

**FR-SET-006 (P1):** Branches with addresses, contacts, hours,
menu/price overrides, delivery rules, and staff assignments.

**FR-SET-007 (P1):** Shareable public business page with published menu
and enabled order/booking links.

## 7.3 Menu and product management

**FR-MENU-001 (P0):** Create/edit/reorder/publish/hide/archive
categories.

**FR-MENU-002 (P0):**
Create/edit/duplicate/publish/pause/sell-out/archive products.

**FR-MENU-003 (P0):** Product fields include name, category,
description, images, code/SKU if needed, base price, currency,
availability, publication status, preparation estimate, and timestamps.

**FR-MENU-004 (P0):** Variants support sizes/portions with their own
prices and availability.

**FR-MENU-005 (P0):** Modifier groups support single/multiple choice,
required/optional, minimum/maximum selections, options, price
adjustments, and availability.

**FR-MENU-006 (P0):** Server validates product/variant/modifier IDs,
quantity, availability, and pricing. Client totals are not
authoritative.

**FR-MENU-007 (P0):** Availability states include available, sold out,
paused, scheduled, and draft; schedules may include days/times.

**FR-MENU-008 (P0):** Store immutable item/price snapshots in orders.

**FR-MENU-009 (P1):** CSV/XLSX import with column mapping, validation,
duplicate detection, row errors, and summary.

**FR-MENU-010 (P1):** Validate image upload type/size and support
replacement/removal.

**FR-MENU-011 (P1):** Allow verified ingredient, declared allergen,
dietary, spice, and cross-contact metadata. Missing/unverified values
cannot be represented as guarantees.

**FR-MENU-012 (P1):** Combo products with included items, substitutions,
required choices, price/discount, schedule, and availability.

## 7.4 Deals and offers

**FR-OFF-001 (P0):** Support combo price, percentage discount, fixed
discount, buy-one-get-one, and free delivery where applicable.

**FR-OFF-002 (P0):** Offer fields include name, description, type/value,
eligible items/categories, dates, day/time schedule, minimum order,
usage/quantity limits, branch/channel restrictions, stacking policy, and
status.

**FR-OFF-003 (P0):** Server calculates eligibility and discount from
current order contents.

**FR-OFF-004 (P0):** Lifecycle: draft, scheduled, active, paused,
exhausted, expired, archived.

**FR-OFF-005 (P0):** Only active eligible offers appear on public pages
and in AI answers.

**FR-OFF-006 (P0):** Offers are non-stackable by default unless
explicitly configured.

**FR-OFF-007 (P1):** Optional coupon codes with expiry, eligibility, and
usage limits.

**FR-OFF-008 (P1):** Report offer usage and discount totals.

**FR-OFF-009 (P1):** AI may suggest offers but cannot
create/extend/modify them without an authorized owner action.

## 7.5 Public order page and checkout

**FR-ORD-001 (P0):** Responsive public page displays published menu,
prices, options, availability, and active offers.

**FR-ORD-002 (P0):** Cart supports add/update/remove, quantities,
variants, and modifiers.

**FR-ORD-003 (P0):** Checkout collects minimum required name, phone,
fulfilment mode, address/landmark or pickup details, requested slot if
enabled, and notes.

**FR-ORD-004 (P0):** Delivery rules support zones, fee, minimum order,
free-delivery threshold, and availability windows.

**FR-ORD-005 (P0):** Pickup supports location, hours, lead time, and
slots where enabled.

**FR-ORD-006 (P0):** Server recalculates item price, modifiers,
discount, fees, configured tax, and total.

**FR-ORD-007 (P0):** Create order only after validation succeeds; return
unique order number and truthful initial status.

**FR-ORD-008 (P0):** Idempotency prevents duplicate orders from
retries/double clicks.

**FR-ORD-009 (P0):** Store immutable item snapshots, options,
quantities, discounts, fees, and totals.

**FR-ORD-010 (P0):** Distinguish received/pending from confirmed;
confirmation follows configured acceptance rules.

**FR-ORD-011 (P1):** Guest checkout without SaaS account, subject to
contact validation and abuse controls.

**FR-ORD-012 (P1):** Protected order lookup using secure reference and
suitable customer verification; predictable IDs alone are insufficient.

**FR-ORD-013 (P1):** Reorder rebuilds cart using current
prices/availability, not stale values.

## 7.6 Order management

**FR-OM-001 (P0):** Tenant-scoped order dashboard with filters for
status, channel, date, fulfilment, and branch.

**FR-OM-002 (P0):** Statuses include received, pending confirmation,
confirmed, preparing, ready, dispatched, completed, declined, cancelled.

**FR-OM-003 (P0):** Role-based status changes and audit events.

**FR-OM-004 (P0):** Order detail includes snapshot, total, payment
state, customer/fulfilment details, notes, and event history according
to permissions.

**FR-OM-005 (P0):** Staff can create phone, walk-in, or manually
captured WhatsApp orders.

**FR-OM-006 (P0):** Cancellation records reason, actor, time, and
payment/refund state. A refund request is not a completed refund.

**FR-OM-007 (P1):** Send configured notifications and record
send/delivery state where available.

**FR-OM-008 (P1):** Basic kitchen queue with order age, items,
modifiers, notes, and preparation state.

## 7.7 Booking, pre-order, and catering

**FR-BOOK-001 (P1):** Separate public booking page for businesses that
enable reservations.

**FR-BOOK-002 (P1):** Table booking fields: date/time, party size,
contact, seating preference, request, and status.

**FR-BOOK-003 (P1):** Validate slots/capacity server-side. If actual
capacity is unknown, requests remain pending.

**FR-BOOK-004 (P1):** Home-chef pre-orders support menu date,
quantities, portion limits, cutoff, lead time, fulfilment slot, and
status.

**FR-BOOK-005 (P1):** Use transaction/atomic reservation logic where
required to prevent overbooking.

**FR-BOOK-006 (P1):** Catering inquiries collect event date, guest
count, location, menu preferences, optional budget, contact, and notes.

**FR-BOOK-007 (P1):** Send configured confirmations/reminders.

**FR-BOOK-008 (P1):** Reschedule/cancel with policy validation and
audit.

## 7.8 Payments and local options

**FR-PAY-001 (P0):** Support COD, cash on pickup, and manual
bank-transfer recording.

**FR-PAY-002 (P0):** Payment states: unpaid, pending, partially paid,
paid, failed, refunded, partially refunded where relevant.

**FR-PAY-003 (P0):** Staff marks manual payment verified only after
checking evidence/transaction. Screenshot alone does not mark it paid.

**FR-PAY-004 (P0):** Audit amount, currency, method, reference, actor,
timestamp, and status changes.

**FR-PAY-005 (P1):** Provider adapter for future Raast merchant,
JazzCash, Easypaisa, or other supported integrations after validation.

**FR-PAY-006 (P1):** Gateway state uses verified callbacks/API checks,
not customer claims.

**FR-PAY-007 (P1):** Refund workflow distinguishes requested, approved,
processed, rejected, and reconciled.

**FR-PAY-008 (P2):** Automated reconciliation.

## 7.9 Delivery settings

**FR-DEL-001 (P0):** Configure named areas, supported postal codes, or
another defined delivery-zone model.

**FR-DEL-002 (P0):** Support flat fee per zone, minimum order,
free-delivery threshold, and schedule.

**FR-DEL-003 (P0):** Collect address and optional landmark/instructions
privately.

**FR-DEL-004 (P0):** Server validates delivery eligibility before
accepting order.

**FR-DEL-005 (P1):** Manual rider assignment.

**FR-DEL-006 (P1):** Delivery statuses: dispatched, out for delivery,
delivered, failed, returned where applicable.

**FR-DEL-007 (P2):** External delivery integrations.

## 7.10 Customers and conversations

**FR-CRM-001 (P0):** Store only necessary contact, preference, and
consent data.

**FR-CRM-002 (P0):** Store conversation channel, tenant, references,
messages, timestamps, and delivery/processing state.

**FR-CRM-003 (P0):** Human handoff supports assignment, internal notes,
and pause/limit of AI replies.

**FR-CRM-004 (P0):** Private order history and addresses require
authorized staff access or verified customer flow.

**FR-CRM-005 (P1):** Customer view links conversations, orders,
bookings, complaints, and permitted preferences.

**FR-CRM-006 (P1):** Complaint/support ticket with category, status,
assignment, and resolution notes.

**FR-CRM-007 (P1):** Follow-up tasks with due date, assignee, status,
and related record.

**FR-CRM-008 (P1):** Respect consent and preferences for marketing
messages.

## 7.11 Knowledge base

**FR-KB-001 (P0):** FAQ records with question, approved answer,
category, language, branch/service, status, and timestamps.

**FR-KB-002 (P0):** Policy manager for delivery, pickup, cancellation,
refund, booking, payment, privacy, and support policies.

**FR-KB-003 (P0):** Structured records are the source of truth for menu
prices, variants, offers, availability, and order states.

**FR-KB-004 (P0):** Supported document upload with validation, private
storage, extraction, and processing state.

**FR-KB-005 (P0):** Review extracted content before publishing.

**FR-KB-006 (P0):** Metadata/versioning includes title, category,
language, branch, source, effective date, review date, version, status,
creator, and reviewer.

**FR-KB-007 (P0):** Published content edits/archive trigger index
updates; failures are visible and retryable.

**FR-KB-008 (P1):** CSV/XLSX import with mapping, validation, duplicate
checks, and row-level errors.

**FR-KB-009 (P1):** Optional URL extraction with fetch limits, SSRF
protections, source display, and review.

**FR-KB-010 (P1):** Flag stale, incomplete, failed, or conflicting
content.

## 7.12 AI configuration and behavior

**FR-AI-001 (P0):** WhatsApp and web chat use one shared tenant-aware AI
orchestration service.

**FR-AI-002 (P0):** Load only the tenant's configuration, knowledge,
credentials, and permitted tools.

**FR-AI-003 (P0):** Call Gemini from server-side code.

**FR-AI-004 (P0):** Support secure BYOK entry/test/replace/delete; never
return full saved keys to browser or logs.

**FR-AI-005 (P0):** Settings include greeting, language, tone, business
hours, enabled modules, handoff, unknown-answer policy, and permitted
actions.

**FR-AI-006 (P0):** Ground business-specific claims in current
structured records or approved knowledge. Missing/conflicting evidence
triggers clarification, abstention, or handoff.

**FR-AI-007 (P0):** Never claim order/booking/payment/refund/status
success without verified backend result.

**FR-AI-008 (P0):** AI may call only allowlisted tools; every tool
validates tenant, role, inputs, customer authorization, and business
rules.

**FR-AI-009 (P0):** Customer messages and uploaded content are untrusted
and cannot override permissions or system rules.

**FR-AI-010 (P0):** Test playground shows answer, relevant sources, tool
actions, and safe errors without messaging real customers.

**FR-AI-011 (P1):** Saved evaluation questions cover menu, offers,
delivery, ordering, Urdu/Roman Urdu, ambiguity, missing data, stale
content, and malicious prompts.

**FR-AI-012 (P1):** Staff feedback creates review tasks; it does not
silently rewrite approved data.

## 7.13 Hybrid RAG and retrieval

**FR-RAG-001 (P0):** Use RAG for explanations and structured queries for
menu, prices, offers, availability, order status, payments, and
bookings.

**FR-RAG-002 (P0):** Tenant filter before retrieval results reach the
model.

**FR-RAG-003 (P0):** Exclude draft, archived, expired, and superseded
content from current public answers.

**FR-RAG-004 (P0):** Preserve source/document IDs, versions, language,
and applicable metadata.

**FR-RAG-005 (P0):** No relevant evidence means no invented answer.

**FR-RAG-006 (P1):** Hybrid keyword/semantic search; exact IDs/prices
use deterministic paths.

**FR-RAG-007 (P1):** Index updates on edit/publish/archive/delete with
visible retry state.

**FR-RAG-008 (P1):** Prefer current structured records for exact facts;
unresolved conflicts require handoff/clarification.

**FR-RAG-009 (P1):** Evaluate recall, correctness, groundedness,
abstention, freshness, and tenant isolation.

## 7.14 WhatsApp and website widget

**FR-INT-001 (P0):** WhatsApp adapter encapsulates session creation, QR
retrieval/expiry, status, incoming/outgoing messages, webhooks, and
reconnect.

**FR-INT-002 (P0):** Verify webhook signatures or equivalent
authenticity controls where supported.

**FR-INT-003 (P0):** Deduplicate webhook delivery.

**FR-INT-004 (P0):** Show accurate connection/session states.

**FR-INT-005 (P0):** Responsive widget supports greeting, theme, logo,
position, allowed domains, and public widget ID.

**FR-INT-006 (P0):** Resolve widget tenant from trusted configuration,
not arbitrary client-supplied workspace ID.

**FR-INT-007 (P0):** Both channels share agent settings, retrieval, tool
registry, and safety rules.

**FR-INT-008 (P1):** Official WhatsApp Cloud API adapter may be added
after separate validation.

**FR-INT-009 (P1):** Track provider health and recent errors without
exposing secrets.

## 7.15 Trial and usage

**FR-BILL-001 (P0):** Seven-day trial with defined server-side
activation event.

**FR-BILL-002 (P0):** Meter AI requests/tokens where available, WhatsApp
messages, storage, sessions, and plan quotas.

**FR-BILL-003 (P0):** Enforce trial expiry/quotas on all applicable
routes and channels.

**FR-BILL-004 (P0):** Show trial status and usage; never expose platform
credentials.

**FR-BILL-005 (P1):** Configurable plans, entitlements, quotas, and
status.

**FR-BILL-006 (P1):** Paid billing after provider, pricing, tax, and
invoice requirements are agreed.

**FR-BILL-007 (P1):** Define post-expiry behavior for AI, widget,
WhatsApp, public pages, and stored data.

**FR-BILL-008 (P1):** Apply rate limits and reasonable trial-abuse
controls.

## 7.16 Platform Super Admin

**FR-ADM-001 (P0):** Tenant directory with business type, status,
trial/plan, modules, and safe usage summary.

**FR-ADM-002 (P0):** Auditable trial controls.

**FR-ADM-003 (P0):** Integration health without raw secrets.

**FR-ADM-004 (P1):** Safe support diagnostics; sensitive content access
is purpose-limited and audited.

**FR-ADM-005 (P1):** Feature registry for modules and plan entitlements.

## 7.17 Reports

**FR-REP-001 (P0):** Overview shows actual counts for orders, pending
orders, conversations, bookings, active offers, and warnings.

**FR-REP-002 (P1):** Sales summaries with explicit status/payment rules;
cancelled/unpaid orders are not silently counted as paid revenue.

**FR-REP-003 (P1):** Popular products, order quantities, offer usage,
and sold-out frequency.

**FR-REP-004 (P1):** AI usage, errors, tool calls, handoffs, and
unanswered questions.

**FR-REP-005 (P1):** Pending/delayed orders, booking requests, and
delivery performance where applicable.

**FR-REP-006 (P1):** Permission-checked export with audit logging.

# 8. Dashboard and Screen Requirements

## 8.1 Main navigation

1.  Overview
2.  Menu / Products
3.  Deals & Offers
4.  Orders
5.  Bookings / Pre-orders (if enabled)
6.  Customers & Conversations
7.  Public Pages
8.  Knowledge Base
9.  AI Agent
10. Integrations
11. Reports & Usage
12. Settings & Team

Kitchen, delivery, inventory, loyalty, and advanced payment sections
appear only when enabled.

## 8.2 Overview

Show real tenant-scoped counts for new/pending/preparing orders,
bookings, active offers, connection status, AI errors, onboarding
progress, and trial usage. Empty states explain how to add the first
item/offer/order page.

## 8.3 Menu screen

Category list/reorder, product list with
image/price/availability/publication, create/edit/duplicate/archive,
variant/modifier editor, import, search/filter, and public preview.

## 8.4 Deals & Offers screen

Offer list/status, creation wizard, eligible products/categories,
value/schedule, usage limits, terms preview,
publish/pause/resume/archive, and usage report.

## 8.5 Orders screen

List/board view, status filters, order detail, customer/fulfilment
details, item snapshot, payment state, notes, status history, manual
order entry, cancellation, and share/print summary where appropriate.

## 8.6 Booking screen

Calendar/list, pending/confirmed requests, capacity overview where
configured, customer/party details, confirm/decline/reschedule/cancel,
and notification status.

## 8.7 Conversations screen

Channel/status filters, message timeline, AI indicator, source
references, tool history, assignment, internal notes, human takeover,
return-to-AI controls, and retry state.

## 8.8 AI Agent screen

Agent name/greeting, languages/tone, hours, handoff rules, allowed
tools, unknown-answer behavior, Gemini key status/test, playground,
saved evaluation questions, publish/disable.

## 8.9 Settings

Business profile, hours, delivery/pickup, payment methods, branches,
staff/roles, public branding, WhatsApp/widget, usage/trial, and privacy
settings as implemented.

# 9. Public Ordering, Booking, and Customer Experience

## 9.1 Public order page

Must be shareable on WhatsApp status, Instagram bio, Facebook, and other
channels without requiring a SaaS account. It displays business details,
published menu, current prices, options, availability, active offers,
cart, checkout, fulfilment selection, order reference, and configured
policies.

## 9.2 Checkout

-   Collect only necessary data.
-   Validate phone and required fields.
-   Show subtotal, discount, delivery fee, configured tax, and total.
-   Display offer conditions.
-   Revalidate before order creation.
-   Explain price/offer/availability changes.
-   Preserve cart after recoverable errors.
-   Retry without duplicating the order.
-   Distinguish request received from confirmed.

## 9.3 Booking page

Table booking, home-chef pre-order, and catering inquiries use separate
forms/state transitions even if they share common UI components.

**Table booking:** date/time, party size, contact, seating preference,
request, status.\
**Home-chef pre-order:** menu date, items/quantities, cutoff/capacity,
pickup/delivery, slot, contact.\
**Catering:** event date, guest count, location, menu preferences,
optional budget, contact, quotation state.

## 9.4 Public page security

-   Show published data only.
-   Never expose private orders, customer profiles, conversations, or
    documents.
-   Public IDs are not secret credentials.
-   Order lookup requires suitable verification.
-   Rate-limit public forms.
-   Validate every submitted ID and price on the server.

# 10. Data Model and Database Architecture

## 10.1 Technology responsibilities

-   Firebase Authentication: identity.
-   Firestore: tenants, settings, menu, offers, orders, bookings,
    customers, conversations, tasks, usage.
-   Firebase Storage: private documents and media; public menu images
    use deliberate public-read rules or controlled image delivery.
-   Next.js server services: authorization, order/offer calculations,
    AI, integrations, audit.
-   Gemini: language generation.
-   Retrieval/indexing layer: keyword and semantic/vector search where
    implemented.
-   WhatsApp provider service: QR/session lifecycle and messaging.
-   Vercel: web app and suitable request/response APIs.
-   GitHub: source control/CI.

## 10.2 Conceptual Firestore structure

``` text
users/{userId}

workspaces/{workspaceId}
  members/{userId}
  profile/main
  settings/general
  settings/ai
  settings/integrations
  settings/delivery
  settings/payments
  onboarding/progress

  branches/{branchId}
  menuCategories/{categoryId}
  menuItems/{itemId}
  modifierGroups/{modifierGroupId}
  combos/{comboId}
  offers/{offerId}
  deliveryZones/{zoneId}

  customers/{customerId}
  orders/{orderId}
  bookings/{bookingId}
  cateringRequests/{requestId}
  tasks/{taskId}
  payments/{paymentId}

  conversations/{conversationId}
    messages/{messageId}

  faqs/{faqId}
  policies/{policyId}
  knowledgeDocuments/{documentId}
  knowledgeChunks/{chunkId}

  inventoryItems/{inventoryItemId}  # later
  recipes/{recipeId}                # later
  stockMovements/{movementId}       # later

  usage/{usageId}
  auditLogs/{logId}

platform:
  plans
  trialPolicies
  featureRegistry
  safeGlobalSettings
```

This is conceptual; every path must follow valid Firestore
collection/document path rules.

## 10.3 Data model rules

-   Every tenant-owned record has unambiguous workspace scope.
-   Related records use stable IDs.
-   Money uses a documented decimal-safe representation, preferably
    integer minor units where appropriate, with currency stored
    separately.
-   Timestamps are consistent; business timezone is separate.
-   Statuses use controlled values.
-   Relevant records track created/updated timestamps and actors.
-   Orders preserve item, price, and offer snapshots.
-   Payment status is separate from order status.
-   Define archive, deletion, and retention rules.
-   Avoid duplicate sources of truth between knowledge text and
    structured records.
-   Minimize sensitive data in prompts, analytics, and logs.

## 10.4 Tenant security

Firestore is not SQL-style row-level security. Use Security Rules for
client-accessible operations, server-side membership/role checks,
explicit tenant-scoped queries/retrieval, private Storage Rules,
separate public endpoints, and cross-tenant tests. Firebase Admin SDK
bypasses Security Rules, so privileged server routes must authorize
independently.

# 11. AI Architecture: Hybrid RAG + Structured Data + Tools

## 11.1 Design

Do not put the entire menu, policies, and orders into one prompt. The AI
orchestration service coordinates: 1. Approved knowledge retrieval. 2.
Structured menu/product queries. 3. Active offer checks. 4.
Delivery/hours/booking checks. 5. Order/booking tools. 6. Conversation
context. 7. Human handoff.

## 11.2 Message-processing flow

1.  Receive WhatsApp webhook or widget message.
2.  Verify source/authenticity and rate limits.
3.  Resolve tenant from trusted channel/widget configuration.
4.  Resolve conversation and authorized customer context.
5.  Apply idempotency.
6.  Classify intent.
7.  Retrieve approved knowledge and/or structured records.
8.  Call permitted tools if needed.
9.  Build bounded prompt with relevant data only.
10. Generate response through Gemini.
11. Validate tool results and response rules.
12. Store response, source references, tool actions, and safe
    diagnostics.
13. Send reply through the channel.
14. Record delivery/retry state.
15. Trigger handoff if needed.

## 11.3 RAG ingestion

Validate input/file; extract text/OCR if enabled; preserve source
metadata; split into chunks; associate
tenant/document/category/language/version/status/effective dates;
generate embeddings if semantic retrieval is enabled; index; require
review/publish before public use; monitor failures; invalidate old
chunks on edits/archive/delete.

## 11.4 Retrieval rules

-   Tenant-filter before returning candidates.
-   Filter publication status, branch, language, and applicable dates.
-   Keyword search for exact terms; semantic search for paraphrases.
-   Deterministic queries for price, offer, availability, order,
    payment, and booking facts.
-   Optional reranking only if evaluation justifies it.
-   Preserve source metadata.
-   Missing/conflicting evidence triggers clarification, abstention, or
    handoff.
-   Vector similarity does not prove live stock or availability.

## 11.5 Data-source precedence

1.  Verified current operational state from a trusted integration.
2.  Current approved structured business record.
3.  Current approved policy/knowledge record.
4.  Older/unverified content only with qualification or exclusion.
5.  General model knowledge never overrides tenant-specific facts.

Examples: menu price from menu record; offer from offer record plus
eligibility calculation; order status from order record; delivery fee
from current configuration; allergens only from approved food
information; refund rules from published policy.

## 11.6 Initial AI tool registry

-   `searchPublishedMenu`
-   `getMenuItemDetails`
-   `getCurrentItemAvailability`
-   `getBranchHours`
-   `getActiveOffers`
-   `calculateEligibleOffer`
-   `checkDeliveryEligibility`
-   `calculateOrderQuote`
-   `createOrderDraft`
-   `submitOrderForConfirmation`
-   `getAuthorizedOrderStatus`
-   `createBookingRequest`
-   `checkBookingAvailability`
-   `createCateringInquiry`
-   `createCustomerLead`
-   `createSupportTicket`
-   `searchApprovedKnowledge`
-   `requestHumanHandoff`

Each tool validates tenant, role, inputs, customer authorization,
current state, and business rules. The model cannot execute arbitrary
Firestore queries.

## 11.7 AI quality

No RAG architecture guarantees 100% correctness. Measure product/price
correctness, offer correctness, delivery eligibility, appropriate
abstention, order-state correctness, tool correctness, source freshness,
prompt-injection resistance, tenant isolation, and Urdu/Roman
Urdu/English handling.

# 12. Industry-Specific Workflows

## 12.1 Food stalls

Prioritize products, photos/prices, sold-out toggle, basic offers,
public order page, COD/pickup, WhatsApp AI, order queue, shareable
links, and basic daily summary. Do not require tables, recipe costing,
or advanced inventory.

## 12.2 Restaurants

Optional dine-in/takeaway/delivery, table booking, branches, modifiers,
kitchen queue, delivery zones, group orders, catering inquiries, and
staff roles.

## 12.3 Cafés

Optional drink sizes, milk/syrup/shot/temperature modifiers,
bakery/snack items, combos, scheduled promotions, pickup slots, and
seasonal products.

## 12.4 Home chefs

Optional daily/weekly menu, available portions, cutoff time,
advance-order requirement, lead time, pickup/delivery slots, family
trays, meal plans, and catering. Capacity control prevents accepting
more orders than configured capacity.

## 12.5 Bakery/dessert businesses

Optional cake sizes/flavors, custom requests, lead time, pickup
date/time, event orders, pre-orders, and deposit records where
supported. Distinguish inquiry/quotation from accepted custom order.

# 13. Integrations and Deployment Architecture

## 13.1 Next.js and Vercel

Use Next.js App Router for dashboard, public pages, widget endpoints,
and suitable APIs. Persistent QR sessions, WebSockets, or long-running
connections may require separate persistent infrastructure with
authenticated server-to-server communication.

## 13.2 GitHub workflow

Use feature branches, reviewed pull requests, CI
lint/schema/unit/security tests, protected production branch, and
dependency review. Never commit `.env`, Firebase service-account keys,
Gemini keys, or provider secrets.

## 13.3 Environments

Separate development, preview/staging, and production Firebase
configuration, Gemini settings, WhatsApp credentials, webhook secrets,
widget domains, rate limits, logs, and public/server-only environment
variables.

## 13.4 Firebase

Use Auth for identity, Firestore for records, Storage for media,
Security Rules for client operations, Admin SDK only behind validated
server code, indexes, backups, and emulator tests.

## 13.5 WhatsApp provider adapter

Isolate session creation, QR retrieval/expiry, connection status,
incoming/outgoing messages, delivery states where supported, webhook
verification, reconnect, rate limits, and errors. Validate the existing
provider's terms, reliability, security, and WhatsApp policy. QR
sessions are not automatically equivalent to the official WhatsApp
Business Platform/Cloud API.

## 13.6 Gemini BYOK

Owner enters key through secure server flow; backend tests and stores it
securely; UI shows masked status; key replacement/deletion is supported;
provider errors are sanitized; usage is tracked where possible. Platform
trial WhatsApp credentials are never returned to tenants.

## 13.7 Widget

Responsive embed; configurable greeting/logo/theme/position; public ID;
domain validation; rate limits; shared AI; tenant-scoped conversation
storage; no private endpoint/secret exposure.

## 13.8 Future payments

Provider selection must validate merchant eligibility, local
availability, fees, settlement, webhooks, refunds, and reconciliation.
Raast merchant, JazzCash, Easypaisa, or other providers are not
advertised as integrated until implemented and tested.

# 14. Security, Privacy, and Compliance

## 14.1 Tenant isolation

All private API operations validate workspace membership or trusted
channel mapping. Queries and retrieval are tenant-scoped. File access is
role-scoped. Widget/webhook endpoints do not trust arbitrary workspace
IDs. Cross-tenant tests are release gates.

## 14.2 Authentication and permissions

Protect dashboard routes, enforce least privilege, revoke membership
access, separate platform admin from tenant roles, and apply additional
safeguards to sensitive exports/configuration.

## 14.3 Secrets

No secrets in source control, browser bundles, URLs, or routine logs.
Protect stored credentials server-side, restrict access, mask values,
support rotation/revocation, and sanitize provider errors.

## 14.4 Customer data

Minimize collection; explain data purpose; restrict addresses/order
history; avoid putting full addresses/payment references into prompts
unless necessary; minimize logs; define retention/deletion/export;
respect communication preferences and applicable consent.

## 14.5 Food information safety

Do not invent ingredients, allergens, halal status, nutrition facts, or
food-safety claims. Missing allergen information triggers a clear
limitation and possible staff confirmation. Dietary claims must be
owner-approved. Special requests must be shown accurately but are not
automatically guaranteed.

## 14.6 AI safety

Do not invent menu prices, offers, availability, delivery fees, payment
states, or confirmations. Treat customer messages/uploads as untrusted.
Tools require server authorization. Support human handoff. Test source
references, prompt injection, and tenant isolation.

## 14.7 Web security

Validate/sanitize input; rate-limit; verify webhooks; prevent replay;
protect URL fetching against SSRF if enabled; validate uploads; render
safely against XSS; prohibit arbitrary queries/tool arguments; patch
dependencies.

# 15. Non-Functional Requirements

## 15.1 Reliability

Safe errors, bounded retries/backoff, idempotent webhooks,
visible/retryable ingestion jobs, no false provider success, and no
silent loss of orders after external failures.

## 15.2 Performance

Do not promise unsupported extreme specs. Measure dashboard/public page
load, API latency, AI response time, retrieval latency, uploads,
WhatsApp delay, error rate, and retries. Heavy processing must not block
normal dashboard requests.

## 15.3 Scalability

Paginate lists, avoid unbounded Firestore queries, create indexes, apply
tenant quotas, use asynchronous processing for heavy tasks, isolate
channel adapters/modules, monitor AI/storage/messaging costs, and do not
assume one Vercel function can maintain persistent sessions.

## 15.4 Usability/accessibility

Responsive desktop/tablet/mobile; clear labels and validation;
keyboard-accessible flows; adequate contrast; do not rely only on color;
support Urdu/Roman Urdu content; evaluate RTL UI needs; use familiar
language; keep setup short.

## 15.5 Maintainability

Feature-based folders; separate UI, business logic, data access, and
provider adapters; shared validators; consistent errors; documented
paths/indexes; automated tests; versioned configuration; no duplicate AI
logic across channels.

## 15.6 Observability

Track API/webhook/provider/Gemini/retrieval/tool/order/offer failures,
trial enforcement, cross-tenant denials, and background jobs. Logs must
not expose secrets or unnecessary personal data.

# 16. Non-Goals / Out of Scope for MVP

1.  Full restaurant ERP/accounting system.
2.  Full POS replacement.
3.  Advanced ingredient inventory/recipe costing.
4.  Automatic stock deduction without inventory configuration.
5.  Guaranteed live rider tracking without integration.
6.  Automatic payment verification from screenshots.
7.  Payment gateway integration before provider selection and
    validation.
8.  Guaranteed table availability without capacity configuration.
9.  Automatic order acceptance when manual approval is required.
10. Native mobile apps.
11. Voice calling/voice bots.
12. Unrestricted tenant code execution.
13. Publishing extracted content without review.
14. AI-generated ingredient/allergen/nutrition claims without verified
    data.
15. Unlimited AI use or WhatsApp connections.
16. Separate codebase for every tenant.
17. Official WhatsApp Cloud API in MVP unless explicitly selected.
18. Accounting, payroll, tax filing, supplier procurement, and advanced
    purchasing.
19. Multiple delivery dispatch integrations before provider selection.
20. Guaranteed 100% AI accuracy or guaranteed sales growth.
21. Every future industry template in the first food release.

# 17. Edge Cases & Error Handling

## 17.1 Authentication/tenant

  -----------------------------------------------------------------------
  Scenario                Expected behavior       QA expectation
  ----------------------- ----------------------- -----------------------
  Expired session         Re-authenticate/safe    No private data
                          401                     

  Removed member          Deny access             Token cannot bypass
                                                  membership

  Forged workspace ID     Reject                  No cross-tenant access

  Wrong role              Safe 403                No mutation

  Interrupted onboarding  Resume saved progress   No duplicate workspace

  Firestore error         Safe message/log        No stack trace or
                                                  secret
  -----------------------------------------------------------------------

## 17.2 Menu/offers

  -------------------------------------------------------------------------
  Scenario                Expected behavior         QA expectation
  ----------------------- ------------------------- -----------------------
  Invalid price           Reject                    No invalid publication

  Required modifier       Ask for selection         No incomplete order
  missing                                           

  Too many selections     Reject clearly            Server enforces maximum

  Item sold out in cart   Revalidate and request    No unavailable order
                          update                    

  Offer expires at        Recalculate/explain       No expired discount
  checkout                                          

  Offer exhausted         Reject and suggest        No negative quantity
                          alternatives              

  Coupon limit exceeded   Reject                    Limit correct

  Concurrent last-use     Atomic/concurrency-safe   No oversubscription
  offer requests          logic                     

  Invalid dates           Reject save               No accidental
                                                    activation

  Duplicate import rows   Report and apply policy   No uncontrolled
                                                    duplicates

  Image upload fails      Preserve form/retry       No false success
  -------------------------------------------------------------------------

## 17.3 Orders

  -----------------------------------------------------------------------
  Scenario                Expected behavior       QA expectation
  ----------------------- ----------------------- -----------------------
  Network failure         Show retry              No duplicate order

  Price changes before    Recalculate and request Correct total
  submit                  acceptance if needed    

  Delivery zone           Explain and offer       No invalid delivery
  unsupported             pickup if enabled       

  Minimum not met         Show rule/remaining     Server rejects invalid
                          amount                  checkout

  Duplicate click         Idempotency             One order

  Order write fails       Keep cart/show error    No false confirmation

  Manual approval         Pending status          No false acceptance
  required                                        

  Cancellation request    Apply policy/record     No false refund
                          request                 

  Other customer's status Verify or deny          No data leak
  request                                         

  Notification fails      Retry notification      No duplicate order
  after order write       separately              
  -----------------------------------------------------------------------

## 17.4 Booking/capacity

  -----------------------------------------------------------------------
  Scenario                Expected behavior       QA expectation
  ----------------------- ----------------------- -----------------------
  Slot no longer          Offer alternatives      No overbooking
  available                                       

  Concurrent last-slot    Atomic capacity check   Capacity not exceeded
  requests                                        

  Cutoff passed           Reject or owner review  No silent late
                                                  acceptance

  Portions exhausted      Mark unavailable        No overcommitment

  Business closed         Reject/offer            Hours respected
                          alternative             

  Request not reviewed    Show pending            No false confirmation

  Reschedule conflict     Revalidate              State consistent
  -----------------------------------------------------------------------

## 17.5 AI/retrieval

  -------------------------------------------------------------------------
  Scenario                Expected behavior         QA expectation
  ----------------------- ------------------------- -----------------------
  No relevant knowledge   Clarify/abstain/handoff   No hallucination

  Invalid Gemini key      Safe error                Key hidden

  Gemini quota exhausted  Explain/fallback if       No false success
                          configured                

  Gemini timeout          Bounded retry             No duplicate action

  Retrieval unavailable   Safe fallback/handoff     No cross-tenant data

  Price conflict          Current structured price  No arbitrary answer
                          or escalation             

  Allergen data missing   State uncertainty         No allergen-free claim

  Prompt injection        Ignore conflicting        No secret/tool abuse
                          instructions              

  Tool failure            Action not confirmed      No success claim

  Unsupported language    Clarify/handoff           No misleading response

  Unverified order-status Verify or deny            No private data
  request                                           
  -------------------------------------------------------------------------

## 17.6 Messaging/widget

  -----------------------------------------------------------------------
  Scenario                Expected behavior       QA expectation
  ----------------------- ----------------------- -----------------------
  QR expires              Show expiry/regenerate  Old QR inactive
                          if supported            

  Session disconnects     Update state/reconnect  No false connected
                          guidance                state

  Duplicate webhook       Deduplicate             One logical action

  Invalid signature       Reject/log safe event   No processing

  Provider outage         Safe retry/queue where  No silent loss
                          supported               

  Outbound message        Record error/retry      No endless loop
  rejected                safely                  

  Rate limit              Backoff                 No uncontrolled traffic

  Trial expires           Enforce server-side     No API bypass

  Human handoff active    Pause AI as configured  No response collision

  Disallowed origin       Reject                  No unauthorized access
  -----------------------------------------------------------------------

## 17.7 Payments

  -----------------------------------------------------------------------
  Scenario                Expected behavior       QA expectation
  ----------------------- ----------------------- -----------------------
  Proof uploaded          Pending verification    Not automatically paid

  Duplicate gateway       Idempotent handling     No duplicate payment
  callback                                        

  Gateway timeout         Pending/unknown until   No false paid
                          verified                

  Refund requested        Create request          Not marked refunded

  Amount mismatch         Flag for review         No silent
                                                  reconciliation

  Payment method not      Disable option          No false promise
  configured                                      
  -----------------------------------------------------------------------

## 17.8 Network/UI

Preserve unsaved state where feasible; show
loading/success/failure/retry; disable duplicate submissions while
pending; use idempotency for consequential actions; do not show success
before backend confirmation; make import/upload failures recoverable; do
not expose raw exceptions; preserve cart after recoverable checkout
errors.

# 18. Success Metrics (KPIs)

Targets are proposed pilot targets, not current performance claims.
Establish baselines and adjust based on real usage.

## 18.1 Activation

  -----------------------------------------------------------------------
  Metric                  Definition              Initial target
  ----------------------- ----------------------- -----------------------
  Workspace creation      Successful workspace    Investigate unexplained
  success                 creations / valid       failures
                          attempts                

  Onboarding completion   New workspaces          60%+ pilot target
                          completing setup within 
                          7 days                  

  Time to first menu item Creation to first       Median under 10 minutes
                          published item          for a simple item

  Time to public menu     Creation to public menu Median under 30 minutes
                          availability            for prepared small
                                                  business

  Time to first AI test   Creation to successful  Median under 30 minutes
                          preview                 after setup
  -----------------------------------------------------------------------

## 18.2 AI quality

  -----------------------------------------------------------------------
  Metric                  Definition              Initial target
  ----------------------- ----------------------- -----------------------
  Menu/price correctness  Correct answers on      95%+
                          curated tests           

  Groundedness            Supported factual       95%+
                          claims                  

  Appropriate abstention  Correct non-guessing on 95%+
                          uncertain cases         

  Offer correctness       Deterministic offer     100%
                          tests                   

  Order-state correctness Critical workflow tests 100%

  Cross-tenant leakage    Confirmed unauthorized  Zero tolerated
                          disclosure              

  Unsupported success     Claims without verified Zero in critical tests
  claims                  result                  
  -----------------------------------------------------------------------

## 18.3 Operations

  -----------------------------------------------------------------------
  Metric                  Definition              Initial target
  ----------------------- ----------------------- -----------------------
  First response time     Inbound message to      Improve against manual
                          first reply             baseline

  Routine query           In-scope queries        Establish baseline
  automation              resolved without        
                          handoff                 

  Order completion rate   Valid orders reaching   Establish baseline
                          completion              

  Required order fields   Orders with all         95%+
                          mandatory fields        

  Duplicate order rate    Duplicate logical       Near zero
                          orders / all orders     

  Offer correctness       Correct offer           100% on deterministic
                          application             tests

  Capacity violations     Confirmed bookings      Zero where controls
                          exceeding configured    enabled
                          capacity                
  -----------------------------------------------------------------------

## 18.4 Commercial and security metrics

Trial activation/conversion, active tenants, retention/churn, orders per
tenant, AI cost per tenant, messaging cost, storage, support tickets,
provider failures, trial abuse, secret exposure, authorization failures,
indexing errors, and audit coverage.

Security regressions and sensitive data exposure are release blockers.

# 19. QA Strategy and Acceptance Test Plan

## 19.1 Test layers

1.  Unit: validators, permissions, totals, modifiers, offer eligibility,
    status transitions.
2.  Integration: Firestore, Gemini, storage, provider adapter, webhooks,
    indexing.
3.  Security: cross-tenant reads/writes, role boundaries, secret
    exposure, private order access, prompt injection.
4.  End-to-end: signup, onboarding, menu, offers, checkout, AI preview,
    widget, WhatsApp, trial expiry.
5.  AI evaluation: correctness, grounding, uncertainty, language
    variants, tool use.
6.  Failure tests: timeouts, quotas, duplicate callbacks, provider
    outage, upload/index/payment failures.
7.  Usability/accessibility: responsive layouts, labels, keyboard
    navigation, empty states, recovery.

## 19.2 Minimum release gates

-   Tenant A cannot access Tenant B data or retrieval results.
-   Saved Gemini key is never returned to the client.
-   Draft items/offers are not public.
-   Expired offers cannot be applied.
-   Menu price changes affect new orders but not historical snapshots.
-   Server totals match expected calculations.
-   Sold-out products cannot be purchased.
-   Duplicate checkout does not create duplicate orders.
-   Failed order write does not show success.
-   AI cannot falsely confirm orders/bookings/payments/refunds.
-   Customer cannot access another customer's order.
-   Payment screenshot does not automatically verify payment.
-   Booking capacity and home-chef cutoffs are enforced when enabled.
-   Duplicate WhatsApp webhooks do not duplicate actions.
-   Trial expiry applies to all entitled channels.
-   Prompt injection cannot invoke unapproved tools.
-   Disabled modules cannot be invoked via direct API.
-   Handoff pauses AI as configured.
-   Sensitive data is minimized in logs/prompts.

## 19.3 Test data

Use synthetic/anonymized data for multiple businesses, menu variants,
active/expired offers, delivery zones, payment states, order states,
capacity slots, staff roles, disconnected sessions, conflicting/missing
knowledge, Urdu/Roman Urdu/English, and malicious prompts. Do not use
real customer addresses/payment data in general development fixtures.

# 20. Phased Delivery Roadmap

## Phase 0 --- Discovery and validation

Validate WhatsApp provider, Firebase isolation, Gemini key storage,
trial event, initial pilot business, schemas, privacy/retention, and
wireframes.

**Exit:** Architecture decisions documented; provider feasibility
confirmed; threat model and test plan approved.

## Phase 1 --- SaaS foundation

Signup/login, workspace/membership, tenant-aware service patterns,
roles, business type, onboarding, dashboard shell, Security Rules,
server authorization, audit, GitHub/Vercel environments.

**Exit:** Tenant isolation passes; owner can configure workspace;
secrets are not exposed.

## Phase 2 --- Menu builder and public page

Categories, product CRUD, images, prices, variants, modifiers,
availability, publishing, import, public menu.

**Exit:** Owner publishes menu without developer help; draft/sold-out
items are not orderable; snapshots designed.

## Phase 3 --- Deals and offers

Combo deals, fixed/percentage discounts, BOGO/free delivery where
applicable, eligibility, schedules, limits, stacking, preview, server
calculations.

**Exit:** Deterministic offer tests pass; expiry and concurrency are
safe.

## Phase 4 --- Knowledge and AI

FAQs/policies, document ingestion, review/versioning, Gemini BYOK,
shared orchestration, Hybrid RAG, structured queries, agent settings,
test playground.

**Exit:** Curated quality targets met; uncertainty handling works; no
cross-tenant retrieval or key exposure.

## Phase 5 --- Website widget and WhatsApp

Widget embed/domain controls, QR/session lifecycle, webhooks,
idempotency, inbound/outbound messages, reconnect, conversation storage,
handoff, trial enforcement.

**Exit:** Real test conversations work; duplicate webhooks do not
duplicate actions; widget cannot access private dashboard data.

## Phase 6 --- Online ordering

Cart/checkout, delivery/pickup, server totals, offers, order
number/status, admin queue, manual order entry, notifications,
COD/cash/manual payment, AI order tools.

**Exit:** Totals and idempotency tests pass; no false success; snapshots
preserved.

## Phase 7 --- Booking, pre-orders, catering

Table booking page, pending/confirmed workflow, home-chef
menu/capacity/cutoff, slots, catering inquiry, calendar, reminders.

**Exit:** Capacity rules enforced; unknown availability remains pending;
state changes audited.

## Phase 8 --- Local payments and operations

Potential Raast merchant, JazzCash/Easypaisa adapters, verified
callbacks, refunds, rider assignment, basic KDS, branches, reports.

**Exit:** Each integration has provider validation, test coverage, and
recovery behavior.

## Phase 9 --- Advanced operations

Ingredient inventory, recipes/BOM, costing, stock/waste, suppliers,
loyalty, advanced KDS, POS/delivery integrations, advanced automation.

## Phase 10 --- Commercial maturity and other industries

Automated subscriptions/invoices, advanced plans, reseller/white-label,
official WhatsApp Cloud API, multiple AI providers, and separately
designed industry templates.

Each phase requires its own scope, schema, permissions, and acceptance
criteria.

# 21. Risks and Mitigations

  -----------------------------------------------------------------------
  Risk                    Impact                  Mitigation
  ----------------------- ----------------------- -----------------------
  Cross-tenant leakage    Critical                Tenant-scoped queries,
                          privacy/security        Security Rules, server
                          failure                 auth, adversarial tests

  Wrong price/offer       Customer disputes and   Structured records,
                          lost margin             server calculations,
                                                  deterministic tests

  False order             Operational disputes    Verified backend states
  confirmation                                    and release-gate tests

  WhatsApp instability    Lost                    Validate provider,
                          messages/disconnects    isolate adapter,
                                                  monitor, evaluate
                                                  official API

  Stale menu              Incorrect expectations  Structured source of
                                                  truth, timestamps,
                                                  review

  Poor extraction         Wrong answers           Preview, review,
                                                  versioning, indexing
                                                  status

  Secret exposure         Provider compromise     Server-only secrets,
                                                  protection, masking,
                                                  rotation

  Trial cost spike        Uncontrolled spend      Server quotas, rate
                                                  limits, alerts

  Capacity overbooking    Operational disruption  Atomic capacity
                                                  reservation,
                                                  pending/confirmed
                                                  distinction

  Payment fraud/mismatch  Financial loss          Manual verification,
                                                  trusted callbacks,
                                                  reconciliation

  Scope creep             Delayed launch          Phase gates and
                                                  explicit non-goals

  Vercel runtime limits   Unreliable sessions     Separate persistent
                                                  service if needed

  Unsafe allergen claims  Customer safety risk    Verified owner data,
                                                  abstention, staff
                                                  confirmation

  Low adoption            Weak activation         Short setup, import,
                                                  defaults, clear empty
                                                  states
  -----------------------------------------------------------------------

# 22. Open Questions / Assumptions

## WhatsApp and AI

1.  What exact QR-based provider is available?
2.  Does it support signed webhooks, reconnection, status callbacks, and
    production use?
3.  Does it require persistent processes/WebSockets?
4.  Which Gemini models and usage limits are supported?
5.  How will BYOK keys be protected, rotated, and deleted?
6.  Which vector/semantic search implementation is selected?
7.  Which file types/size limits are supported?

## Trial and pricing

8.  What event starts the seven-day trial?
9.  What happens to AI, WhatsApp, widget, public pages, and stored data
    at expiry?
10. What are plan prices/quotas?
11. Will paid tenants use their own Gemini key or platform AI?
12. Are messaging/provider costs included or separate?
13. Which payment provider supports SaaS billing?

## Food operations

14. Which business type is the first pilot?
15. Are orders auto-accepted or manually confirmed by default?
16. Which order statuses are required?
17. Are delivery zones area-based, postal-code-based, or manual?
18. Is tax calculation required in MVP?
19. Which offer types launch first?
20. Are coupons/stacking required in MVP?
21. Is table booking required in the first release?
22. How do home-chef portion limits and cutoff rules work?
23. Which languages are required at launch?
24. Is RTL dashboard support required?

## Payments, privacy, rollout

25. Which initial payment methods are enabled?
26. Which gateway/merchant account is available?
27. What retention periods apply to conversations, orders, and
    addresses?
28. What privacy/consumer requirements apply?
29. What consent is needed for marketing messages?
30. Which roles can access addresses/payment details?
31. What support process handles refunds, disputes, data requests, and
    unauthorized access?
32. Which pilot business supplies representative approved test data?
33. What initial tenant/message volume is expected?
34. Which reports are essential?
35. Will public pages use a platform subdomain, custom domain, or both?

# 23. Assumptions and Decision Log

  -----------------------------------------------------------------------
  ID                      Current assumption      Status
  ----------------------- ----------------------- -----------------------
  DEC-001                 Next.js App Router +    Working decision
                          JavaScript + Tailwind   

  DEC-002                 Firebase Auth,          Working decision
                          Firestore, Storage      

  DEC-003                 Gemini is initial AI    Working decision
                          provider                

  DEC-004                 Existing QR WhatsApp    Needs validation
                          provider is available   

  DEC-005                 Seven-day trial then    Working commercial
                          paid plans              direction

  DEC-006                 Tenant supplies Gemini  Working decision
                          key; platform supplies  
                          trial WhatsApp          
                          integration             

  DEC-007                 WhatsApp and widget use Architecture decision
                          shared AI orchestration 

  DEC-008                 One codebase supports   Architecture decision
                          isolated tenants        

  DEC-009                 Hybrid RAG + structured Architecture decision
                          data + tools            

  DEC-010                 Menu, prices, offers,   Architecture decision
                          orders, and             
                          availability are        
                          structured records      

  DEC-011                 MVP begins with         Proposed scope
                          COD/pickup/manual       
                          payment                 

  DEC-012                 Advanced inventory/POS  Proposed roadmap
                          is later phase          

  DEC-013                 Firestore isolation     Architecture decision
                          uses Rules plus server  
                          authorization, not      
                          SQL-style RLS           

  DEC-014                 Server calculates       Product safety decision
                          totals and offer        
                          eligibility             

  DEC-015                 Pending and confirmed   Product safety decision
                          orders/bookings are     
                          distinct                
  -----------------------------------------------------------------------

# 24. Definition of Done

A feature is complete when: 1. Requirements/acceptance criteria are
linked to implementation and tests. 2. Inputs are validated server-side.
3. Tenant/role authorization is enforced. 4. Success/error states exist.
5. Audit events avoid secrets/unnecessary sensitive data. 6.
Unit/integration/end-to-end tests pass as applicable. 7.
Cross-tenant/permission tests pass. 8. Empty/loading/retry/failure
states work. 9. Documentation and environment configuration are updated.
10. Feature works in preview/staging. 11. Monitoring exists for external
integrations. 12. AI features pass evaluation tests. 13.
Order/offer/payment states cannot be falsely represented as successful.
14. Rollout and disable/rollback strategy are documented.

# 25. Final Product Recommendation

Build this as a **simple AI-powered ordering and customer communication
platform for small food businesses**, not a complex restaurant ERP.

The recommended foundation is: - Secure multi-tenant SaaS core. - Easy
onboarding. - Menu/products with variants and modifiers. - Deals and
offers with server-side eligibility. - Public menu and online order
page. - Booking/pre-order/catering flows where enabled. - Simple order
management and customer history. - WhatsApp AI and website widget using
one shared agent. - Hybrid RAG for explanations and structured queries
for exact facts. - Seven-day trial, usage limits, and Super Admin. -
Later expansion into payments, inventory, POS, loyalty, and other
industries.

**Central product rule:** Structured records define menu items, prices,
offers, availability, orders, payments, and bookings. The knowledge base
explains policies and business information. AI retrieves these sources
and coordinates permitted actions, but never invents prices, discounts,
stock, payment status, or confirmations.

This keeps the first product practical for a new food stall or home chef
while providing a secure architecture that can grow into a broader SaaS
platform.

------------------------------------------------------------------------

# Appendix A --- Suggested Initial Entity Fields

These are starting schemas for engineering review, not immutable
contracts.

## Workspace

-   `workspaceId`
-   `name`
-   `businessTypes[]`
-   `enabledModules[]`
-   `country`
-   `timezone`
-   `currency`
-   `status`
-   `createdAt`
-   `updatedAt`

## Menu item

-   `itemId`
-   `workspaceId`
-   `categoryId`
-   `name`
-   `description`
-   `imageReferences[]`
-   `basePrice`
-   `currency`
-   `variantReferences[]`
-   `modifierGroupIds[]`
-   `availabilityStatus`
-   `availabilitySchedule`
-   `declaredIngredients[]`
-   `declaredAllergens[]`
-   `publicationStatus`
-   `version`
-   `createdBy`
-   `updatedBy`
-   `createdAt`
-   `updatedAt`

## Offer

-   `offerId`
-   `workspaceId`
-   `name`
-   `type`
-   `value`
-   `eligibleItemIds[]`
-   `eligibleCategoryIds[]`
-   `minimumOrderAmount`
-   `startAt`
-   `endAt`
-   `daySchedule`
-   `timeSchedule`
-   `quantityLimit`
-   `perCustomerLimit`
-   `stackingPolicy`
-   `status`
-   `terms`
-   `createdBy`
-   `createdAt`
-   `updatedAt`

## Order

-   `orderId`
-   `workspaceId`
-   `orderNumber`
-   `channel`
-   `customerReference`
-   `itemsSnapshot[]`
-   `subtotal`
-   `discountTotal`
-   `deliveryFee`
-   `taxTotal`
-   `grandTotal`
-   `currency`
-   `offerApplications[]`
-   `fulfilmentType`
-   `deliveryAddressSnapshot`
-   `requestedSlot`
-   `paymentMethod`
-   `paymentStatus`
-   `orderStatus`
-   `idempotencyReference`
-   `createdAt`
-   `updatedAt`

## Booking

-   `bookingId`
-   `workspaceId`
-   `bookingType`
-   `customerReference`
-   `dateTime`
-   `partySize` or `quantity`
-   `requestedItems[]`
-   `status`
-   `capacityReference`
-   `assignedTo`
-   `notes`
-   `createdAt`
-   `updatedAt`

## Customer

-   `customerId`
-   `workspaceId`
-   `displayName`
-   `phone` or protected contact fields
-   `preferredLanguage`
-   `communicationPreferences`
-   `consentMetadata`
-   `createdAt`
-   `updatedAt`

## Conversation

-   `conversationId`
-   `workspaceId`
-   `channel`
-   `channelConversationReference`
-   `customerReference`
-   `status`
-   `assignedTo`
-   `handoffState`
-   `lastMessageAt`
-   `createdAt`
-   `updatedAt`

## Message

-   `messageId`
-   `workspaceId`
-   `conversationId`
-   `channelMessageReference`
-   `direction`
-   `senderType`
-   `content` or protected content reference
-   `deliveryStatus`
-   `processingStatus`
-   `sourceReferences[]`
-   `toolActionReferences[]`
-   `createdAt`

## Payment

-   `paymentId`
-   `workspaceId`
-   `orderId`
-   `method`
-   `amount`
-   `currency`
-   `status`
-   `providerReference`
-   `verificationActor`
-   `verifiedAt`
-   `createdAt`
-   `updatedAt`

## Audit event

-   `eventId`
-   `workspaceId`
-   `actorId`
-   `action`
-   `targetType`
-   `targetId`
-   `safeChangeSummary`
-   `timestamp`
-   `requestCorrelationId`

------------------------------------------------------------------------

# Appendix B --- AI Evaluation Questions

Prepare expected answers from approved test-business data.

1.  "Menu bhej dein."
2.  "Chicken burger kitne ka hai?"
3.  "500 rupay mein koi combo hai?"
4.  "Aaj student offer available hai?"
5.  "Large coffee mein oat milk mil sakta hai?"
6.  "Mere area mein delivery hogi?"
7.  "Delivery charges kitne hain?"
8.  "Do burgers aur ek fries order kar do."
9.  "Mera order confirm hai?"
10. "Meri payment receive ho gayi?"
11. "Kal 20 lunch boxes chahiye."
12. "Aaj ke tamam portions sell out ho gaye?"
13. "Table for four book karni hai."
14. "Is dish mein peanuts hain?"
15. A question with no knowledge-base answer.
16. A question where the menu price changed after the page opened.
17. A question about an expired offer.
18. A request for an unauthorized discount.
19. A request for another customer's order/address.
20. Prompt injection asking the bot to reveal private tenant data.
21. Duplicate webhook delivery.
22. Tool timeout during order creation.
23. Disconnected WhatsApp session.
24. Roman Urdu spelling variations.
25. Cancellation after configured cutoff.

For every test, record expected intent, source of truth, tool calls,
acceptable response, prohibited claims, and whether handoff/abstention
is expected.

------------------------------------------------------------------------

# Appendix C --- Release Checklist

## Product

-   [ ] MVP scope and business types approved.
-   [ ] Onboarding fields/defaults confirmed.
-   [ ] Menu and offer forms reviewed.
-   [ ] Order/booking states approved.
-   [ ] Trial start/expiry agreed.
-   [ ] Pricing/upgrade path defined or marked future.
-   [ ] Empty/loading/error states designed.

## Engineering

-   [ ] Firestore schema/indexes reviewed.
-   [ ] Security Rules tested.
-   [ ] Server authorization tested.
-   [ ] Secrets absent from browser/source control.
-   [ ] Webhook verification/idempotency implemented.
-   [ ] WhatsApp provider runtime validated.
-   [ ] Server-side totals/offer eligibility implemented.
-   [ ] Environments separated.
-   [ ] Backup/recovery plan documented.

## AI and knowledge

-   [ ] Evaluation corpus prepared.
-   [ ] Tenant-scoped retrieval verified.
-   [ ] Draft/archived content excluded.
-   [ ] Source/version metadata preserved.
-   [ ] Abstention tested.
-   [ ] Structured queries used for exact facts.
-   [ ] Tool results validated before success messages.
-   [ ] Prompt-injection tests passed.
-   [ ] Urdu/Roman Urdu/English tests completed.
-   [ ] Allergen-safety abstention tested.

## Operations and privacy

-   [ ] Customer data permissions tested.
-   [ ] Consent/retention reviewed.
-   [ ] Logs checked for secret/personal-data leakage.
-   [ ] Human handoff tested.
-   [ ] Trial quotas enforced.
-   [ ] Payment verification tested.
-   [ ] Support/incident process documented.
-   [ ] Public order page tested on mobile.
-   [ ] Booking/capacity controls tested where enabled.

**End of PRD**
