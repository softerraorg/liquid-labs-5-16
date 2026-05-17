# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Shopify theme for Liquid Labs (supplement brand) built on Dawn 15.4.1. The theme adds a custom **Bundle PDP** section system on top of the standard Dawn base.

## Development Commands

```bash
# Start dev server (auto-syncs file changes to Shopify development theme)
shopify theme dev

# Push specific files (faster than full push)
shopify theme push --only sections/main-bundle-product.liquid
shopify theme push --only assets/bundle-pdp.js assets/bundle-pdp.css

# Push everything
shopify theme push

# Pull latest from remote theme
shopify theme pull
```

**Note on sync errors:** The CLI sometimes shows `"contains illegal characters"` errors for `.tmp.*` temp files during sync. These are harmless — look for `Synced » update <filename>` to confirm the actual file synced successfully.

## Architecture

### The Bundle PDP System

The core custom feature is a bundle purchase UI, split across three files that must stay in sync:

- **`sections/main-bundle-product.liquid`** — Liquid template + section schema. Reads settings and renders all bundle UI (quantity tiles, flavor pickers, submit button, sticky CTA). All section-level settings live in the `{% schema %}` block at the bottom.
- **`assets/bundle-pdp.js`** — All JS logic wrapped in `(function(){ function initBundlePdp(root){...} })()`. Reads `data-*` attributes from the root div, manages tile selection, flavor selection, variant matching, cart operations, and price display.
- **`assets/bundle-pdp.css`** — Styles for the bundle UI.

**Data flow:** The Liquid renders `data-*` attributes on the root `<div id="MainBundleProduct-...">` that the JS reads at init time. Key attributes: `data-cart-action`, `data-product-id`, `data-cart-limit`, `data-lock-gallery`.

**Simple mode (`hide_bundle_ui: true`):** For products like "Two Free Sticks" that have no flavor/quantity choice. The JS detects this via `hasFlavorUI = !!flavorContainer && bagRows.length > 0` and bypasses all bundle validation, reading the variant directly from the form's hidden `<input name="id">`.

### Product Templates

Each product template is a JSON file in `templates/` that stores independent section settings:

| Template | File | Use |
|----------|------|-----|
| Default bundle | `product.bundle-pdp.json` | Full bundle UI (Single/Duo/Trio tiles + flavor pickers) |
| Two Free Sticks | `product.two-free-sticks.json` | Simple mode — no tiles, no flavors, `cart_limit: 1`, `claimed_tag: claimed-free-sticks` |

Assign a template to a product in Shopify Admin → Products → Theme template (right sidebar).

### Cart Action System

`data-cart-action` on the root div controls what happens after add-to-cart. Priority order: **drawer > cart > checkout**. Resolved in Liquid at render time from **Theme Settings → Bundle PDP**:

| Value | Behaviour | Setting |
|-------|-----------|---------|
| `drawer` | Opens cart drawer, page stays | `bundle_cart_drawer_enabled` + `bundle_cart_drawer_templates` |
| `cart` | Redirects to `/cart` page | `bundle_cart_redirect_enabled` + `bundle_cart_redirect_templates` |
| `checkout` | Redirects straight to checkout (default) | neither enabled |

Both settings use a comma-separated templates field (e.g. `two-free-sticks`). Leaving the field blank applies to all bundle pages.

**Cart drawer injection:** When `drawer` mode is active and the global `cart_type` theme setting is NOT already `drawer`, the section injects `cart.js` → `cart-drawer.js` → `{%- render 'cart-drawer' -%}` after the closing root `</div>`. Script order matters: `cart.js` must load before `cart-drawer.js` because `CartDrawerItems extends CartItems`.

**Cart redirect use case:** Used for the Two Free Sticks page so that the Honeycomb upsell app (configured for "Cart Page" placement) can trigger on `/cart` before checkout.

### Sticky CTA

The sticky bar (`.bundle-pdp__sticky-cta`) is always visible on mobile — it is **not** scroll-triggered. It is hidden on desktop via `display: none` outside the `max-width: 749px` media query.

The sticky submit button (`[data-bundle-sticky-submit]`) is `type="button"` and lives outside the `<form>`. When clicked, the JS proxies the click through the real `button[name="add"]` inside the form — this ensures third-party apps (Honeycomb) that attach listeners to `[name="add"]` also fire on mobile. The proxied click re-enters the root click handler and calls `addToCart()`.

The sticky button's `disabled` state and label mirror the main submit button exactly — both are updated together by `updateSubmitState()` which queries all `.bundle-pdp__submit` elements. The Liquid initial render also applies the same `customer_claimed` / availability disabled conditions to both buttons.

### Honeycomb Upsell Integration

Honeycomb attaches its listener to buttons with `name="add"`. For it to fire:
- The page must **not redirect** immediately after "Add to Cart" (drawer or no action — not `checkout` or `cart` mode)
- `stopImmediatePropagation()` must **not** be called on the form submit or click events — it would silence Honeycomb's listener
- The sticky button proxies through `button[name="add"]` so Honeycomb fires on mobile too

### Claimed-Tag System (Free Product Limit)

For "Two Free Sticks" — a cross-session one-claim limit:

1. **Shopify Flow** triggers on `Order Created` when the product has tag `free-sample`, adds customer tag `claimed-free-sticks`
2. **Liquid** checks `customer.tags contains section.settings.claimed_tag` and sets `customer_claimed = true`
3. **Both buttons** (main + sticky) render `disabled` with label "Already claimed" when `customer_claimed` is true
4. The `claimed_tag` setting is configured per-template in the JSON (`"claimed_tag": "claimed-free-sticks"`)

JS also has a same-session `checkCartLimit()` guard using the `cart_limit` section setting, but Flow + Liquid is the real cross-session enforcement.

### Custom Branded Sections

All `LL-`/`ll-` prefixed sections in `sections/` are brand-specific (science stats, ingredient info, timeline, accordion+image, etc.). They are independent sections with their own schema and have no dependency on the bundle system.

### Theme Settings Schema

`config/settings_schema.json` contains a custom **"Bundle PDP"** group at the bottom with four settings: `bundle_cart_drawer_enabled`, `bundle_cart_drawer_templates`, `bundle_cart_redirect_enabled`, `bundle_cart_redirect_templates`. All other groups are standard Dawn settings.

## Key Conventions

- **Schema settings** use the section JSON template for per-product overrides. Never hardcode product-specific values in the liquid — use section settings.
- **Tile visibility**: A tile is hidden when its `label` setting is blank (`{%- unless tile_label == blank -%}`). For simple-mode products, `hide_bundle_ui: true` hides the entire quantity section.
- **`template.suffix`** (e.g. `bundle-pdp`, `two-free-sticks`) is what identifies which product template is active in Liquid — used by cart action template matching logic.
- **Never use `stopImmediatePropagation()`** on form submit or button click events — it breaks third-party app integrations.
