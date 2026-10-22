# RestroBit-Inspired POS Dashboard --- Design System

**Document type:** UI design-system specification\
**Reference:** User-provided POS dashboard screenshot (752 × 564 px)\
**Status:** Screenshot-derived analysis + implementation
recommendations\
**Intended use:** Front-end implementation, design tokens, reusable
component library, responsive layout, and visual QA

> **Measurement note:** The source is a small raster screenshot, not the
> original design file or CSS. Colors, font sizes, spacing, and
> dimensions below are visual estimates. The screenshot shows a desktop
> POS layout only; responsive breakpoints and interaction states cannot
> be confirmed from this image. Values marked **recommended** are
> implementation choices intended to preserve the visual style while
> improving legibility and usability.

------------------------------------------------------------------------

## 1. Design direction

The interface is a light, compact restaurant Point of Sale (POS)
dashboard. Its visual language is practical rather than decorative:

-   White and near-white surfaces with subtle gray borders.
-   A warm orange primary action color.
-   Green for successful/positive actions and red for destructive
    actions.
-   Dark navy/charcoal for high-emphasis actions such as **KOT &
    Print**.
-   Small, restrained typography and compact controls.
-   A persistent left navigation rail, product browsing workspace, and
    order/cart panel.
-   Food photography is the main visual content; UI chrome stays
    neutral.
-   Rounded rectangles are used consistently, but corners remain
    relatively modest.
-   Borders do most of the separation work; shadows are very subtle.

**Implementation goal:** retain the screenshot's clean, compact
restaurant-workflow feel, but do not copy its smallest text and hit
targets literally on phones. Preserve density on desktop and prioritize
readability, accessible contrast, and touch-friendly controls on smaller
screens.

## 2. Color palette

### 2.1 Core tokens

The orange and green values below are close to the strongest colored
pixels in the screenshot. Neutral and text colors are estimated from the
visible UI.

  ------------------------------------------------------------------------------
  Token                          Hex                     Intended use
  ------------------------------ ----------------------- -----------------------
  `color.brand.primary`          `#F97316`               Main CTA, selected
                                                         category, active
                                                         accent, key add action

  `color.brand.primary-hover`    `#EA580C`               Hover/pressed state for
                                                         orange controls

  `color.brand.primary-active`   `#C2410C`               Active/pressed emphasis
                                                         when needed

  `color.brand.primary-soft`     `#FFF7ED`               Soft orange
                                                         backgrounds,
                                                         selected-row tint

  `color.brand.primary-border`   `#FED7AA`               Soft orange outlines

  `color.success`                `#16A34A`               Positive action,
                                                         successful completion,
                                                         Bill & Print

  `color.success-hover`          `#15803D`               Green hover/pressed
                                                         state

  `color.success-soft`           `#F0FDF4`               Success feedback
                                                         background

  `color.danger`                 `#EF4444`               Delete/remove icon,
                                                         destructive action

  `color.danger-hover`           `#DC2626`               Destructive
                                                         hover/pressed state

  `color.danger-soft`            `#FEF2F2`               Error/destructive
                                                         feedback background

  `color.action.dark`            `#111827`               KOT & Print /
                                                         high-emphasis dark
                                                         action

  `color.action.dark-hover`      `#1F2937`               Dark button hover

  `color.text.primary`           `#111827`               Page title, product
                                                         name, totals

  `color.text.secondary`         `#6B7280`               Breadcrumbs,
                                                         descriptions, secondary
                                                         labels

  `color.text.muted`             `#9CA3AF`               Hints, inactive
                                                         metadata, placeholder
                                                         text

  `color.text.inverse`           `#FFFFFF`               Text/icons on filled
                                                         buttons

  `color.surface.base`           `#FFFFFF`               Main app, cards, inputs

  `color.surface.subtle`         `#FAFAFA`               Main canvas and lightly
                                                         differentiated panels

  `color.surface.muted`          `#F5F5F5`               Hover/selected neutral
                                                         backgrounds

  `color.border.default`         `#E5E7EB`               Inputs, cards,
                                                         separators

  `color.border.strong`          `#D1D5DB`               Stronger outlines and
                                                         focused structural
                                                         separation

  `color.icon.default`           `#6B7280`               Default
                                                         utility/navigation
                                                         icons

  `color.icon.subtle`            `#9CA3AF`               Secondary icons

  `color.canvas.outside`         `#BDBDBD`               Gray surrounding area
                                                         visible outside the app
                                                         frame in the
                                                         screenshot; usually
                                                         omit this in the actual
                                                         application
  ------------------------------------------------------------------------------

### 2.2 Semantic colors

Use semantic tokens in components rather than hard-coding palette hex
values repeatedly.

  --------------------------------------------------------------------------
  Semantic role           Token                      Rule
  ----------------------- -------------------------- -----------------------
  Primary action          `color.action.primary`     Orange fill, white
                                                     label

  Secondary action        `color.action.secondary`   White fill, neutral
                                                     border, dark label

  Success action          `color.action.success`     Green fill, white label

  Destructive action      `color.action.danger`      Red for delete/remove;
                                                     use a confirmation for
                                                     consequential actions

  Main content            `color.surface.base`       White

  Quiet surface           `color.surface.subtle`     Near-white

  Standard text           `color.text.primary`       Dark charcoal

  Supporting text         `color.text.secondary`     Medium gray

  Divider                 `color.border.default`     Light gray

  Focus indicator         `color.focus.ring`         Orange with enough
                                                     contrast against white
  --------------------------------------------------------------------------

### 2.3 Color usage patterns

-   **Orange is the brand/action accent, not a general decoration
    color.** Use it for the selected `Show All` category, `+ New`, and
    the primary checkout/payment action.
-   **Green means positive/completion.** The screenshot uses green for
    `Bill & Print`; do not use green for unrelated neutral actions.
-   **Red means destructive or error-related.** Small trash/remove
    controls are red. Do not use red as a general badge color.
-   **Dark navy/charcoal means high emphasis.** The dark `KOT & Print`
    action stands out from the orange and green actions.
-   **White is the dominant surface.** Use very light gray for
    boundaries and secondary panel fills, not large saturated blocks.
-   **Food photography provides most of the color variation.** Avoid
    colorful card backgrounds that compete with the food imagery.
-   **Do not communicate status by color alone.** Pair status colors
    with labels/icons and accessible text.

### 2.4 Contrast recommendation

The screenshot is too small to verify every text/color contrast ratio.
Before release, measure actual rendered tokens against WCAG contrast
requirements. Prefer `#111827` for normal text on white; do not use pale
gray for essential labels. Small text on colored buttons should be white
only where the chosen background provides sufficient contrast.

------------------------------------------------------------------------

## 3. Typography

### 3.1 Font family

The exact font cannot be reliably identified from the raster screenshot.
The interface resembles a modern neutral sans-serif.

**Recommended stack:**

``` css
font-family:
  Inter,
  ui-sans-serif,
  system-ui,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  sans-serif;
```

If Inter is not already part of the application, use the system stack
rather than adding a large font dependency solely to match the
screenshot. Use a consistent font across navigation, product cards,
buttons, totals, and forms.

### 3.2 Type scale

The screenshot's typography is extremely compact at the displayed
resolution. The following scale preserves its hierarchy while improving
implementation readability.

  ----------------------------------------------------------------------------
  Token             Recommended     Line height          Weight Typical use
                           size                                 
  ------------- --------------- --------------- --------------- --------------
  `type.xs`               11 px           16 px        400--500 Dense
                                                                metadata,
                                                                compact
                                                                labels; avoid
                                                                for essential
                                                                mobile text

  `type.sm`               12 px           16 px        400--500 Breadcrumbs,
                                                                category
                                                                labels, helper
                                                                text

  `type.base`             14 px           20 px             400 Product names,
                                                                inputs, body
                                                                copy

  `type.md`               16 px           24 px        400--500 Important form
                                                                values,
                                                                prominent
                                                                descriptions

  `type.lg`               18 px           26 px             600 Section
                                                                headings,
                                                                drawer titles

  `type.xl`               20 px           28 px             600 Page title at
                                                                standard
                                                                desktop
                                                                density

  `type.2xl`              24 px           32 px        600--700 Large totals
                                                                or major
                                                                section
                                                                headings when
                                                                space allows
  ----------------------------------------------------------------------------

For a close match to the screenshot, the page heading appears
approximately 13--15 px at the screenshot's displayed scale; navigation
and button labels appear roughly 9--11 px. Treat these as visual
estimates, not authoritative CSS values. Do not reduce text to these
sizes if the implementation is meant to be comfortably usable on modern
devices.

### 3.3 Weights and hierarchy

-   **400 / Regular:** descriptions, inputs, metadata, product names.
-   **500 / Medium:** navigation labels, category chips, button labels,
    prices.
-   **600 / Semibold:** page titles, section titles, order number,
    subtotal/total labels.
-   **700 / Bold:** reserve for the final order total or rare
    high-priority emphasis.

The screenshot uses weight and darkness rather than oversized type to
establish hierarchy.

### 3.4 Text styles

  -------------------------------------------------------------------------
  Style                   Suggested tokens          Guidance
  ----------------------- ------------------------- -----------------------
  Page title              `type.xl`, weight 600,    "Point of Sale (POS)"
                          `color.text.primary`      

  Breadcrumb              `type.xs` or `type.sm`,   Quietly supports
                          weight 400, secondary     location/context
                          color                     

  Sidebar item            `type.sm`, weight         Keep label and icon
                          400--500                  vertically aligned

  Product name            `type.sm`--`type.base`,   Allow two lines without
                          weight 500                card overflow

  Product price           `type.sm`, weight         Keep price readable and
                          500--600, brand/danger    consistently placed
                          accent used sparingly     

  Input label             `type.sm`, weight 500     Place above the control
                                                    where possible

  Placeholder             `type.sm`, weight 400,    Must remain readable
                          muted color               

  Order section label     `type.sm`, weight 600     "Order #20"

  Summary row             `type.sm`, weight         Align labels left and
                          400--500                  amounts right

  Grand total             `type.base`--`type.md`,   Strongest typographic
                          weight 700                emphasis in order
                                                    summary

  Button label            `type.sm`, weight         Short verb-first labels
                          500--600                  
  -------------------------------------------------------------------------

### 3.5 Line height and letter spacing

-   Use approximately `1.4`--`1.5` line-height for body text and
    descriptions.
-   Use `1.25`--`1.35` for headings.
-   Use normal letter spacing (`0` or browser normal) for most text.
-   Avoid tracking on small UI labels; the screenshot does not show wide
    letter spacing.
-   Truncate long product descriptions after two lines in the grid and
    show full text in a detail view.
-   Do not truncate order IDs, prices, or essential action labels.

------------------------------------------------------------------------

## 4. Spacing and layout system

### 4.1 Base unit

**Recommended base unit: 4 px.** Most UI spacing can be represented as
multiples of 4, with 2 px reserved for tiny optical adjustments.

### 4.2 Spacing scale

  Token           Value Typical use
  ------------- ------- ---------------------------------------
  `space.0`        0 px Reset
  `space.0_5`      2 px Icon/text optical adjustment
  `space.1`        4 px Tight icon gap, small badge padding
  `space.2`        8 px Button icon gap, compact card padding
  `space.3`       12 px Input padding, compact section gap
  `space.4`       16 px Standard card/page padding
  `space.5`       20 px Main panel spacing
  `space.6`       24 px Section separation
  `space.8`       32 px Large section gap
  `space.10`      40 px Major page spacing
  `space.12`      48 px Large layout separation

### 4.3 Screenshot layout proportions

Approximate geometry in the 752 × 564 screenshot:

-   App frame: about 714 × 509 px, inset roughly 19--20 px from the left
    and 27--29 px from the top.
-   Sidebar: about 120 px wide, approximately 17% of the app frame.
-   Top header: roughly 40 px tall in the displayed image.
-   Workspace: split into a product/menu area of about 60--63% and an
    order panel of about 35--38%, with a narrow gap.
-   Product grid: four columns visible at this displayed width; each
    card is a compact white tile.
-   Order panel: fixed-looking right column containing search, order
    details, totals, and bottom action buttons.

These are measurements of the provided image, not the original browser's
CSS layout. Use proportions to reproduce the composition, then scale
controls and typography appropriately for the actual target viewport.

### 4.4 Desktop layout

Recommended desktop structure:

``` text
┌─────────────────────────────────────────────────────────────────┐
│ Sidebar │ Top bar: search / utility icons / profile              │
│         ├────────────────────────────────────────────────────────┤
│         │ Page title + breadcrumb + page actions                 │
│         ├─────────────────────────────────────┬──────────────────┤
│         │ Menu controls + category chips      │ Order panel      │
│         │                                     │ Search/existing  │
│         │ Product grid                        │ Items/notes      │
│         │                                     │ Summary/actions  │
│         └─────────────────────────────────────┴──────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

-   Use a full-height app shell with a stable sidebar.
-   Keep the top bar separate from the page content.
-   Use a flexible product workspace and a constrained order panel.
-   Keep the order summary and primary actions visible while scrolling
    the menu where viewport height allows.
-   Use `min-width: 0` on flexible grid children to prevent overflow.
-   Avoid nested scroll containers unless each has a clear purpose.

Suggested desktop sizing at a conventional 1280--1440 px viewport:

-   Sidebar: 220--240 px.
-   Main page padding: 20--24 px.
-   Gap between product workspace and order panel: 16 px.
-   Order panel: 320--380 px, with a maximum width where necessary.
-   Product grid: `repeat(3, minmax(0, 1fr))` at narrower desktop widths
    and four or more columns only when each card remains comfortably
    readable.

These are recommended production values, not dimensions directly proven
by the screenshot.

### 4.5 Responsive behavior

The screenshot itself only shows a desktop composition. Use these
**recommended** breakpoints as a starting point, and verify them against
the existing application framework:

  ------------------------------------------------------------------------
  Breakpoint token                             Width Recommended behavior
  --------------------- ---------------------------- ---------------------
  `bp.sm`                                     640 px Small tablet/large
                                                     phone layout;
                                                     simplify secondary
                                                     chrome

  `bp.md`                                     768 px Sidebar may collapse
                                                     to icons or a drawer;
                                                     menu grid adjusts

  `bp.lg`                                    1024 px Desktop two-panel POS
                                                     layout when the order
                                                     panel still fits

  `bp.xl`                                    1280 px Full sidebar, larger
                                                     product grid,
                                                     comfortable panel
                                                     widths
  ------------------------------------------------------------------------

**Below 768 px:**

-   Collapse the full sidebar into a drawer or compact top navigation.
-   Put search and category filters above the product list.
-   Use one or two product columns depending on actual card width.
-   Replace the permanent right-hand order panel with a sticky bottom
    cart bar and a full-height/bottom-sheet cart.
-   Ensure the software keyboard does not cover inputs or the submit
    button.
-   Keep the final total and primary checkout action easy to find.
-   Do not attempt to squeeze the desktop's four-column product grid and
    right-side order panel into a phone.

**Tablet:**

-   Use a collapsible sidebar.
-   Prefer two product columns and a drawer for the order panel when
    horizontal space is limited.
-   Keep controls large enough for touch.

------------------------------------------------------------------------

## 5. Component library

Use consistent shared components instead of styling each screen
independently.

### 5.1 Buttons

#### Primary button

-   Fill: `color.brand.primary` (`#F97316`)
-   Text: white
-   Border: transparent or same as fill
-   Radius: `radius.md` (about 6 px)
-   Height: 34--40 px on desktop; 44--48 px on touch layouts
-   Horizontal padding: 12--16 px
-   Weight: 500--600
-   Use for `+ New`, `Bill & Payment`, and the single main action on a
    screen.

#### Secondary / outline button

-   Fill: white
-   Border: `color.border.default`
-   Text: `color.text.primary` or secondary
-   Radius: about 6 px
-   Height: 32--40 px desktop; 44 px touch
-   Use for `QR Menu Orders`, `Draft List`, `Table Order`, `Draft`, and
    other less-emphasized actions.

#### Dark action button

-   Fill: `color.action.dark` (`#111827`)
-   Text: white
-   Use for `KOT & Print` or other primary workflow actions where a dark
    action is intentionally distinguished from the orange primary CTA.
-   Avoid using multiple visually dominant buttons for unrelated actions
    in the same group.

#### Success button

-   Fill: `color.success` (`#16A34A`)
-   Text: white
-   Use for `Bill & Print` or explicit completion actions.

#### Icon-only button

-   Recommended size: 32--36 px desktop, at least 40--44 px touch where
    possible.
-   Use for add/remove, trash, and utility icons only when the action is
    unambiguous.
-   Include an accessible label and tooltip where appropriate.
-   Destructive icon-only controls should have a safe confirmation or
    undo flow.

#### Button states

  -----------------------------------------------------------------------
  State                               Visual behavior
  ----------------------------------- -----------------------------------
  Default                             Semantic fill and text; crisp
                                      boundary

  Hover                               Darken filled color slightly or add
                                      a very light neutral surface

  Focus-visible                       2--3 px visible focus ring with
                                      offset; do not remove outline
                                      without replacement

  Pressed                             Slightly darker fill; no major
                                      layout movement

  Disabled                            Muted surface/text, clear disabled
                                      state, no hover effect

  Loading                             Keep button width stable; show
                                      progress indicator and prevent
                                      duplicate submit

  Error                               Show a nearby actionable message;
                                      don't rely only on button color
  -----------------------------------------------------------------------

Use consistent icon-to-label spacing (about 6--8 px). Avoid tiny buttons
with long labels.

### 5.2 Search and input fields

The screenshot includes search inputs with light borders, white fill, a
search icon, and compact rounded corners.

Recommended input tokens:

-   Height: 36--40 px desktop; 44--48 px touch layout.
-   Horizontal padding: 10--12 px.
-   Radius: 6 px.
-   Border: `#E5E7EB`.
-   Fill: `#FFFFFF`.
-   Text: `#111827`.
-   Placeholder: `#9CA3AF`.
-   Leading icon: 14--16 px.
-   Focus border: brand orange or neutral strong border plus visible
    focus ring.

Component variants:

-   `SearchInput`: search icon, clear action after text is entered,
    label or accessible name.
-   `TextInput`: label, input, helper/error text.
-   `Select`: visible selected value and chevron; adequate menu width.
-   `Textarea`: for order notes, with character limit and helper text.
-   `QuantityInput`: small minus/value/plus group with labelled controls
    and a visible disabled state at min/max.

Do not use placeholder text as the only label. Preserve entered values
when a request fails.

### 5.3 Product card

**Observed structure:** image near the top, product name beneath,
orange/red-accented price, and a small orange add button near the lower
corner.

Recommended anatomy:

1.  Image container with fixed aspect ratio (e.g. 4:3 or square; choose
    one and use it consistently).
2.  Product name, maximum two lines.
3.  Price row.
4.  Optional configured availability/option hint.
5.  Add button or quantity controls.

Suggested values:

-   Background: white.
-   Border: `#E5E7EB`, 1 px.
-   Radius: 8 px.
-   Padding: 8--12 px for dense desktop grid, 12 px or more for mobile.
-   Image gap: 8 px.
-   Hover: slightly stronger border or soft shadow; do not make the
    whole card look like a button if only part of it is interactive.
-   Selected/added state: show quantity or brief feedback without
    changing the card's dimensions.
-   Sold-out state: disabled Add action and clear text.
-   Image failure: neutral placeholder with preserved product
    name/price.

Use actual product images. Never substitute a different dish just
because an image is missing.

### 5.4 Order/cart panel

Use a white bordered container with a fixed header/section structure.

**Suggested sections:**

-   Existing order/search input.
-   Order mode selectors (e.g. delivery/table) when applicable.
-   Order identifier.
-   Line items with name, price/quantity, options, notes, and remove
    action.
-   Subtotal, discount, extra discount, coupon, and total rows where
    supported.
-   Bottom action group: KOT & Print, Draft, Bill & Payment, Bill &
    Print.

Guidance:

-   Use `display: flex` for line-item alignment.
-   Keep item descriptions on the left and amounts aligned right.
-   Make the final total bold and easy to scan.
-   Separate summary rows with spacing rather than heavy horizontal
    rules.
-   If the list is scrollable, keep the total/action area visible
    without obscuring content.
-   Show an empty-cart state with a clear next step.
-   Confirm before clearing an order or removing multiple items.
-   Do not show discount rows that do not apply unless the business
    explicitly needs them.

### 5.5 Navigation sidebar

**Observed pattern:** brand/logo at top, staff profile, vertical
navigation, grouped labels such as `Offering` and `Back Office`, and a
bottom-anchored Login action.

Recommended styling:

-   Background: white or `#FAFAFA`.
-   Right boundary: 1 px `#E5E7EB`.
-   Brand row: 40--48 px high.
-   Profile: avatar (28--32 px), name and role stacked.
-   Nav row: 34--40 px high desktop; 44--48 px touch layout.
-   Icon: 14--16 px desktop, consistent stroke weight.
-   Label: 12--14 px, medium/regular.
-   Horizontal padding: 10--12 px.
-   Radius for selected row: 5--6 px.
-   Group headings: 10--11 px, secondary color, medium weight.
-   Active row: pale gray fill or subtle border; optional small orange
    accent.
-   Hover row: `#F5F5F5`.
-   Bottom utility/login action anchored separately from the scrollable
    menu.

Use a single icon family, ideally Lucide-style outline icons or the icon
library already installed in the project. Avoid mixing filled, outline,
and emoji icons in the same navigation.

### 5.6 Category chips

The screenshot shows a horizontal category row with an orange filled
active chip and white/neutral inactive chips.

-   Active: orange fill, white text.
-   Inactive: white or transparent fill, neutral text.
-   Border: none or subtle gray.
-   Radius: 5--6 px.
-   Height: 28--32 px dense desktop; 36--40 px on touch layouts.
-   Horizontal padding: 10--12 px.
-   Gap: 6--8 px.
-   Provide clear keyboard focus and selected semantics.
-   Allow horizontal scrolling on narrow screens without wrapping into
    an excessively tall block.

### 5.7 Badges and status labels

-   Keep badges small and restrained.
-   Use semantic colors only for actual status.
-   Pair a status label with color and/or icon.
-   Do not rely on color alone.
-   Avoid unnecessary `New` or promotional badges unless they represent
    real state.

### 5.8 Iconography

-   Style: thin-to-medium outline icons, mostly gray.
-   Size: 14--16 px in compact UI, 18--20 px in larger touch controls.
-   Stroke width: around 1.5--2 px if using SVG icons.
-   Align icons optically to the text baseline.
-   Use consistent icon semantics for search, table, reservations,
    customer, invoice, settings, add, trash, edit, and print.
-   Provide `aria-label` for icon-only controls.
-   Do not use emojis as substitutes for interface icons.

### 5.9 Summary rows and order totals

-   Use a two-column row: descriptive label on the left, value
    right-aligned.
-   Use tabular numerals for monetary amounts if the font supports them.
-   Keep the currency symbol/abbreviation consistent.
-   Discount rows may use a semantic accent, but do not make every row
    colorful.
-   Grand total: weight 700, slightly larger than the other rows.
-   Validate totals from the server; the UI must not invent or
    independently recalculate authoritative prices.

------------------------------------------------------------------------

## 6. Radius, border, and elevation tokens

### 6.1 Border radius

  ------------------------------------------------------------------------
  Token                                        Value Usage
  --------------------- ---------------------------- ---------------------
  `radius.xs`                                   3 px Tiny compact controls
                                                     if required

  `radius.sm`                                   4 px Small chips or
                                                     compact elements

  `radius.md`                                   6 px Inputs, buttons, nav
                                                     selected state

  `radius.lg`                                   8 px Product cards and
                                                     panels

  `radius.xl`                              10--12 px Main app frame and
                                                     larger sheets

  `radius.full`                               999 px Circular avatars and
                                                     round icon buttons
                                                     only
  ------------------------------------------------------------------------

The screenshot's visual style is moderately rounded rather than
pill-shaped. Avoid making every button fully rounded.

### 6.2 Borders

-   Standard: `1px solid #E5E7EB`.
-   Strong: `1px solid #D1D5DB`.
-   Selected: subtle brand tint or orange accent where needed.
-   Focus: visible focus ring, not merely a small border-color change.
-   Dividers: `1px solid #F3F4F6` for low-emphasis separation.

### 6.3 Shadows

The screenshot uses very little elevation. Prefer borders and background
contrast.

Recommended:

``` css
--shadow-sm: 0 1px 2px rgb(17 24 39 / 0.04);
--shadow-md: 0 4px 12px rgb(17 24 39 / 0.08);
--shadow-lg: 0 12px 28px rgb(17 24 39 / 0.12);
```

Use `shadow-sm` for floating cards only when necessary; `shadow-md` for
dropdowns, popovers, and drawers; `shadow-lg` for modal overlays. Do not
put a strong shadow on every product tile.

------------------------------------------------------------------------

## 7. Interaction and visual patterns

### 7.1 Hover and focus

-   Product card hover: slight border darkening or a very subtle shadow.
-   Nav hover: light neutral fill.
-   Button hover: small semantic color shift.
-   Input focus: visible focus ring and border change.
-   Category hover: neutral tint; active category remains visually
    distinct.
-   Do not depend on hover for mobile users; all functionality must be
    available on tap.

### 7.2 Feedback patterns

-   **Add item:** immediate quantity/cart count update and optional
    short confirmation.
-   **Save product:** visible saving state followed by success/error
    feedback.
-   **Place order:** lock repeated submission, show progress, and
    preserve data on failure.
-   **Status update:** wait for the server result; on failure show an
    error and reconcile the row with server state.
-   **Delete/archive:** confirm consequential action or provide a clear
    undo/restore path.
-   **Image upload:** progress, retry, and safe failure fallback.
-   **Network loss:** show stale/offline status and a retry action
    without clearing the current order.

### 7.3 Animation

Keep motion short and purposeful:

-   Small state transition: 120--180 ms.
-   Drawer/sheet: 180--240 ms.
-   Prefer opacity/transform; avoid animating layout dimensions
    unnecessarily.
-   Respect `prefers-reduced-motion`.
-   Avoid bouncing or attention-grabbing animations in the order queue.

------------------------------------------------------------------------

## 8. Design tokens: implementation-ready CSS

This token set is a recommended starting point. Adjust values after
comparing the rendered UI against the screenshot and testing real
devices.

``` css
:root {
  /* Brand */
  --color-brand-primary: #F97316;
  --color-brand-primary-hover: #EA580C;
  --color-brand-primary-active: #C2410C;
  --color-brand-primary-soft: #FFF7ED;
  --color-brand-primary-border: #FED7AA;

  /* Semantic */
  --color-success: #16A34A;
  --color-success-hover: #15803D;
  --color-success-soft: #F0FDF4;
  --color-danger: #EF4444;
  --color-danger-hover: #DC2626;
  --color-danger-soft: #FEF2F2;
  --color-action-dark: #111827;
  --color-action-dark-hover: #1F2937;

  /* Surfaces */
  --color-canvas: #FAFAFA;
  --color-surface: #FFFFFF;
  --color-surface-subtle: #F5F5F5;
  --color-surface-hover: #F3F4F6;

  /* Text */
  --color-text-primary: #111827;
  --color-text-secondary: #6B7280;
  --color-text-muted: #9CA3AF;
  --color-text-inverse: #FFFFFF;

  /* Borders and focus */
  --color-border: #E5E7EB;
  --color-border-strong: #D1D5DB;
  --color-focus-ring: #F97316;

  /* Typography */
  --font-sans: Inter, ui-sans-serif, system-ui, -apple-system,
    BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-size-xs: 0.6875rem; /* 11px */
  --font-size-sm: 0.75rem;   /* 12px */
  --font-size-base: 0.875rem;/* 14px */
  --font-size-md: 1rem;      /* 16px */
  --font-size-lg: 1.125rem;  /* 18px */
  --font-size-xl: 1.25rem;   /* 20px */
  --font-size-2xl: 1.5rem;   /* 24px */

  --line-height-tight: 1.3;
  --line-height-normal: 1.45;
  --line-height-relaxed: 1.6;

  /* Spacing: 4px base */
  --space-0: 0;
  --space-0-5: 2px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* Radius */
  --radius-xs: 3px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 999px;

  /* Elevation */
  --shadow-sm: 0 1px 2px rgb(17 24 39 / 0.04);
  --shadow-md: 0 4px 12px rgb(17 24 39 / 0.08);
  --shadow-lg: 0 12px 28px rgb(17 24 39 / 0.12);

  /* Control sizing */
  --control-height-sm: 32px;
  --control-height-md: 38px;
  --control-height-lg: 46px;
  --icon-size-sm: 14px;
  --icon-size-md: 16px;
  --icon-size-lg: 20px;

  /* Layout */
  --sidebar-width: 232px;
  --header-height: 56px;
  --page-padding: 24px;
  --panel-gap: 16px;

  /* Motion */
  --motion-fast: 140ms;
  --motion-normal: 200ms;
  --motion-slow: 240ms;
  --easing-standard: cubic-bezier(0.2, 0, 0, 1);
}

@media (max-width: 1023px) {
  :root {
    --page-padding: 16px;
    --sidebar-width: 72px;
  }
}

@media (max-width: 767px) {
  :root {
    --page-padding: 12px;
    --panel-gap: 12px;
  }
}
```

### Suggested naming convention

Use names by role, not by component-specific color, wherever possible:

-   `color.brand.primary`
-   `color.text.primary`
-   `color.surface.subtle`
-   `color.border.default`
-   `space.4`
-   `radius.md`
-   `shadow.sm`
-   `type.base`
-   `control.height.md`
-   `layout.sidebar.width`
-   `motion.normal`

Map these to CSS custom properties or the existing Tailwind theme
configuration. Avoid maintaining conflicting token definitions in
multiple Tailwind config files.

------------------------------------------------------------------------

## 9. Example component CSS

These snippets illustrate how the tokens should be applied. Adapt
selectors and component architecture to the existing codebase.

``` css
.pos-product-card {
  min-width: 0;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition:
    border-color var(--motion-fast) var(--easing-standard),
    box-shadow var(--motion-fast) var(--easing-standard);
}

.pos-product-card:hover {
  border-color: var(--color-border-strong);
  box-shadow: var(--shadow-sm);
}

.pos-input {
  width: 100%;
  min-height: var(--control-height-md);
  padding: 0 var(--space-3);
  color: var(--color-text-primary);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font: inherit;
}

.pos-input::placeholder {
  color: var(--color-text-muted);
}

.pos-input:focus-visible,
.pos-button:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.pos-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  min-height: var(--control-height-md);
  padding: 0 var(--space-3);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.pos-button--primary {
  color: var(--color-text-inverse);
  background: var(--color-brand-primary);
}

.pos-button--primary:hover {
  background: var(--color-brand-primary-hover);
}

.pos-button--secondary {
  color: var(--color-text-primary);
  background: var(--color-surface);
  border-color: var(--color-border);
}

.pos-sidebar-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 38px;
  padding: 0 var(--space-3);
  color: var(--color-text-secondary);
  border-radius: var(--radius-md);
}

.pos-sidebar-item[aria-current="page"] {
  color: var(--color-text-primary);
  background: var(--color-surface-subtle);
  border: 1px solid var(--color-border);
}

.pos-order-summary__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
  color: var(--color-text-primary);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
```

------------------------------------------------------------------------

## 10. Accessibility and quality requirements

-   Normal text and controls must meet appropriate contrast
    requirements; verify with a contrast checker.
-   Use semantic buttons, inputs, labels, headings, and navigation
    landmarks.
-   Icon-only controls need accessible names.
-   All functionality must work with keyboard input.
-   Show a visible focus state.
-   Do not use color as the only status indicator.
-   Ensure modal/drawer focus is managed and returned to the trigger on
    close.
-   Keep touch targets around 44--48 px on mobile where practical.
-   Support reduced-motion preferences.
-   Use appropriate image alt text.
-   Keep the order total and submit action visible when a mobile
    keyboard is open.
-   Validate both LTR and RTL behavior if Urdu is supported.
-   Test 320, 360, 390, 430, 768, 1024, and 1280+ px widths.
-   Check long product names, long addresses, large totals, empty
    states, failed images, loading states, and API errors.
-   Do not report the design system as implemented merely because the
    tokens exist; verify the rendered components.

## 11. Visual QA checklist

### Overall shell

-   [ ] White/near-white app surfaces and subtle gray separation.
-   [ ] Stable sidebar/header alignment.
-   [ ] No unintended horizontal scrolling.
-   [ ] Consistent typography and icon style.

### Product browsing

-   [ ] Product cards use consistent image ratios and padding.
-   [ ] Product name and price alignment is consistent.
-   [ ] Add controls have clear hover/focus/disabled/loading states.
-   [ ] Broken images use a neutral placeholder.
-   [ ] Category selection is obvious and accessible.

### Order panel

-   [ ] Item names, quantities, options, and amounts align cleanly.
-   [ ] Total is the strongest summary row.
-   [ ] Primary actions are visually distinct but not competing.
-   [ ] Remove/clear actions are safe.
-   [ ] Long orders can scroll without hiding critical totals/actions.

### Forms

-   [ ] Labels are visible.
-   [ ] Errors are associated with fields.
-   [ ] Values remain after a recoverable failure.
-   [ ] Keyboard focus is visible.
-   [ ] Mobile keyboard does not cover the next action.

### Responsive

-   [ ] Sidebar collapses appropriately.
-   [ ] Cart becomes a mobile bar/sheet rather than a squeezed side
    panel.
-   [ ] Product cards remain readable at narrow widths.
-   [ ] Touch targets are usable.
-   [ ] No overlays cover content or checkout buttons.

------------------------------------------------------------------------

## 12. Source certainty and implementation caveats

**Directly visible in the screenshot:** light theme; left sidebar with
grouped navigation; top bar with search and utility/profile icons; page
title and breadcrumbs; product search/category/brand controls;
horizontal category chips; image-led product cards; a right-hand order
panel; item quantity and remove controls; summary rows; and
dark/orange/green action buttons.

**Estimated from pixels:** exact hex values, font family, font size,
border radius, spacing, and individual component dimensions. The raster
image does not reveal source tokens, browser zoom, original viewport,
CSS rules, or hover/focus behavior.

**Recommended rather than observed:** breakpoints, touch target sizes,
accessibility behavior, token naming, CSS variables, keyboard
interaction, and all hidden/active/disabled states.

Before implementation, compare these tokens against the current app,
retain existing design conventions where they already work, and
centralize the final values in one theme configuration. The screenshot
should be treated as a visual reference---not proof of the original
implementation details.
