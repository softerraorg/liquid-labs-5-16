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

**Data flow:** The Liquid renders `data-*` attributes on the root `<div id="MainBundleProduct-...">` that the JS reads at init time. Key attributes: `data-cart-action`, `data-product-id`, `data-cart-limit`, `data-lock-gallery`, `data-skip-cart` (removed — now `data-cart-action`).

**Simple mode (`hide_bundle_ui: true`):** For products like "Two Free Sticks" that have no flavor/quantity choice. The JS detects this via `hasFlavorUI = !!flavorContainer && bagRows.length > 0` and bypasses all bundle validation, reading the variant directly from the form's hidden `<input name="id">`.

### Product Templates

Each product template is a JSON file in `templates/` that stores independent section settings:

| Template | File | Use |
|----------|------|-----|
| Default bundle | `product.bundle-pdp.json` | Full bundle UI (Single/Duo/Trio tiles + flavor pickers) |
| Two Free Sticks | `product.two-free-sticks.json` | Simple mode — no tiles, no flavors, `cart_limit: 1` |

Assign a template to a product in Shopify Admin → Products → Theme template (right sidebar).

### Cart Drawer Integration

The cart drawer is conditionally injected by the bundle section — it does NOT rely on the global theme `cart_type` setting. Instead it's controlled by **Theme Settings → Bundle PDP**:

- `bundle_cart_drawer_enabled` (checkbox) — master toggle
- `bundle_cart_drawer_templates` (text) — comma-separated template suffixes, e.g. `bundle-pdp, two-free-sticks`

When enabled for the current template, the section renders `cart.js` → `cart-drawer.js` → `{%- render 'cart-drawer' -%}` at the bottom (outside the main product `<div>`), and sets `data-cart-action="drawer"`. The JS then calls `cartDrawer.renderContents(responseBody)` after a successful cart add, removing `is-empty` from the `<cart-drawer>` element first (critical — prevents `trapFocus` null error).

Script load order matters: `cart.js` must load before `cart-drawer.js` because `CartDrawerItems extends CartItems`.

### Claimed-Tag System (Free Product Limit)

For "Two Free Sticks" — a cross-session one-claim limit:

1. **Shopify Flow** triggers on `Order Created` when the product has tag `free-sample`, adds customer tag `claimed-free-sticks`
2. **Liquid** checks `customer.tags contains section.settings.claimed_tag` and sets `customer_claimed = true`
3. **Button** renders `disabled` with label "Already claimed" when `customer_claimed` is true
4. The `claimed_tag` setting is configured per-template in the JSON (`"claimed_tag": "claimed-free-sticks"`)

JS also has a same-session `checkCartLimit()` guard using `cart_limit` section setting, but Flow + Liquid is the real enforcement.

### Custom Branded Sections

All `LL-`/`ll-` prefixed sections in `sections/` are brand-specific (science stats, ingredient info, timeline, accordion+image, etc.). They are independent sections with their own schema and have no dependency on the bundle system.

### Theme Settings Schema

`config/settings_schema.json` contains a custom **"Bundle PDP"** group at the bottom (added by us) for the cart drawer controls. All other groups are standard Dawn settings.

## Key Conventions

- **Schema settings** use the section JSON template for per-product overrides. Never hardcode product-specific values in the liquid — use section settings.
- **Tile visibility**: A tile is hidden when its `label` setting is blank (`{%- unless tile_label == blank -%}`). For simple-mode products, `hide_bundle_ui: true` hides the entire quantity section.
- **`template.suffix`** (e.g. `bundle-pdp`, `two-free-sticks`) is what identifies which product template is active in Liquid — used by the cart drawer template matching logic.
