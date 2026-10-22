# CafeConnect Chat Widget & Conversational Ordering UX Plan

**Version:** 1.0\
**For:** CafeConnect AI coding agent\
**Scope:** Embedded website chat widget, rich AI response UI, restaurant
branding, shared ordering experience, and WhatsApp presentation parity.

## 1. Goal

CafeConnect should feel like a helpful restaurant receptionist with a
visual menu and a simple checkout---not a chatbot that only sends
paragraphs. A customer should be able to ask a question, view relevant
products, compare options, customize an item, add it to a cart, confirm
a server-calculated total, and place an order with minimal typing.

**Core principle:** one shared AI, one set of business tools, one source
of truth for menu/prices/cart/orders; different presentation adapters
for web and WhatsApp. The web widget may show custom cards and
interactive controls. WhatsApp can show only the message types supported
by the selected provider/account. When rich messages are unavailable,
fall back to a readable text list.

## 2. Current baseline from the supplied audit

The audit reports that CafeConnect already has:

-   A Next.js/React widget in `src/components/chat/ChatWidget.tsx` and
    `src/app/widget/page.tsx`.
-   A public widget resolver, non-streaming endpoint, SSE streaming
    endpoint, typing indicator, suggestions, retry/reset behavior.
-   A separate public storefront and server-side order endpoint.
-   `widgetConfigs` with `primaryColor` and `allowStore`.
-   Menu items with an `imageReferences` field, but no complete image
    pipeline and no product images in the AI experience.
-   A shared AI orchestrator used by the widget and WhatsApp.
-   Server-side order creation with authoritative prices and
    idempotency.
-   Meta Cloud API and QR-provider WhatsApp adapters.

Important gaps identified by the audit:

-   The chat UI mainly renders text and suggestion chips; rich product
    cards, carousels, item configurators, and a persistent chat cart are
    not implemented.
-   Both WhatsApp adapters currently send text only; interactive message
    support is not implemented.
-   The storefront cart is client-side and separate from the AI
    conversation cart.
-   Structured item modifiers/variants, customer-facing order tracking,
    and reliable delivery ETA are missing.
-   Branding controls are limited; image upload/delivery is incomplete.

Verify these against the current branch before implementation. Do not
assume planned features already exist.

## 3. UX principles

### 3.1 Every response has one job

Each response should primarily answer, discover, compare, configure,
update cart, checkout, confirm, track, or hand off. Put the direct
answer first and offer one clear primary action. Do not show multiple
competing calls to action.

### 3.2 Rich UI only when useful

Show product cards for requests like "Burgers mein kya hai?", "PKR 1,000
ke andar kuch batao," "2 logon ke liye meal suggest karo," "Drinks
dikhao," or "Today's deals kya hain?" Keep simple questions---hours,
delivery fee, payment methods---as concise text unless a visual control
genuinely helps.

Do not force every message into a card or carousel. Repeated, irrelevant
carousels make the chat noisy.

### 3.3 Never invent product facts

The model must not invent product IDs, prices, images, variants,
ratings, "bestseller" badges, discounts, ingredients, availability, or
ETA. Cards must be enriched from validated tenant data. If a product has
no image, use a neutral placeholder or text-first card; never show an
unrelated image.

### 3.4 Mobile-first and accessible

-   Keep the widget usable on narrow mobile screens and when the phone
    keyboard is open.
-   Aim for 44--48 CSS px touch controls where practical; meet WCAG 2.2
    target-size requirements.
-   Maintain visible keyboard focus, sufficient contrast, semantic
    labels, screen-reader announcements, and reduced-motion support.
-   Do not rely on color alone for sold-out, selected, error, or success
    states.
-   Ensure sticky cart and overlays do not cover the composer or
    keyboard-focused controls.
-   Provide text fallbacks for every important visual action.

## 4. Widget layout

### Launcher

Configurable corner position, logo/chat icon, optional label ("Order
with us"), brand color, desktop/mobile behavior, and safe z-index. It
must not cover website checkout buttons, cookie notices, or mobile
navigation. Provide a preview of both corners.

### Header

Show restaurant logo/monogram, business name, minimize/close button, and
optional navigation/back button. Show "Open now" only when structured
hours and the current local time can verify it. Never fake "human
online" status.

### Conversation area

Support these UI blocks: - Plain text and safe Markdown subset. -
Quick-reply chips. - Product carousel/list. - Product detail and
customization panel. - Cart summary/drawer. - Checkout step and order
summary. - Order confirmation/status card. - Notice, sold-out state,
handoff, loading, retry, and error states.

### Composer

Accessible text input, send button, loading/disabled states, mobile
safe-area handling, and correct scroll behavior when the keyboard opens.
Do not let the carousel, cart bar, or modal permanently hide it.

### Persistent cart bar

When items exist, show a compact bar such as
`Cart · 2 items · PKR 1,850 · View cart`. Use a verified server quote
for the final total. If delivery/fees are not yet known, label the
number as a subtotal or estimate. Tapping opens an in-widget cart panel.
Any cart change invalidates the previous quote. On mobile, the cart bar
and composer must both remain accessible.

## 5. Product cards and carousels

### Card fields

1.  Product image and meaningful alt text.
2.  Product name.
3.  Current price and tenant currency.
4.  One- or two-line description.
5.  Availability.
6.  Optional verified badge.
7.  Primary action: `Add` or `Choose options`.
8.  Optional `Details` action.

### Layout rules

-   Use horizontal carousels for small, related sets (usually 3--6
    items).
-   Use vertical lists for longer results or explicit comparisons.
-   Keep cards consistent in a carousel and make horizontal scrolling
    discoverable.
-   Support touch swipe and accessible keyboard navigation.
-   Never auto-advance carousels.
-   Lazy-load images and reserve their dimensions to prevent layout
    shift.
-   On mobile, prioritize image, name, price, and action; put long
    details in a separate panel.
-   Add a "View full menu" path for large menus instead of dumping
    dozens of items into chat.

### Price and badge rules

-   Show a single current price. Use "From PKR X" only when derived from
    valid options.
-   Cross out an old price only when a real, active offer supplies both
    values.
-   Do not show fake ratings, scarcity, countdowns, or "Bestseller"
    labels.
-   Show "Sold out" text and disable Add when live availability says
    unavailable.
-   Explain offer conditions before checkout.
-   Display delivery fee separately when known; show a verified total
    before final confirmation.
-   Use the tenant's configured currency; do not globally assume every
    tenant uses PKR.

### Example card

``` text
[Food image]
Chicken Zinger Burger
Crispy chicken, lettuce, house sauce
PKR 650
[Choose options] [Add]
```

The values above are illustrative. The live card must use the tenant's
actual data.

## 6. Which AI responses should render which UI?

  -----------------------------------------------------------------------
  Intent                  Preferred response      Main action
  ----------------------- ----------------------- -----------------------
  Greeting / thanks       Short text              Optional menu chips

  Hours, delivery fee,    Concise verified text   Relevant next step if
  payment question                                useful

  Browse category         One sentence + product  View / Add
                          carousel                

  Search for item         Matching cards or clear Choose item
                          "not found"             

  Budget or meal request  2--4 verified options   Choose meal
                          with included items and 
                          total basis             

  Compare products        Short comparison + a    Select
                          few cards               

  Ask about an item       Short answer + detail   Choose options
                          card if useful          

  Add item                Brief acknowledgement + View cart / Continue
                          updated cart            

  Change/remove item      Confirm exact change +  Checkout / Continue
                          updated cart            

  Out of stock            Clear explanation +     Choose alternative
                          verified alternatives   

  Checkout                Order summary; ask only Confirm
                          for missing fields      

  Order submitted         Receipt with verified   Check status if
                          order number and totals supported

  Order status            Card from verified      Contact restaurant if
                          order data              needed

  Complaint/human request Empathetic response +   Talk to staff
                          handoff state           
  -----------------------------------------------------------------------

Additional rules: - Do not repeat the same carousel unless requested. -
Reuse the same item/cart state when customers edit a choice. - Only one
optional upsell at a time. Stop when the customer declines. - Do not
upsell during a complaint or when the customer is trying to finish
checkout. - Never show a fake live status or delivery timer.

## 7. Customization and modifiers

The audit says structured item variants/modifiers are not yet
implemented. Build that data model before exposing real customization
controls.

Recommended flow: 1. Customer taps `Choose options`. 2. Open an
in-widget bottom sheet or focused panel. 3. Use radio controls for one
choice and checkboxes for multiple choices. 4. Mark required groups
clearly; show each option's additional price. 5. Recalculate using
server-validated pricing, or label the display as an estimate until the
quote returns. 6. Disable Add until required choices are selected. 7.
Add the configured item to the cart without losing conversation context.

Example:

``` text
Pizza size (required)
( ) Small — PKR 900
(•) Medium — PKR 1,300
( ) Large — PKR 1,700

[ ] Extra cheese + PKR 150

[Add to cart · PKR 1,450]
```

All example prices are illustrative. The backend must validate modifier
IDs, required groups, allowed combinations, and price adjustments. If
options are not configured, the AI must not invent them.

## 8. Cart and checkout

### One shared cart

Do not maintain one cart in the AI conversation and another unrelated
cart in the storefront. Introduce a shared server-backed cart service
that both interfaces can use. The browser can render optimistically, but
server state is authoritative.

Suggested fields: `tenantId`, `customerId/sessionId`, `conversationId`,
`channel`, `items[]`, `cartRevision`, `status`, `fulfilmentType`,
`address`, `currentQuote`, `quoteVersion`, `createdAt`, `updatedAt`,
`expiresAt`.

### Cart panel

Show item names/options, quantity controls, remove/edit actions, line
totals, subtotal, applied discount, delivery fee/other configured
charges, verified total, minimum-order shortfall, and Checkout. If
address is needed to calculate delivery, explain that the total is not
final yet.

### Checkout flow

Use progressive disclosure and ask only for missing information: 1.
Delivery/pickup choice when supported. 2. Name/contact details when
missing. 3. Delivery address and landmark for delivery. 4. Payment
method only from configured options. 5. Server quote and complete order
summary. 6. Explicit final confirmation. 7. Submit with idempotency and
verify the result.

Do not ask for details already verified. Do not assume COD/card/bank
transfer is available. Do not treat a customer's "I paid" message as
proof of payment.

### Order receipt/status

Show order number, items/options, subtotal, discount, delivery fee,
total, fulfilment details, and status from the server. ETA may appear
only when a reliable ETA source exists. The current audit says
customer-facing tracking and ETA calculation are missing; do not fake
them.

## 9. Website-matched branding

### Standard dashboard controls

-   Primary color and optional accent color.
-   Background/surface and text theme with contrast checks.
-   Light, dark, or automatic mode.
-   Logo/monogram and business name.
-   Launcher icon, label, and corner position.
-   Border-radius preset.
-   Safe font presets.
-   Compact/comfortable card density.
-   Button style.
-   Greeting and starter prompts.
-   Desktop and mobile live preview.
-   Language defaults.
-   Enable/disable product images, product browsing, cart, and
    storefront link.

Do not let an owner create unreadable colors. Warn when contrast is
poor.

### "Match my website" setup

Offer three levels: 1. Quick match: choose brand color and logo. 2.
Theme presets: light, dark, warm café, modern minimal, high contrast,
custom. 3. Advanced match: paste CSS color tokens or pass approved CSS
variables from the host website.

Do not promise an isolated iframe can automatically inspect every host
website's CSS. Cross-origin isolation prevents unrestricted parent-page
style access. For reliability, pass theme tokens explicitly in the embed
config and use the saved theme if auto-detection fails.

### Embed-anywhere requirements

Prefer a small asynchronous loader mounting an isolated iframe or
equivalent isolated UI surface: - Works on static HTML, WordPress,
Shopify-like platforms, and React/Next.js sites. - Does not block host
page rendering. - Uses a public widget ID only; never expose API keys. -
Prevents host CSS collisions. - Supports position, dimensions, z-index,
mobile full-screen mode, and explicit theme tokens. - Validates
`postMessage` origin and allowed message types. - Avoids dependence on
third-party cookies for visitor identity. - Supports an optional
allowed-origin list. - Includes install/remove instructions and CSP
guidance. - Fails gracefully if the loader or widget API is unavailable.

Conceptual embed example (placeholder only):

``` html
<script
  async
  src="https://YOUR-CAFEConnect-DOMAIN/widget-loader.js"
  data-widget-id="PUBLIC_WIDGET_ID"
  data-theme="light"
  data-position="bottom-right">
</script>
```

The coding agent must use the real domain and actual supported
attributes; never ship this placeholder domain.

## 10. One shared response contract; channel-specific renderers

Do not let Gemini generate arbitrary HTML, CSS, or executable markup.
The model chooses a response intent and calls shared tools; the server
enriches and validates data; each channel renders the result
appropriately.

Suggested logical UI types: - `text` - `quick_replies` -
`product_carousel` - `product_list` - `product_detail` -
`item_configurator` - `cart_summary` - `checkout_step` -
`order_confirmation` - `order_status` - `notice` - `handoff`

Conceptual payload:

``` json
{
  "type": "product_carousel",
  "text": "Ye burgers aapke budget ke qareeb hain:",
  "productIds": ["verified-item-id-1", "verified-item-id-2"],
  "actions": [{"id": "view_menu", "label": "Full menu"}]
}
```

The server must fetch each product by ID within the active tenant.
Prices, image references, availability, and stock are
server-provided---not trusted from model output. Validate the payload
and fall back to safe text if invalid.

### Web widget renderer

Can show React cards, carousels, customization controls, cart drawer,
checkout, and receipt/status cards.

### WhatsApp renderer

Use plain text, reply buttons, list messages, or catalog/product
messages only when supported by the selected provider, account, API
version, catalog configuration, and current messaging policy. A web
carousel cannot simply be sent as WhatsApp UI.

The audit says both current WhatsApp adapters send text only. Implement
interactive capabilities in the adapters and test them. If unsupported,
show a short numbered list with item names and verified prices, e.g. "1.
Zinger Burger --- PKR 650. Reply 1 or send the item name."

Add a provider capability registry such as `text`, `image`,
`replyButtons`, `listMessages`, `catalogProducts`, `messageTemplates`,
and `deliveryStatus`. Presentation should select the best supported
capability; lack of rich messages must never block ordering.

## 11. Example conversations

### Browse menu

**Customer:** "Burgers mein kya hai?"\
**AI text:** "Ye burgers available hain. Kisi ko select karein ya
options dekhein."\
**Widget:** Verified product carousel.\
**WhatsApp fallback:** Same items in a short numbered list.

### Budget request

**Customer:** "2 logon ke liye 2000 ke andar kuch batao."\
Return 2--3 actual items/combos whose validated cost fits the stated
budget. Clearly say whether delivery charges are included. Never invent
a bundle.

### Correction

**Customer:** "Ek zinger add karo."\
**Customer:** "Nahi, do kar do."\
Update quantity from one to two. Do not add two more items. Refresh the
cart total.

### Sold out

If availability validation fails, show the sold-out state and verified
alternatives. Do not let a stale card appear orderable.

### Simple question

**Customer:** "Delivery charges kitne hain?"\
Answer from tenant settings. Do not show unrelated products.

### Confirmed order

Only after the order service returns success, show the actual order
number and exact server totals. If the request times out, check
idempotency/order state before retrying.

## 12. Performance, recovery, and analytics

### Performance

-   Load the widget asynchronously.
-   Lazy-load images and reserve image dimensions.
-   Render text and price without waiting for images.
-   Keep SSE streaming responsive; do not wait for a carousel's images
    before showing the response.
-   Revalidate price/availability before quote and order submission.
-   Use request IDs/idempotency to prevent duplicate cart/order actions.
-   Keep bounded retries and visible recovery actions.
-   Preserve cart/options through temporary network failures.
-   Do not show endless typing indicators or contradictory duplicate
    acknowledgements.

### Analytics events

Tenant-scoped events should include: `widget_opened`,
`starter_prompt_clicked`, `menu_search_submitted`,
`product_results_shown`, `product_card_opened`, `product_added`,
`modifier_selection_completed`, `cart_opened`, `cart_item_updated`,
`checkout_started`, `checkout_validation_failed`, `order_created`,
`handoff_requested`, `widget_error`,
`whatsapp_interactive_fallback_used`.

Measure product-card-to-add rate, add-to-cart rate, checkout completion,
conversation-to-order conversion, time to first useful response, time to
order, repeated questions, cart correction errors, unavailable-item
attempts, handoff resolution, recommendation acceptance,
opt-out/complaint rate, and p50/p95 latency by channel/device/language.

Do not optimize conversion at the expense of trust, correctness, or
unwanted messaging. Avoid collecting unnecessary message content or
personal data in analytics.

## 13. Phased implementation roadmap

### Phase 0 --- Audit and contract

-   Re-open widget, embed snippet, widget settings API, product schema,
    store API, AI response path, and WhatsApp adapters.
-   Record desktop/mobile baseline.
-   Define typed UI response contract and fallback rules.
-   Verify image field/storage reality. **Done when:** current vs
    planned behavior is documented and the design does not change
    backend order rules.

### Phase 1 --- Widget shell and branding

-   Theme tokens, logo, launcher position, greeting, safe font presets.
-   Responsive header, conversation area, composer, loading/error
    states, live preview.
-   Safe embed loader and explicit theme config.
-   Contrast/focus checks. **Done when:** embeds on static HTML and
    React/Next.js test sites; host CSS cannot break the widget; mobile
    keyboard never hides the composer.

### Phase 2 --- Structured renderer and product cards

-   Text, quick replies, product carousel/list, notice, handoff.
-   Schema validation and server-side product enrichment.
-   Image placeholders, lazy loading, keyboard/screen-reader support.
    **Done when:** invalid payload falls back to text, and no card can
    expose another tenant's product or model-invented price.

### Phase 3 --- Images and modifiers

-   Safe image upload/reference workflow.
-   Structured variants/modifiers and price rules.
-   Item detail/configuration panel and sold-out/changed-price states.
    **Done when:** invalid modifiers are rejected server-side and
    missing images/options do not break ordering.

### Phase 4 --- Shared cart and checkout

-   Shared server-backed cart, cart bar/drawer, quantity controls,
    quote, checkout, confirmation.
-   Reuse order service and idempotency. **Done when:** cart stays
    consistent between chat and checkout, changes invalidate old quotes,
    and confirmation only follows verified success.

### Phase 5 --- WhatsApp adapters

-   Capability registry.
-   Implement Meta interactive messages only after checking current
    official API payloads and account rules.
-   Verify QR provider support; otherwise use text fallback.
-   Map same product IDs, cart, and order tools. **Done when:**
    equivalent decisions and order results across channels; unsupported
    UI gracefully becomes text.

### Phase 6 --- Tracking, analytics, refinement

-   Order-status card based on backend status.
-   ETA only if reliable source exists.
-   Add events and controlled UX tests. **Done when:** analytics are
    tenant-scoped and no status/ETA is fabricated.

## 14. Test checklist

**Functional** - Theme/logo update, widget open/close, mobile/desktop
layout. - Correct item image/name/price/availability. - Long names,
missing images, large prices, empty menu. - Carousel
touch/keyboard/screen-reader behavior. - Modifier validation and correct
quote. - Cart add/edit/remove and quantity corrections. - Clear checkout
validation, verified receipt, retry after uncertain submission. -
Equivalent widget/WhatsApp business behavior.

**Security** - Public widget ID reveals no secrets. - Tenant A cannot
access Tenant B's menu, images, cart, customer, or order. - Client
cannot submit an authoritative price or arbitrary image URL. - Embed
message origin is validated. - Theme settings cannot execute
HTML/JavaScript. - Rate limits work across serverless instances.

**AI quality** - Simple question does not trigger unnecessary cards. -
Budget recommendations use verified prices and clear total basis. -
Sold-out items cannot be ordered. - No invented ratings, badges,
modifiers, or ETA. - Declined upsell is not repeated. - Corrections
update, not duplicate, cart items. - Urdu script, Roman Urdu, Hinglish,
and English paths work. - Tool/API failures produce safe, localized
recovery.

**Accessibility** - Keyboard-only operation and visible focus. - Screen
reader announces new messages, cart updates, and errors. - Adequate
contrast and touch target sizes. - Reduced motion and mobile keyboard
support.

## 15. Likely code areas to inspect

Follow repository conventions and re-open files before editing:

-   `src/components/chat/ChatWidget.tsx` --- message renderer, cards,
    cart, accessible interactions.
-   `src/app/widget/page.tsx` --- widget bootstrap/embed surface.
-   `/api/widget/resolve` and widget message routes --- config and
    shared response path.
-   `/api/settings/widget` --- persisted theme configuration.
-   `src/types/schema.ts` --- versioned widget settings/response payload
    types.
-   `src/app/store/page.tsx`, `/api/store` --- shared cart/checkout.
-   `src/lib/ai/orchestrator.ts`, `prompt-builder.ts`, `tools.ts` ---
    shared intent/tools.
-   `src/lib/ai/context-builder.ts` --- tenant menu facts and cache
    invalidation.
-   `src/lib/services/orders.ts` --- authoritative quote/order
    validation.
-   `src/lib/whatsapp/meta-cloud.ts` and QR worker/provider modules ---
    channel presentation adapters.
-   Dashboard widget settings --- theme controls, embed instructions,
    preview.

Do not put AI business logic in `ChatWidget.tsx`. The widget should
render validated payloads and send user actions to backend endpoints.

## 16. References

-   W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
-   WCAG 2.2 target size overview:
    https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/
-   WCAG visible focus guidance:
    https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
-   Baymard mobile e-commerce UX research:
    https://baymard.com/research/mcommerce-usability
-   Baymard product page UX research:
    https://baymard.com/research-articles/current-state-ecommerce-product-page-ux
-   WhatsApp Business Platform message documentation:
    https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages
-   WhatsApp interactive list example:
    https://www.postman.com/meta/whatsapp-business-platform/request/jze7gxt/send-reply-to-list-message
-   WhatsApp reply-button example:
    https://www.postman.com/meta/whatsapp-business-platform/request/x0kd1at/send-reply-button

Verify current Meta message limits, account requirements, catalog setup,
and policy constraints before implementation. QR-provider capabilities
may differ from Meta Cloud API.

## 17. Instructions to the coding agent

1.  Treat this as a staged UX blueprint, not a request to rewrite the
    app in one pass.
2.  Inspect the current widget and embed contract before changing code.
3.  Preserve working streaming, tenant resolution, order creation,
    pricing, and idempotency.
4.  Keep one shared AI/tool/cart engine; only presentation adapters
    differ by channel.
5.  Do not allow Gemini to emit arbitrary HTML, CSS, or executable
    markup.
6.  Never invent images, stock, badges, prices, ETA, or order status.
7.  Never expose API keys in the embed snippet or public widget config.
8.  Implement each phase with tests, responsive/accessibility checks,
    and rollback notes.
9.  Run typecheck, lint, build, and tests; add tests where none exist.
10. Report changed files, schema changes, features implemented, test
    results, limitations, and remaining work after each phase.

**Success definition:** Any restaurant can embed and brand CafeConnect
on its website. Customers can browse verified visual products, choose
options, manage one persistent cart, and place accurate orders with
minimal friction. WhatsApp customers receive the same underlying
intelligence through supported interactive messages or a clear text
fallback.

---

## 18. Implementation status (2026-10-22)

Phases are implemented in the order below. Everything below was verified
against production (`https://cafeconnect-rho.vercel.app`) and against the
live tenant data.

### Phase 0 --- Audit and contract: done

-   Current widget, embed contract, settings API, product schema, store
    API, AI response path and WhatsApp adapters were re-opened before
    editing.
-   The response contract lives in `src/lib/widget/ui-contract.ts`:
    `text`, `quick_replies`, `product_carousel`, `product_list`,
    `cart_summary`, `order_confirmation`, `notice`, `handoff`.
-   `parseWidgetBlocks()` drops unknown or oversized payloads, so an
    invalid payload always falls back to plain text.
-   Product enrichment happens on the server (`enrichProducts`,
    `resolveBrowseProducts`) and reads menu items **inside one tenant**.
    A card can never expose another tenant's product or a model-invented
    price.

### Phase 1 --- Widget shell and branding: done

-   Branding is tenant-managed (`src/lib/widget/theme.ts`,
    `src/lib/widget/service.ts`): primary/accent colour, theme mode,
    radius, density, font preset, logo, launcher corner and label,
    greeting, starter prompts and feature toggles. Colours are
    validated, logo URLs may only be https or same-origin, and a low
    contrast warning is shown in the dashboard.
-   The widget is embedded with `public/widget-loader.js`: an async
    script that mounts an isolated iframe, draws the launcher, supports
    both corners, full-screen mode on phones and validates the
    `postMessage` origin on both sides.
-   The panel is mobile-first: 44px touch targets, safe-area padding,
    a composer that stays above the keyboard, a brand-coloured header
    and a receipt-style cart bar.
-   Dashboard: `WidgetBrandingCard` (controls + install snippet) and
    `WidgetEmbedCard` (loader snippet, iframe snippet, store link).

### Phase 2 --- Structured renderer and product cards: done

-   The orchestrator returns verified `ui` blocks; the streaming route
    ships them as a `blocks` event.
-   Cards show the real image (or a neutral placeholder), name, price
    chip, two-line description, availability and a single primary
    action. No fake badges, ratings or countdowns.
-   Small related sets render as a swipe/keyboard carousel, longer
    results as a list. Carousels never auto-advance.
-   Browse requests ("menu dikhao", "burgers mein kya hai") are
    resolved server side into real cards, even when the model answers
    from the menu context.

### Phase 3 --- Images and modifiers: done

-   Images: the Firebase Storage pipeline from the order plan serves
    product photos through `/api/media/[assetId]`.
-   Modifiers: `src/lib/domain/options.ts` validates single/multiple
    groups, required groups and min/max selection counts on the server.
    The widget configurator (`ItemConfigurator`) only sends group and
    option ids; the server resolves names and prices.

### Phase 4 --- Shared cart and checkout: done

-   The widget uses the same server cart as the assistant
    (`src/lib/services/carts.ts`), scoped by a high-entropy,
    first-party conversation id (`w_...`). There is one cart, one quote
    and one order engine.
-   The cart bar shows the verified total (or a subtotal when fees are
    not confirmed yet); the cart panel offers quantity, remove, delivery
    or pickup, contact details and an address.
-   Checkout quotes server side, submits idempotently and shows a
    receipt with the real order number plus a signed tracking link.

### Phase 5 --- WhatsApp adapters: partially done

-   `src/lib/channels/capabilities.ts` is the capability registry.
    WhatsApp stays on `text` until an account is verified for
    interactive messages.
-   Verified products are sent as a numbered list when the channel
    cannot render cards, and the fallback is recorded as
    `whatsapp_interactive_fallback_used`.
-   Still open: Meta interactive payloads (reply buttons, list
    messages) after the account, catalog and policy requirements are
    confirmed - the Meta Cloud API is not configured in production yet.

### Phase 6 --- Tracking, analytics, refinement: mostly done

-   The order receipt links to the public tracking page
    (`/track`), which is backed by a signed, high-entropy token and a
    rate-limited public API.
-   Tenant-scoped events live in `src/lib/analytics/events.ts`:
    `widget_opened`, `starter_prompt_clicked`, `product_results_shown`,
    `product_added`, `cart_opened`, `cart_item_updated`,
    `checkout_started`, `order_created`, `handoff_requested`,
    `widget_error` and `whatsapp_interactive_fallback_used`. Only
    structural dimensions are stored - never message content.
-   Still open: a dashboard view for the funnel, and an ETA source
    (no ETA is shown until a reliable one exists).

### Known limitations

-   Product photos only appear for products that actually have an
    uploaded image; other cards use a neutral placeholder.
-   The iframe theme is set by the tenant configuration, not sniffed
    from the host page (cross-origin isolation prevents that).
-   The `iframe` fallback snippet still exists for hosts that block
    third-party scripts; the loader is the recommended path.

