# Food Business SaaS --- Product Vision

**File:** `0_vision.md`\
**Status:** Planning baseline\
**Version:** 1.0\
**Product scope:** Food businesses first\
**Last updated:** 2026-10-19

## 1. Product Vision

Build a simple, secure, multi-tenant AI platform that helps small and
mid-sized food businesses manage customer questions through their
website and WhatsApp using one business-specific Gemini AI agent and one
approved source of business knowledge.

The product should let a restaurant, café, food stall, bakery, takeaway
shop, cloud kitchen, or home chef publish accurate menu information,
answer common questions, share current offers, and guide customers
toward ordering without maintaining separate chatbot systems for each
channel.

The first release is food-business-focused. The architecture should
remain modular enough to support other service industries in a later
phase, but travel agencies, dental clinics, and unrelated verticals are
not part of the initial food-business MVP.

## 2. Problem

Small food businesses commonly manage customer questions and orders
through personal WhatsApp accounts, social media, phone calls, and
manual notes. The same questions are answered repeatedly:

-   What is on the menu?
-   What are today's prices and offers?
-   Is an item available?
-   Do you deliver to my area?
-   What are the delivery charges and opening hours?
-   Can I place an order for pickup or a later time?
-   What is the status of my order?

A website chatbot and a WhatsApp chatbot are often configured
separately. This duplicates setup, content maintenance, integration
work, and ongoing costs. When menu prices or business policies change,
one channel may show stale information. Generic chatbots may also invent
prices, discounts, availability, or order confirmations if they are not
grounded in trusted business data.

## 3. Target Users

### Primary users

-   Small and mid-sized restaurant owners.
-   Café and coffee-shop owners.
-   Food stall and takeaway owners.
-   Bakery and dessert-shop owners.
-   Home chefs and home kitchens.
-   Cloud kitchens and small catering businesses.

### Secondary users

-   Business managers and customer-support staff.
-   Kitchen/order staff who need structured order information.
-   SaaS platform administrators responsible for tenant operations.

### Customer-facing users

People who ask questions or place order/booking requests through a
business's website widget or connected WhatsApp channel.

## 4. Core Value Proposition

**One tenant-aware Gemini AI agent, one approved knowledge layer,
multiple customer channels.**

The same AI service powers: 1. Website chat widget. 2. WhatsApp chatbot.

Both channels must use the same business configuration, retrieval rules,
approved knowledge, menu/offer data access, permitted actions, and
safety rules. Channel-specific code should only normalize incoming
events and deliver outgoing messages; it must not contain a separate
copy of the AI business logic.

The platform should provide: - Simple tenant onboarding. - Food-business
profile and opening hours. - Structured menu, categories, prices,
variants, modifiers, and availability. - Deals and offers with
server-side eligibility checks. - Approved FAQs and business policies. -
Public menu/order page foundations. - Optional ordering, booking,
pre-order, and catering workflows. - Human handoff when the AI cannot
safely answer. - Tenant-level usage and integration status.

## 5. Product Principles

1.  **Food-business-first:** Solve real menu, offer, availability,
    delivery, and order questions before expanding into unrelated
    industries.
2.  **Single AI engine:** Website and WhatsApp must call the same shared
    orchestration service.
3.  **Structured data is the source of truth:** Prices, offers,
    availability, orders, payments, and bookings must not depend solely
    on free-text documents.
4.  **No invented business facts:** If data is missing, stale, or
    conflicting, ask a question, state the limitation, or hand over to
    staff.
5.  **No false confirmations:** The AI may say an order or booking is
    confirmed only after the backend returns the applicable confirmed
    state.
6.  **Secure multi-tenancy:** A tenant must never read or influence
    another tenant's private data, credentials, knowledge,
    conversations, or tools.
7.  **Owner-friendly setup:** Non-technical owners should be able to
    configure the basics without writing code.
8.  **Human control:** Business owners control published knowledge,
    integrations, enabled actions, and handoff behavior.
9.  **Measured performance:** Product metrics must be measured and
    reported rather than claimed without evidence.
10. **Phased delivery:** Build the secure foundation before advanced
    POS, inventory, payment, or multi-industry features.

## 6. Success Metrics

These are initial product targets to validate during pilot testing, not
guarantees.

  -----------------------------------------------------------------------
  Metric                  Initial target          Measurement rule
  ----------------------- ----------------------- -----------------------
  Tenant onboarding       5 minutes or less for a Median time from
                          prepared test business  workspace creation to a
                                                  published basic
                                                  profile/menu and
                                                  successful test chat

  Cross-tenant data leaks 0                       Release-blocking
                                                  security tests across
                                                  database, storage,
                                                  retrieval, logs, tools,
                                                  and channels

  AI first-response       Under 2 seconds at p50  Measure from accepted
  latency                 under normal test load  inbound message to
                                                  first response
                                                  token/visible response
                                                  start; report provider
                                                  latency separately

  Answer grounding        At least 95% on a       Every business-specific
                          curated                 factual claim must be
                          business-question       supported by current
                          evaluation set          structured data or
                                                  approved knowledge

  Offer calculation       100% on deterministic   Backend-calculated
  correctness             offer test cases        eligibility and totals

  Critical action         100% in release-gate    No false order,
  correctness             tests                   booking, payment,
                                                  cancellation, or refund
                                                  success claims

  Channel consistency     Same expected business  Run the same evaluation
                          answer across website   set through both
                          and WhatsApp test cases adapters

  Onboarding completion   At least 60% of pilot   Measure workspace
                          tenants complete core   cohort completion
                          setup within 7 days     
  -----------------------------------------------------------------------

**Latency note:** Full model-generated responses can exceed two seconds
because of model/provider and network latency. Track time to first
response separately from full completion time. Do not hide or mislabel
external provider delays.

## 7. MVP Scope

### Included

-   Authentication and tenant/workspace setup.
-   Tenant-scoped business profile and settings.
-   Menu categories, products, prices, variants/modifiers, and
    availability.
-   Deals/offers with deterministic backend validation.
-   Approved FAQs and policies.
-   Shared Gemini AI orchestration service.
-   Website chat widget.
-   WhatsApp integration through a validated provider adapter.
-   Tenant-specific integration configuration and usage limits.
-   Conversation logs and human handoff.
-   Basic public menu/order-page foundation.
-   Safe error handling, monitoring, and QA coverage.

### Later phases

-   Full POS replacement.
-   Ingredient inventory and recipe costing.
-   Automated delivery dispatch and rider tracking.
-   Loyalty, points, and advanced CRM campaigns.
-   Automated payment-gateway settlement/reconciliation.
-   Native mobile applications.
-   White-label/reseller functionality.
-   Non-food vertical templates.

## 8. Product Boundaries

-   The AI is an assistant, not an independent source of truth.
-   The model must not run arbitrary database queries.
-   Customer messages and uploaded content are untrusted input.
-   Tenant-supplied credentials are private and must never be returned
    to the browser after saving.
-   The seven-day QR-based WhatsApp trial, if used, must be isolated
    from a tenant's own Meta Cloud API credentials and governed by
    server-side expiry and usage controls.
-   A website widget ID is a public identifier, not an authentication
    secret.
-   Payment, booking, and order states must be backed by verified server
    records.

## 9. Product Direction

The initial goal is to deliver a practical AI-powered customer
communication and ordering foundation for small food businesses. Keep
the first experience simple: configure the business, publish accurate
menu data, connect a channel, test the agent, and launch.

**Central rule:** One shared AI engine, tenant-isolated business data,
and deterministic backend logic for exact business facts and
consequential actions.
