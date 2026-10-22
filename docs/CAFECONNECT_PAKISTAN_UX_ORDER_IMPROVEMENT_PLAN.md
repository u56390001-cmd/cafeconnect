# CafeConnect Pakistan-First Menu, Product, Online Ordering & Order Management Improvement Plan

**Version:** 1.0\
**Prepared:** 21 October 2026\
**Repository snapshot reviewed by the supplied audits:** `main` at
commit `7c6dbbe`\
**Primary goal:** improve CafeConnect's existing menu, product images,
public online ordering, and order-management experience for Pakistani
restaurants, cafes, and cloud kitchens.

> **Strict scope:** CafeConnect is not a POS system. Do not add
> inventory management, stock counts, supplier/purchasing workflows,
> recipe costing, or low-stock alerts. Manual menu/product creation
> already exists and must be improved, not rebuilt. Payment-gateway
> integration is not part of this plan; retain the existing manual
> payment-status workflow and configured payment choices.

------------------------------------------------------------------------

## 1. Executive decision

The supplied audits show that CafeConnect already has a useful
foundation: Next.js/React, TypeScript, Tailwind, Firebase
Authentication, Firestore, tenant-aware server routes, a public store,
manual menu CRUD, server-side pricing, offer calculations, order
snapshots, order-number generation, and shared AI/storefront order
services.

The main problem is that the end-to-end experience is incomplete and
some order/security rules need hardening. The next step should be a
**thin, tested improvement layer around the current architecture**, not
a rewrite.

### Highest-priority outcomes

1.  Prevent customer-data exposure, illegal order-status changes, and
    duplicate orders.
2.  Show honest, attractive product cards with real restaurant images.
3.  Make menu editing easy for a restaurant owner using a phone as well
    as a laptop.
4.  Keep the cart visible on mobile and show delivery charges,
    minimum-order progress, and the actual total before final
    submission.
5.  Handle Pakistan-specific phone numbers, address/landmark entry, COD
    expectations, PKR formatting, and Urdu/Roman Urdu/English without
    making assumptions about each tenant's business.
6.  Give staff a fresh, searchable order queue with clear errors, safe
    status transitions, and a print-friendly order ticket.
7.  Add secure customer order tracking so customers do not have to
    repeatedly call the restaurant for updates.
8.  Add integration, responsive, security, and end-to-end tests before
    declaring a phase complete.

**No plan can honestly guarantee zero bugs.** This plan defines
implementation gates and tests designed to prevent known bugs, catch
regressions, and make failures recoverable.

------------------------------------------------------------------------

## 2. Audit baseline: what exists and what is missing

The findings below come from the supplied repository audits. Re-check
the live branch before implementation because the repository may have
changed since the audited commit.

### Existing functionality to preserve

-   Manual category creation and archiving.
-   Manual product creation and editing with name, description,
    category, price, availability, and draft/published state.
-   Public menu resolved using a widget/store key.
-   Category filtering and a basic text-based product card.
-   Cart quantity controls and a basic delivery/pickup checkout.
-   Server-side re-reading of current menu records and price
    calculation.
-   Offer and delivery-rule calculations in
    `src/lib/services/orders.ts`.
-   Integer minor-unit money storage.
-   Order-number generation and order creation.
-   Staff order list and manual status/payment actions.
-   AI menu search, quote, create-order, and status tools using the same
    order service.

Do not duplicate these systems or replace working code just to change
the UI.

### Main gaps identified by the audits

  -----------------------------------------------------------------------
  Area                    Current gap             Priority
  ----------------------- ----------------------- -----------------------
  Security and order      Order reads need        P0
  integrity               verified role/data      
                          restrictions; status    
                          changes are not a fully 
                          enforced state machine; 
                          idempotency can race    

  Product media           No working              P1
                          product-image upload,   
                          storage, preview, crop, 
                          transformation, or      
                          storefront rendering    

  Mobile storefront       Cart falls below the    P1
                          catalogue on mobile; no 
                          persistent cart bar;    
                          loading state can be    
                          blank                   

  Checkout transparency   Delivery fee is fetched P1
                          but not displayed;      
                          minimum-order threshold 
                          is missing from public  
                          response; total is not  
                          quoted clearly before   
                          submission              

  Checkout details        Notes state is sent but P1
                          no notes input is       
                          rendered                

  Order reliability       A new idempotency key   P0
                          is generated for every  
                          attempt, which can      
                          permit duplicate orders 
                          after a timeout/retry   

  Menu editor             Long page, no image UX, P1/P2
                          limited search/bulk     
                          operations, no clear    
                          restore/undo, and       
                          limited category/item   
                          ordering                

  Product discovery       No product search,      P2
                          product detail view,    
                          structured modifiers,   
                          or optional             
                          dietary/spice           
                          information             

  Order dashboard         Manual refresh,         P1
                          incomplete status       
                          filters, silent update  
                          failures, no full       
                          status history, limited 
                          search/detail/print     
                          tools                   

  Customer tracking       No public tracking      P1
                          page/API after order    
                          creation                

  Shared types            Menu/order shapes are   P0/P1
                          duplicated across API   
                          and UI rather than      
                          centrally defined       

  Test coverage           Existing tests cover    P0
                          only a narrow part of   
                          the real                
                          menu/store/order flow;  
                          API, rules, media, and  
                          UI integration coverage 
                          is missing              
  -----------------------------------------------------------------------

### Existing audit verification note

The supplied audit reports `npm test`, `npm run typecheck`, and
`npm run lint` passing on the reviewed snapshot, while `npm run build`
failed in the audit environment because Firebase client configuration
was empty/invalid. Treat this as a build/deployment robustness item:
validate required environment configuration and verify the build in a
correctly configured CI environment. Do not copy secrets into source
code or public widget configuration.

------------------------------------------------------------------------

## 3. Product principles

### 3.1 Make the next action obvious

Each screen should help the user do one main task. Use plain labels such
as `Add`, `Choose options`, `View cart`, `Place order`, `Confirm order`,
and `Mark ready`. Avoid unclear icon-only actions.

### 3.2 Show facts, not guesses

-   Prices, delivery fees, discounts, order totals, item availability,
    and order status must come from trusted tenant data or server
    responses.
-   Never invent product photos, badges, ratings, ingredients, delivery
    promises, or preparation times.
-   Show dietary, allergen, halal, and spice information only if the
    restaurant has explicitly configured it.
-   If an image is missing or broken, show a neutral branded
    placeholder; do not substitute an unrelated dish.
-   Never display a success screen until the server confirms the order
    was created.

### 3.3 Keep server rules authoritative

The browser can provide immediate feedback, but the server must
revalidate menu items, availability, modifiers, delivery/pickup
eligibility, offer rules, pricing, and totals. A modified browser
request must not bypass these rules.

### 3.4 Mobile-first, not desktop-shrunk

Many customers will arrive from a phone, a social profile, a shared
link, or a messaging conversation. The menu, cart, and checkout should
work without requiring a customer to scroll through the whole catalogue
to find the cart.

### 3.5 Same business logic for web and AI

Keep one shared order/pricing domain service. The website and
AI/WhatsApp channels may have different presentation, but they must not
calculate separate prices or maintain conflicting order states.

------------------------------------------------------------------------

## 4. Pakistan-first requirements

These requirements are defaults for the product, not assumptions about
every restaurant. Each tenant should be able to configure its own
business details and policies.

### 4.1 PKR and honest totals

-   Default new Pakistan-based tenants to `PKR`, but keep currency
    tenant-configurable.
-   Use one shared `formatMoney` utility in the storefront, menu editor,
    cart, order dashboard, receipts, and AI responses.
-   Store amounts as integer minor units and calculate totals on the
    server.
-   Display typical whole-rupee prices clearly, such as `Rs 1,250`,
    while preserving decimals if the actual configured amount requires
    them.
-   Do not use `Math.round(amountMinor / 100)` everywhere; that can
    silently discard precision for other currencies.
-   Show subtotal, discount, delivery fee, any configured additional
    charge, and final quoted total as separate rows.
-   Do not invent tax or service charges. Show them only when the tenant
    has configured them and the server includes them in the quote.
-   If the address is required to determine delivery cost, label the
    pre-address figure as a subtotal or estimate---not the final total.

### 4.2 Pakistani mobile-number entry

Make phone entry forgiving without weakening validation:

-   Accept common local input such as `03xx xxxxxxx` and international
    form such as `+92 3xx xxxxxxx`.
-   Normalize valid Pakistani mobile numbers to a canonical format
    before storage and phone matching.
-   Allow an explicit international country code where the tenant serves
    international customers; do not silently rewrite every number as
    Pakistan.
-   Show a helpful hint, for example: `03xx xxxxxxx ya +92 3xx xxxxxxx`.
-   Return a field-level error when a number is invalid. Do not erase
    the customer's other checkout fields.
-   Keep raw phone numbers out of analytics events and application logs
    wherever possible. Use the existing phone-hash matching approach for
    verification where appropriate.

### 4.3 Addresses, landmarks, and delivery areas

A Pakistani delivery address may rely on a society, sector, street,
house number, shop, nearby landmark, or directions rather than a
standardized street address. Do not require a US-style address form.

Recommended delivery fields:

-   City (pre-filled only when the tenant has configured a city).
-   Area/society/sector.
-   House, street, building, or shop number.
-   Landmark or delivery instructions.
-   Optional map pin or map link only if implemented and useful.
-   Customer notes, with a clear distinction between food customization
    and delivery instructions if both are supported.

Rules:

-   Make the minimum required fields explicit and configurable.
-   Use the restaurant's configured delivery areas/labels for a
    pre-check where possible.
-   Do not reject a customer only because an exact keyword match fails
    when the restaurant has a safe manual-confirmation path. Show
    `Delivery area needs confirmation` and offer the restaurant's
    configured contact/handoff option rather than falsely promising
    delivery.
-   Never require geolocation permission to place an order.
-   Do not expose internal matching keywords or private delivery
    configuration in public responses.
-   Recheck delivery eligibility and fee on the server at quote and
    order submission.

### 4.4 COD and payment expectations

The audited baseline is a cash-on-delivery flow with staff manually
updating payment status.

-   Clearly display `Cash on delivery` if it is the tenant's enabled
    method.
-   Do not imply that card, bank transfer, Easypaisa, JazzCash, or
    another method is available unless that tenant has explicitly
    enabled and implemented it.
-   Keep order status separate from payment status.
-   `Mark paid` should require the appropriate staff role and should
    create an audit event.
-   Do not add a payment gateway as part of this plan.

### 4.5 Urdu, Roman Urdu, and English

-   Support English, Urdu script, and Roman Urdu in the customer-facing
    text where translations are provided.
-   Use right-to-left layout for Urdu script and left-to-right layout
    for Roman Urdu and English.
-   Preserve correct alignment of prices, phone numbers, order IDs, and
    mixed Urdu/English content.
-   Do not assume that Roman Urdu is a separate language that can safely
    be handled by Urdu-script direction settings.
-   Use the tenant's configured language defaults and let the customer
    switch when a language selector is included.
-   Localize validation and recovery messages. Never expose raw server
    exceptions such as `Invalid order request`.
-   Test real mixed-language examples such as `1 Zinger Burger`,
    `Rs 650`, an Urdu address, and a phone number on the same screen.

------------------------------------------------------------------------

## 5. Target architecture

Preserve the current Next.js, TypeScript, Tailwind, Firebase Auth,
Firestore, and tenant boundaries. Improve contracts and services before
expanding the UI.

### 5.1 Keep one source of truth

``` text
Menu dashboard
    -> authenticated menu API
    -> shared menu validation/domain helpers
    -> tenant-scoped Firestore menu records
    -> Firebase Storage product media

Public storefront / AI ordering
    -> public menu and quote APIs / shared AI tools
    -> same tenant menu records
    -> shared pricing and order service
    -> atomic order creation
    -> tenant-scoped order record + status history

Restaurant order dashboard
    -> authenticated order API
    -> role-checked order commands
    -> current order + append-only history
    -> customer-safe tracking endpoint
```

Do not move pricing logic into React components or the system prompt.
The AI may request a quote or order, but the server remains
authoritative.

### 5.2 Central types and runtime validation

The audits identify duplicated menu/order types. Add canonical types in
`src/types/` (or the repository's established type location) for:

-   `MenuCategory`
-   `MenuItem`
-   `ImageReference`
-   `VariantGroup` / `ModifierGroup` and option selections
-   `CartItem`
-   `Order`
-   `OrderItemSnapshot`
-   `OrderStatusEvent`
-   `PaymentStatusEvent`
-   `StoreQuote`
-   `PublicTrackingResponse`

Use one shared runtime validation approach for create and update
operations. Zod is one option if it fits the current dependency policy;
otherwise centralize typed validators without introducing a second
competing validation system.

**Required rule:** POST, PATCH, public checkout, AI tool arguments, and
tests must share the same underlying validation rules. Do not allow POST
and PATCH to drift.

### 5.3 API response contract

Use consistent machine-readable error codes with safe, localized display
messages.

Example shape:

``` json
{
  "ok": false,
  "error": {
    "code": "MIN_ORDER_NOT_MET",
    "message": "Your order is below the restaurant's minimum.",
    "details": {
      "minimumOrderMinor": 150000,
      "subtotalMinor": 110000,
      "shortfallMinor": 40000,
      "currency": "PKR"
    }
  }
}
```

This is a conceptual example. The values are illustrative, and the
implementation must follow the existing API response conventions. Return
only details safe for the public customer. The UI should map codes to
English, Urdu, or Roman Urdu copy; it must not parse English error
sentences with regular expressions.

### 5.4 Preserve existing domain services

Continue using `src/lib/services/orders.ts` for authoritative
pricing/order logic. Refactor only as needed to make operations
transactional, validated, and testable. Avoid separate pricing logic for
the storefront, AI, and dashboard.

------------------------------------------------------------------------

## 6. Phase 0 --- fix release-blocking correctness and security

Do these before adding major features.

### 6.1 Secure order/customer data

-   Re-check the deployed Firestore rules and the audited
    `firestore.rules` against the actual access model.
-   Prevent read-only or unrelated tenant users from reading customer
    names, phone numbers, addresses, notes, or order totals through
    direct Firestore access.
-   Prefer server-mediated order reads unless the direct client read
    path can be safely restricted and tested.
-   Enforce tenant and role checks on every staff API operation.
-   Keep public tracking separate from staff order responses.
-   Add cross-tenant tests for menu, media, cart/order, and tracking
    access.

### 6.2 Enforce order status transitions on the server

Replace arbitrary status patching with explicit commands and a canonical
transition table.

Suggested baseline, subject to the restaurant's actual fulfilment rules:

-   `received` → `confirmed`, `declined`, or permitted `cancelled`
-   `confirmed` → `preparing` or permitted `cancelled`
-   `preparing` → `ready` or permitted `cancelled`
-   `ready` → `dispatched` for delivery, or `completed` for pickup
-   `dispatched` → `completed`
-   `completed`, `declined`, and `cancelled` are terminal unless a
    documented administrative correction flow exists

Requirements:

-   Verify that the order exists and read its current status before
    changing it.
-   Enforce the transition table inside a transaction or equivalent safe
    command.
-   Enforce pickup/delivery-specific transitions.
-   Keep payment status separate from fulfilment status.
-   Restrict payment changes to authorized roles.
-   Record actor, timestamp, previous state, new state, and reason when
    relevant.
-   Return a clear conflict response if another staff member has already
    changed the order.
-   Never allow a client to set arbitrary `updatedBy`, timestamps,
    totals, or audit history.

### 6.3 Make order idempotency atomic

The current storefront generates a fresh key for each submit attempt,
and the audit warns that concurrent requests may race.

-   Create one idempotency key for the current cart revision.
-   Preserve it across network retries and double-taps.
-   Use an atomic Firestore transaction/create-if-absent reservation for
    order creation.
-   Return the same canonical order result when the same key is retried.
-   Generate a new key only when the cart meaningfully changes or a new
    order begins.
-   Clear the persisted cart/key only after the server confirms the
    order.
-   Test simultaneous duplicate requests; exactly one logical order must
    be created.

### 6.4 Validate all inputs consistently

-   Reject invalid enum values rather than silently coercing them.
-   Reject unsupported fulfilment values rather than treating every
    unknown value as delivery.
-   Enforce `pickupAvailable` on both the public UI and the server.
-   Verify the product and category exist and are active on update.
-   Ensure archived items/categories cannot leak into the public menu.
-   Use the same quantity/line-count limits in the client and server for
    helpful UX, while still enforcing them on the server.
-   Resolve the duplicate Tailwind configuration reported by the audit
    after confirming which configuration the project actually uses.
-   Validate required Firebase environment settings clearly; never place
    credentials in client code.

**Phase 0 exit gate:** tenant isolation tests pass, illegal order
transitions are rejected, payment changes are role-checked, concurrent
duplicate submissions create one order, malformed requests return safe
4xx errors, and CI build runs in a correctly configured environment.

------------------------------------------------------------------------

## 7. Phase 1 --- improve the menu editor without rebuilding it

### 7.1 Make the editor faster to use

The existing menu page is a long, stacked form. Improve the current CRUD
rather than creating a second menu system.

Recommended layout:

-   Page heading with `Menu`, a visible item count, and a primary
    `Add product` action.
-   Category controls with rename, reorder, and safe archive actions.
-   Search field and category filter.
-   Product list with thumbnail, name, price, category, publication
    status, availability, and quick edit.
-   Create/edit form in a responsive drawer/sheet on desktop and a
    full-screen or near-full-screen panel on mobile.
-   Clear save/cancel actions, inline validation, and a visible saving
    state.
-   Warn before closing with unsaved changes.
-   Confirm destructive actions and provide a restore path for archived
    items where supported.
-   Add duplicate-product and bulk publish/pause actions after core
    reliability is complete.

### 7.2 Product form fields

**Required basics**

-   Product name
-   Category
-   Price
-   Availability (`available`, `soldOut`, `paused`)
-   Publication (`draft`, `published`)

**Optional, tenant-configured fields**

-   Short description
-   Product images
-   Aliases/search terms for common spelling and transliteration
-   Dietary/allergen labels
-   Spice level
-   Portion/size information
-   Product options/modifiers, when Phase 5 is implemented

Do not require every restaurant to fill every optional field. Empty
optional fields should not block saving.

### 7.3 Category and item ordering

-   Add explicit integer `sortOrder` for categories and items.
-   Allow move-up/down or drag reordering with a keyboard-accessible
    alternative.
-   Keep public storefront order consistent with the restaurant's menu
    order.
-   Before archiving a category, explain the impact on assigned items
    and require a clear choice: reassign items, archive the category
    with an explicit item policy, or cancel.
-   Do not let published products silently disappear because their
    category was archived.
-   Make duplicate category names and invalid category references
    visible validation errors.

**Acceptance criteria:** an owner can create, edit, search, reorder,
publish, pause, archive, and restore supported menu records without
losing data or accidentally hiding an entire category.

------------------------------------------------------------------------

## 8. Phase 2 --- complete product image management

The audits show that Firebase Storage is configured but no usable
product-image pipeline is wired up. This is one of the biggest gaps in
the customer-facing menu.

### 8.1 Safe media architecture

Use the configured Firebase Storage choice unless repository inspection
reveals a deployment blocker. Do not store base64 images in Firestore.

Suggested tenant/item path:

``` text
tenants/{tenantId}/menu-items/{itemId}/{assetId}/card.webp
tenants/{tenantId}/menu-items/{itemId}/{assetId}/detail.webp
```

Implementation requirements:

1.  Create a server-authorized upload session for the authenticated
    tenant user.
2.  Validate the file type, actual decoded image, file size, dimensions,
    and ownership.
3.  Set an initial practical upload limit (for example, 5 MB) and make
    it configurable if needed.
4.  Accept only supported raster image types such as JPEG, PNG, and
    WebP. Do not trust the file extension alone.
5.  Generate optimized display sizes; use a trusted image-processing
    route/library compatible with the deployment environment.
6.  Strip unnecessary EXIF metadata from public derivatives.
7.  Add and deploy **Firebase Storage rules** separately. A Firestore
    rule mentioning `/storage` does not secure the Storage bucket.
8.  Store safe asset references and metadata, not unbounded base64.
9.  Replace/remove old assets safely only after the new reference is
    committed.
10. Clean up abandoned uploads and orphaned files with a tested cleanup
    process.
11. Never expose service-account credentials or permanent privileged
    upload credentials in the browser.
12. Do not accept arbitrary remote URLs as the primary image flow. If
    URL import is later added, implement a server-side, validated import
    process.

### 8.2 Image fields

An `ImageReference` can include:

-   `assetId`
-   Safe public delivery reference/URL
-   `altText`
-   `width`, `height`
-   `sortOrder`
-   `isPrimary`
-   Optional crop/focal-point metadata
-   Lifecycle state, such as `uploading`, `ready`, or `failed`

The primary image reference should be captured in the order-item
snapshot if historical order cards/receipts need to display the product
image after the menu changes.

### 8.3 Dashboard image experience

-   Drag/drop and browse-to-upload.
-   Local preview before upload.
-   Crop/position preview that shows the likely card crop.
-   Upload progress, success, retry, and clear failure messages.
-   Replace, remove, and reorder images.
-   Choose a primary image.
-   Warn when leaving during an upload.
-   Keep the existing text fields if image upload fails; never lose the
    product form.
-   Show image requirements and the maximum file size before upload.

### 8.4 Storefront image experience

-   Use a stable image aspect ratio so cards do not jump while loading.
-   Use `object-fit: cover` with a predictable focal point.
-   Lazy-load below-the-fold images and reserve their dimensions.
-   Serve responsive card/detail sizes and use WebP/AVIF where supported
    by the chosen pipeline.
-   Keep the product name, price, and Add button visible even if the
    image fails.
-   Provide meaningful alt text; decorative images can use empty alt
    text when appropriate.
-   Configure `next/image` remote patterns if using remote Firebase
    Storage URLs with Next Image. Do not allow arbitrary hosts.

**Acceptance criteria:** a manager can upload and replace an image; it
appears on the public menu; invalid/corrupt/oversized files are
rejected; failed uploads do not create broken references; one tenant
cannot overwrite or delete another tenant's image.

------------------------------------------------------------------------

## 9. Phase 3 --- redesign the public menu for mobile ordering

### 9.1 Page structure

Recommended hierarchy:

1.  Restaurant name/logo and optional verified business details.
2.  Short service notice, if relevant (hours or a tenant-configured
    delivery/pickup message).
3.  Search field.
4.  Category navigation.
5.  Product grid/list.
6.  Persistent cart bar on mobile.
7.  Cart/checkout panel.
8.  Clear loading, empty, offline, and error states.

Do not clutter the page with a giant hero section that pushes products
below the fold. The main job is to help the customer find food and
order.

### 9.2 Responsive product cards

Each card should show:

-   Real product image or neutral placeholder.
-   Product name.
-   Price in the tenant's currency.
-   Concise description (usually two lines, with full details in the
    product detail panel).
-   Verified dietary/spice/allergen badges only when configured.
-   Clear `Add` or `Choose options` action.
-   A disabled `Sold out` state if the tenant chooses to display
    unavailable items.

Do not invent ratings, discount labels, "bestseller" badges, or scarcity
claims. If an item is paused or sold out, either hide it according to
the restaurant's setting or show it as unavailable; never leave it
orderable.

### 9.3 Layout behavior

-   Target a usable layout at 320, 360, 390, 430, 768, 1024, and 1280+
    CSS-pixel widths.
-   Use one-column cards when a two-column layout would make
    text/actions cramped; use two columns only when card width remains
    readable.
-   Keep category chips scrollable on mobile and expose their selected
    state accessibly.
-   Use clear focus rings and keyboard-accessible controls.
-   Make primary touch targets approximately 44--48 CSS pixels where
    practical.
-   Respect reduced-motion preferences.
-   Avoid fixed overlays that cover the composer, checkout buttons, or
    mobile keyboard.
-   Use the existing `Sheet`/drawer primitives where appropriate instead
    of adding a large new UI dependency.

### 9.4 Search and empty states

Add a simple menu search across product names, descriptions, and
explicitly configured aliases. Normalize case, whitespace, and common
punctuation; preserve the original display text.

For Pakistani menus, allow restaurant owners to add useful aliases such
as common English spellings or transliterations. Do not hard-code a list
of products or assume every restaurant has the same menu.

Examples of helpful empty states:

-   `No matching items. Try another name or category.`
-   `This restaurant has not published any items yet.`
-   `The menu could not load. Check your connection and try again.`

When configured, show the restaurant's opening information or
contact/handoff path rather than a dead end.

### 9.5 Loading and error states

-   Replace the blank loading screen with skeleton cards and a clear
    header.
-   Show a retry action on recoverable failures.
-   Do not reset the cart if the menu refresh fails.
-   Abort or ignore stale requests when the customer changes tenant/menu
    context.
-   Show a clear offline/network state; never claim an order was
    submitted when the server response is unknown.

------------------------------------------------------------------------

## 10. Phase 4 --- make cart and checkout honest, fast, and recoverable

### 10.1 One cart that is always reachable

The current cart is held in React state and is lost on reload. On mobile
it appears below the entire menu.

Implement:

-   A sticky mobile bar such as `Cart · 3 items · Rs 1,850 · View cart`.
-   A bottom sheet/drawer showing each line item, selected options,
    quantity, line total, edit, and remove actions.
-   Desktop cart panel that stays visible without crowding the menu.
-   Clear feedback after Add, increment, decrement, and remove.
-   An accessible live announcement for cart changes.
-   Client-side quantity and line-count limits matching server limits.
-   Persist cart state across refreshes with a tenant/store-specific key
    and schema version.
-   Preserve the cart through recoverable quote/order failures.
-   Avoid storing unnecessary personal data in local storage. Persist
    the cart first; persist customer details only under a clear,
    privacy-conscious policy.

### 10.2 Quote before final submission

Add or expose a server quote operation using the same pricing service as
order creation.

The quote should contain the authoritative:

-   Subtotal
-   Discount and applied offer, if any
-   Delivery fee
-   Other configured charges, if any
-   Total
-   Currency
-   Minimum-order requirement and shortfall, if applicable
-   Delivery-area result or pending-confirmation state
-   Quote version/expiry if needed

Recalculate at final submission. If the price or availability changes,
explain the change and request confirmation instead of silently charging
a different total.

### 10.3 Minimum-order and delivery-area UX

Show the threshold before the customer completes the form. For example:

`Minimum order: Rs 1,500. Add Rs 250 more to continue.`

The numbers are illustrative. Use actual tenant settings.

-   Show delivery fee and whether it applies to the selected fulfilment
    mode.
-   Do not apply delivery fees to pickup.
-   Do not hide the minimum-order rule until the final submit.
-   If the address is outside a configured area, show the reason and
    safe next step before collecting unnecessary information.
-   If delivery eligibility needs human confirmation, make that state
    explicit; do not promise a delivery that the server will later
    reject.
-   Offer suggested items to meet a minimum only when those products
    exist, are published/available, and their current prices are
    verified. Do not use manipulative pressure.

### 10.4 Checkout fields and progressive disclosure

Ask for only the fields required for the selected fulfilment type.

**Delivery** - Customer name - Phone - City/area and delivery
address/landmark according to tenant policy - Optional delivery
instructions - Order notes, including food requests where supported

**Pickup** - Customer name and phone if required by the restaurant -
Pickup details/time only if the feature is configured

**Shared** - Fulfilment mode only if enabled by the tenant. - Payment
method from the tenant's configured options (the current baseline is
COD). - Final itemized summary and explicit `Place order` confirmation.

The audit identifies a dead `notes` state: it is sent by the web client
but no customer input is rendered. Add the missing textarea and a clear
character limit (the audited server supports up to 500 characters). If
food customization and delivery instructions need different handling,
model them separately rather than ambiguously mixing them.

### 10.5 Error recovery

Map server error codes to useful actions:

-   Minimum not met → show the minimum and shortfall.
-   Delivery area not supported → show configured area/contact options.
-   Item no longer available → identify the item and let the customer
    remove or replace it.
-   Price changed → show the new quote and ask for confirmation.
-   Invalid phone/address → preserve other fields and focus the invalid
    field.
-   Network timeout → preserve cart and idempotency key; check order
    state before retry.
-   Rate limit → explain briefly and offer a reasonable retry path.

Never return raw stack traces, Firestore errors, or provider errors to
customers.

**Acceptance criteria:** a customer can add, edit, remove, refresh,
quote, and submit without losing the cart; delivery fees/minimums are
visible before final submission; the total matches the server; a retry
cannot create a second order.

------------------------------------------------------------------------

## 11. Phase 5 --- product detail and customizations

Implement after the image and cart foundations are stable.

### 11.1 Product detail panel

Open a drawer/bottom sheet when the customer taps the product image/name
or `Choose options`. It should show:

-   Larger image/gallery where available.
-   Full description.
-   Current price.
-   Configured options and add-ons.
-   Dietary/allergen/spice information only if configured.
-   Quantity and final Add button.

Avoid forcing a detail view for simple products with no extra
information if a direct Add action is sufficient.

### 11.2 Modifier/variant model

The audit finds no structured variants/modifiers. Add a tenant-managed
model for:

-   Single choice (e.g., size)
-   Multiple choice (e.g., add-ons)
-   Required vs optional groups
-   Minimum/maximum selections
-   Price delta for each option
-   Active/inactive option state

Do not build a stock-count or inventory model as part of this work.

### 11.3 Server validation and order snapshots

-   The server validates option/group/choice IDs against the current
    product configuration.
-   Client-provided labels and prices are never authoritative.
-   Required selections and min/max constraints are enforced on the
    server.
-   The quote and order service calculate option price deltas.
-   Order snapshots store resolved product name, option names,
    quantities, unit/option prices, and line totals.
-   Historical orders retain their original snapshot even if a
    restaurant edits the menu later.
-   AI menu search/quote/order tools must use the same definitions and
    validation.

**Acceptance criteria:** an invalid or stale option cannot be ordered,
configured totals match server calculations, and the dashboard can
clearly see the exact choices the customer made.

------------------------------------------------------------------------

## 12. Phase 6 --- reliable restaurant order management

### 12.1 Queue overview

Make `/dashboard/orders` an operational queue, not merely a list.

Recommended top-level elements:

-   New/received count.
-   Active order count.
-   Status filter chips derived from the canonical status enum.
-   Search by order number and permitted customer fields.
-   Date range and cursor pagination when needed.
-   Sort newest first, with active order age visible.
-   Clear loading, empty, offline, and failed-update states.

Include every supported status (`received`, `confirmed`, `preparing`,
`ready`, `dispatched`, `completed`, `declined`, `cancelled`) in the
appropriate filter or grouping.

### 12.2 New-order alerts and freshness

-   Use a secure realtime subscription only if Firestore rules and
    customer-data access are proven safe.
-   Otherwise use authenticated server polling (a 10--15 second interval
    is a reasonable starting point) with a manual refresh fallback.
-   Add a new-order badge and optional sound; make sound controllable
    because it can be disruptive.
-   Request browser-notification permission only after a clear user
    action.
-   Avoid showing duplicate alerts after reconnects or page reloads.
-   Display the last successful refresh time and a connection warning
    when updates are stale.

### 12.3 Order detail sheet

Use the existing sheet primitive if suitable. Include:

-   Order number and time in the tenant's timezone.
-   Current status and status timeline.
-   Items, quantities, modifiers, notes, subtotal, discount, delivery
    fee, total, and currency.
-   Fulfilment mode and address/landmark where relevant.
-   Tap-to-call phone action where supported.
-   Copy address and open-map action when a usable address/map link
    exists.
-   Print-friendly order receipt/kitchen ticket.
-   Decline/cancel reason when relevant.
-   Clear buttons for the next legal action only.

Do not create a POS or kitchen inventory workflow. A print-friendly
order ticket is an order-management aid, not a POS module.

### 12.4 Reliable status updates

-   Disable the action while its request is pending.
-   On success, use the server-returned order state.
-   On failure, show a toast/inline error and restore or refetch the
    real state.
-   Do not optimistically leave a false status visible.
-   Use a conflict response when another staff member changed the order.
-   Record `statusChangedBy`, `statusChangedAt`, and history events.
-   Capture a reason for decline/cancel where appropriate.
-   Keep payment updates separate and role-restricted.
-   Render timestamps using the tenant timezone, not only the staff
    browser timezone.

**Acceptance criteria:** staff can manage the complete order lifecycle,
all states are filterable, failed updates are visible and recoverable,
and every consequential state change is authorized and auditable.

------------------------------------------------------------------------

## 13. Phase 7 --- customer order tracking

The audited success screen is terminal: it shows the order number but
has no customer-facing tracking page/API.

Implement a minimal, privacy-safe flow:

1.  After order creation, return the actual order number and a
    high-entropy tracking token or a secure verification path.
2.  Provide a `Track order` link from the confirmation screen.
3.  Show a customer-safe timeline, for example
    `Received → Confirmed → Preparing → Ready/Dispatched → Completed`,
    adjusted for pickup vs delivery.
4.  Refresh status through a secure polling endpoint or another tested
    mechanism.
5.  Return only fields needed by the customer. Never expose staff-only
    data, full phone number, delivery notes, internal tenant settings,
    or another customer's order.
6.  Bind tracking to the resolved tenant and rate-limit guessing.
7.  Use a short-lived signed token or order-number plus verified phone
    flow. Avoid sequential IDs as the only authorization.
8.  Use consistent generic failures for invalid/cross-tenant tracking
    attempts so the endpoint does not leak whether an order exists.
9.  Provide a safe contact option when tracking is unavailable.
10. Do not show a fabricated ETA. Display an ETA only when a reliable,
    configured source exists.

If WhatsApp order notifications are later enabled, send only after
explicit customer consent and through a supported, configured channel.
Do not make notifications a dependency for placing or tracking an order.

------------------------------------------------------------------------

## 14. Performance and resilience

### 14.1 Storefront performance

-   Load the widget/storefront asynchronously where applicable.
-   Render the page shell and text/prices before waiting for large
    images.
-   Generate small card derivatives and larger detail images; do not
    send originals to every card.
-   Lazy-load images below the fold and reserve image dimensions.
-   Avoid loading the entire menu repeatedly on every small UI action.
-   Cache public menu data carefully, with tenant-scoped keys and
    explicit invalidation on menu changes.
-   Revalidate current price and availability during quote/order
    creation even if the public menu response is cached.
-   Use pagination or incremental loading if a tenant has a very large
    menu.
-   Abort stale requests and handle offline/reconnect states.
-   Avoid adding heavy dependencies unless the feature justifies them.

### 14.2 API and backend reliability

-   Replace process-local public rate limiting with a
    shared/platform-supported limiter suitable for serverless
    deployment.
-   Separate budgets for menu reads and order writes.
-   Validate trusted proxy/client-address handling rather than trusting
    arbitrary forwarded headers.
-   Use request IDs for diagnostics without logging sensitive customer
    content.
-   Add bounded retries with backoff for safe reads; never blindly retry
    order creation with a new key.
-   Make order creation idempotent and transactional.
-   Keep the manual refresh fallback even if realtime updates are
    introduced.
-   Verify all Firestore/Storage indexes, rules, and environment
    variables in deployment.

### 14.3 Measure instead of guessing

Record a baseline before changing performance. Suggested initial targets
to validate under representative test conditions:

-   Product card derivatives generally below 200 KB each where visual
    quality permits.
-   Menu content and usable controls appear quickly on a typical mobile
    connection; set and test a measured p75/p95 target.
-   Public menu and quote API latency are measured separately from image
    delivery.
-   Order submit shows progress immediately and never leaves the user in
    an indefinite loading state.
-   All errors have a recovery path and do not discard a valid cart.

These are engineering targets, not guarantees. Adjust them after
measuring real devices, network conditions, and expected tenant/menu
sizes.

------------------------------------------------------------------------

## 15. Accessibility and interaction details

-   All buttons have visible text or an accessible name.
-   Cart changes are announced to assistive technology.
-   Keyboard focus remains visible and moves sensibly when a sheet
    opens/closes.
-   Error messages are associated with their input fields.
-   Loading and submission states cannot be triggered repeatedly by
    double taps.
-   Images have appropriate alt text.
-   Status is not conveyed by color alone.
-   Touch targets are large enough for mobile use.
-   The bottom cart bar never covers checkout controls or the phone
    keyboard.
-   Urdu script uses RTL direction; Roman Urdu and English use LTR.
-   Respect reduced-motion preferences.
-   Test with keyboard navigation and at least one screen reader
    workflow.

------------------------------------------------------------------------

## 16. Analytics that help without becoming inventory/POS

Track only events needed to improve the ordering experience:

-   `menu_loaded`
-   `menu_search_used`
-   `product_viewed`
-   `product_added`
-   `cart_opened`
-   `cart_item_updated`
-   `quote_requested`
-   `checkout_started`
-   `checkout_validation_failed`
-   `order_created`
-   `order_status_changed`
-   `tracking_opened`
-   `upload_failed`
-   `order_update_failed`

Useful metrics:

-   Product view → Add rate.
-   Add → checkout rate.
-   Checkout completion rate.
-   Order submission retry/duplicate prevention rate.
-   Minimum-order and delivery-area failure rates.
-   Image upload success rate.
-   Mobile checkout completion vs desktop.
-   Time from `received` to first staff acknowledgement.
-   Status-update failure rate.
-   Menu items that customers search for but cannot find.

Do not collect full addresses, phone numbers, or full message bodies in
analytics. These metrics do not require inventory management or stock
counts.

------------------------------------------------------------------------

## 17. Recommended implementation roadmap

### Phase A --- safety and quick checkout fixes

**Implement first**

-   Verify and tighten Firestore/order-data access.
-   Add canonical menu/order types and shared runtime validation.
-   Enforce legal order transitions, order existence, and payment-role
    rules.
-   Make idempotency atomic and persist the key per cart revision.
-   Add the missing customer notes input.
-   Show delivery fee, minimum-order progress, and safe delivery-area
    result.
-   Reject invalid fulfilment and enum values; enforce pickup
    configuration.
-   Fix status-update errors and rollback/refetch behavior.
-   Resolve build configuration checks and duplicate Tailwind config
    after verifying the actual active config.

**Exit gate:** no known unauthorized order read, no illegal status
transition, no duplicate logical order under retry/concurrency, and
checkout shows honest fee/minimum/total information.

### Phase B --- product images and menu editor UX

-   Add secure Firebase Storage upload pipeline and Storage rules.
-   Add image preview, crop, progress, retry, replace, remove, and
    reorder.
-   Add canonical `ImageReference` model and public image fields.
-   Add responsive product cards, image fallback, and image
    optimization.
-   Move the item editor into a responsive sheet/drawer.
-   Add menu search, category/item ordering, archive impact warnings,
    and restore support where appropriate.

**Exit gate:** a restaurant can publish a real product image end-to-end
and use the editor on a phone without losing data.

### Phase C --- mobile storefront and search

-   Add sticky mobile cart bar and cart bottom sheet.
-   Add accessible quantity controls, explicit remove action, and add
    feedback.
-   Add skeleton/loading/empty/offline/retry states.
-   Add product search and category navigation improvements.
-   Test 320--430 px phone widths, tablet, and desktop.

**Exit gate:** customers can browse, add, edit, and remove items without
hunting for the cart or losing their selection on refresh.

### Phase D --- quote, checkout, and customer tracking

-   Add authoritative server quote response.
-   Show itemized total and price-change confirmation.
-   Improve Pakistan phone/address/landmark flow and language direction.
-   Add secure customer tracking page/API and status timeline.
-   Add retry-safe submission and recovery after uncertain network
    results.

**Exit gate:** a customer sees the actual total before final
confirmation and can safely recover/track an order without
staff-dashboard access.

### Phase E --- restaurant order operations

-   Complete status filters, search, pagination, and order detail sheet.
-   Add secure realtime updates or polling with manual fallback.
-   Add optional new-order alerts, status age, audit history, print
    ticket, copy address, and tap-to-call.
-   Localize timestamps to the tenant timezone.
-   Test multi-staff concurrent updates.

**Exit gate:** staff can reliably manage the whole order lifecycle and
recover from failed requests.

### Phase F --- customizations and growth

-   Add structured variants/modifiers and price deltas.
-   Add product detail drawer.
-   Add configured dietary/spice/allergen fields.
-   Add bulk menu actions and optional duplicate product.
-   Add analytics from the defined event list.

**Exit gate:** customizations are server-validated, order snapshots
remain historically accurate, and AI/web ordering use the same options
and pricing.

------------------------------------------------------------------------

## 18. Test plan: required before calling a phase complete

### 18.1 Unit tests

-   Shared menu schema for create and update.
-   Valid/invalid category, price, name, description, status, and
    availability.
-   Money formatting for PKR and at least one decimal currency.
-   Pakistani phone normalization, invalid numbers, and explicit
    international formats.
-   Delivery fee, minimum order, offer, pickup, and delivery-area
    calculations.
-   Legal and illegal order transitions.
-   Idempotency key lifecycle.
-   Modifier validation and price deltas.
-   Safe public tracking response.

### 18.2 API/integration tests

-   Tenant A cannot read or modify Tenant B menu, media, or orders.
-   Read-only users cannot change menu or payment state.
-   Nonexistent item/category/order updates return safe 4xx responses
    rather than creating phantom records.
-   Archived/unpublished/unavailable products cannot be ordered.
-   Pickup-disabled restaurants reject pickup.
-   Invalid fulfilment values are rejected.
-   Quote and order creation return matching totals when the underlying
    data has not changed.
-   Stale price/availability produces an actionable response.
-   Repeated and concurrent submissions with the same idempotency key
    create one logical order.
-   Storage upload rejects wrong MIME, oversized, corrupt, or
    unauthorized files.
-   Deleted/replaced images do not leave broken public references.
-   Tracking cannot reveal customer PII or cross-tenant orders.
-   Public endpoints are rate-limited across serverless instances.

### 18.3 UI/component tests

-   Image preview, retry, replacement, removal, and failed upload.
-   Menu form validation and unsaved-change warning.
-   Search, category filter, empty results, and image fallback.
-   Cart add/increment/decrement/remove and cart persistence.
-   Minimum-order progress, delivery fee, notes field, and quote
    rendering.
-   Error messages preserve cart/form values.
-   Double-tap submit does not create two orders.
-   Dashboard status failure shows an error and does not leave false
    state.
-   All status filters match the canonical enum.
-   Keyboard focus and screen-reader cart announcements.

### 18.4 End-to-end tests

1.  Restaurant owner creates a category and product.
2.  Owner uploads a real image, crops it, saves, and publishes the
    product.
3.  Customer opens the public store on a mobile viewport and sees the
    image/card.
4.  Customer searches, adds two items, edits quantity, and opens the
    sticky cart.
5.  Customer enters Pakistani mobile number, area/landmark, and order
    notes.
6.  Customer sees delivery fee and minimum-order shortfall before
    submission.
7.  Customer completes a valid order and receives a real order
    number/tracking link.
8.  A retry or network timeout does not create a duplicate order.
9.  Staff confirms and advances the order through legal states.
10. Customer tracking displays the safe updated status.
11. Cross-tenant and unauthorized requests fail.
12. Repeat the primary flow at 320, 360, 390, and 430 px widths and on
    desktop.

### 18.5 CI and release gates

Keep the repository's lint, typecheck, test, and build checks. Add the
missing API/rules/UI tests incrementally. Run Firebase emulator rules
tests where appropriate. Verify the production build with correctly
configured environment variables. A phase is not complete because the
page "looks right"; it is complete only when the acceptance criteria and
relevant tests pass.

------------------------------------------------------------------------

## 19. Repository areas the coding agent should inspect

Use the existing structure and re-open the current branch before
changing code.

-   `src/app/dashboard/menu/page.tsx` --- menu editor UX.
-   `src/app/api/menu/items/route.ts` --- product validation and image
    references.
-   `src/app/api/menu/categories/route.ts` --- category lifecycle and
    ordering.
-   `src/app/store/page.tsx` --- product cards, cart, checkout,
    loading/error states.
-   `src/app/api/store/route.ts` --- public menu payload, quote/order
    handling, public errors.
-   `src/lib/services/orders.ts` --- server-side pricing, order
    creation, idempotency, delivery rules.
-   `src/app/dashboard/orders/page.tsx` --- order queue, status actions,
    error recovery.
-   `src/app/api/orders/route.ts` --- authenticated order operations and
    transitions.
-   `src/lib/tenancy/resolver.ts` and `src/lib/auth/session.ts` ---
    tenant/role access.
-   `src/lib/widget/service.ts` --- public key resolution and rate
    limiting.
-   `src/lib/ai/tools.ts` and `src/lib/ai/context-builder.ts` ---
    preserve the shared AI ordering path and invalidate cached menu
    context after menu edits.
-   `src/types/schema.ts` or a new canonical `src/types/menu.ts` /
    `src/types/orders.ts` --- shared contracts.
-   `src/lib/firebase/config.ts`, `.env.example`, `firestore.rules`, and
    new `storage.rules` --- Firebase configuration and access rules.
-   `next.config.mjs` --- image configuration if required.
-   `tests/` and `.github/workflows/ci.yml` --- regression and release
    gates.

------------------------------------------------------------------------

## 20. Instructions for the AI coding agent

1.  Read this plan and both supplied audit reports before editing.
2.  Verify the current branch/commit and inspect the relevant files; do
    not blindly trust old line numbers.
3.  Produce a short implementation checklist for the selected phase
    before coding.
4.  Preserve working menu CRUD, server-side pricing, offer logic, tenant
    paths, AI tools, and order creation unless a tested refactor is
    necessary.
5.  Do not introduce POS, inventory, stock counts, purchasing, or
    recipe-costing features.
6.  Do not introduce a payment gateway.
7.  Do not replace existing functionality with mock data or placeholder
    success responses.
8.  Never trust client-supplied prices, option prices, totals, tenant
    IDs, or order statuses.
9.  Never expose secrets or private customer fields in public payloads,
    logs, or analytics.
10. Implement one phase at a time with migrations/backward-compatible
    defaults for existing Firestore records.
11. Add regression tests for every fixed bug and feature tests for every
    new user flow.
12. Run lint, typecheck, tests, and build after each phase; report exact
    results rather than claiming they passed without running them.
13. If an environment variable or Firebase deployment setting is
    missing, report the exact configuration requirement; do not
    hard-code credentials.
14. After each phase, report changed files, schema/rules changes, test
    results, migration/backfill needs, deployment steps, and known
    limitations.
15. Do not claim "bug-free" based on a successful build alone. Use the
    release gates above and fix regressions before moving to the next
    phase.

------------------------------------------------------------------------

## 21. Definition of done

CafeConnect's menu/order experience is ready for release when:

-   Existing manual menu creation/editing remains intact and validated
    consistently.
-   Product images can be uploaded, optimized, replaced, deleted, and
    shown safely.
-   Mobile customers can browse products and reach the cart at any
    point.
-   Product details/options are clear and never invent facts or prices.
-   Pakistani phone, address/landmark, COD, PKR, and language flows are
    understandable and configurable.
-   Delivery fee, minimum order, discounts, and final total are visible
    and server-authoritative.
-   Notes/customizations reach the restaurant with the order.
-   Retries cannot create duplicate logical orders.
-   Customers can securely track their order with minimal data exposure.
-   Restaurant staff have a complete, searchable, recoverable order
    queue and legal status transitions.
-   Cross-tenant, privacy, storage, responsive, accessibility,
    integration, and end-to-end tests pass.
-   Build/deployment configuration is verified in CI.
-   No POS, inventory, stock-count, or stock-tracking feature has been
    introduced.

**Final product direction:** CafeConnect should feel like a fast,
trustworthy online menu and order-management service designed around
real restaurant workflows---not a POS, and not just a pretty catalogue.
