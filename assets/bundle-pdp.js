(function () {
  function initBundlePdp(root) {
    if (!root || root.__bundleInit) return;
    root.__bundleInit = true;
    console.log('[bundle-pdp] init', root.id);

    const form = root.querySelector('form[id^="bundle-product-form-"]');
    const variantsScript = root.querySelector('[data-bundle-product-variants]');
    let variants = [];
    try {
      variants = variantsScript ? JSON.parse(variantsScript.textContent) : [];
    } catch (_) {
      variants = [];
    }

    const tilesContainer = root.querySelector('.bundle-pdp__tiles');
    const tiles = root.querySelectorAll('.bundle-pdp__tile');
    const flavorContainer = root.querySelector('.bundle-pdp__bags');
    const bagRows = root.querySelectorAll('.bundle-pdp__bag-row');
    const submitBtn = root.querySelector('.bundle-pdp__submit');
    const stickyCta = root.querySelector('[data-bundle-sticky-cta]');
    const totalEls = root.querySelectorAll('[data-total-price]');
    const totalMetaEls = root.querySelectorAll('[data-total-meta]');
    const subscribeRadio = root.querySelector('input[name="bundle-purchase-mode"][value="subscribe"]');
    const onetimeRadio = root.querySelector('input[name="bundle-purchase-mode"][value="onetime"]');
    const subscribeOptionLabel = root.querySelector('.bundle-pdp__option--subscribe');
    const onetimeOptionLabel = root.querySelector('.bundle-pdp__option--onetime');
    const subscribeDiscountPct = subscribeOptionLabel ? parseFloat(subscribeOptionLabel.dataset.subscribeDiscountPct) || 0 : 0;
    const subscribeFactor = (100 - subscribeDiscountPct) / 100;
    const frequencySelect = root.querySelector('[data-selling-plan-select]');
    const sellingPlanInput = root.querySelector('input[name="selling_plan"]');
    const subscribePriceEl = root.querySelector('[data-subscribe-price]');
    const subscribeCompareEl = root.querySelector('[data-subscribe-compare]');
    const onetimePriceEl = root.querySelector('[data-onetime-price]');
    const submitLabelEls = root.querySelectorAll('.bundle-pdp__submit-label');
    const defaultSubmitLabel = submitLabelEls[0] ? submitLabelEls[0].textContent.trim() : 'Checkout';

    const flavorOptionIndex = flavorContainer ? parseInt(flavorContainer.dataset.flavorOptionIndex, 10) : -1;
    const bundleOptionIndex = tilesContainer ? parseInt(tilesContainer.dataset.bundleOptionIndex, 10) : -1;
    const singleBundleValue = tilesContainer ? tilesContainer.dataset.singleBundleValue : '';
    const hasFlavorUI = !!flavorContainer && bagRows.length > 0;

    function normalize(s) {
      return (s == null ? '' : String(s)).trim().toLowerCase();
    }

    function findVariant(flavorValue, bundleValue) {
      if (!variants.length) return null;
      const targetFlavor = normalize(flavorValue);
      const targetBundle = normalize(bundleValue);
      for (const v of variants) {
        const opts = v.options || [];
        const flavorMatch = flavorOptionIndex < 0 ? true : normalize(opts[flavorOptionIndex]) === targetFlavor;
        const bundleMatch = bundleOptionIndex < 0 ? true : normalize(opts[bundleOptionIndex]) === targetBundle;
        if (flavorMatch && bundleMatch) return v;
      }
      return null;
    }

    // True if at least one variant with this flavor is in stock (any bundle value).
    // Fails open if variant data is missing — Shopify still blocks oversell server-side.
    function flavorHasStock(flavorValue) {
      if (!variants.length) return true;
      const target = normalize(flavorValue);
      return variants.some((v) => {
        const opts = v.options || [];
        const flavorMatch = flavorOptionIndex < 0 ? true : normalize(opts[flavorOptionIndex]) === target;
        return flavorMatch && v.available;
      });
    }

    const productId = root.dataset.productId ? parseInt(root.dataset.productId, 10) : null;
    const cartLimit = root.dataset.cartLimit ? parseInt(root.dataset.cartLimit, 10) : 0;
    let cartLimitReached = false;

    async function checkCartLimit() {
      if (!productId || !cartLimit) return;
      try {
        const res = await fetch('/cart.js');
        const cart = await res.json();
        const qty = cart.items
          .filter((item) => item.product_id === productId)
          .reduce((sum, item) => sum + item.quantity, 0);
        cartLimitReached = qty >= cartLimit;
        updateSubmitState();
      } catch (_) {}
    }

    function enforceDrawerCartLimit(drawer, pId, limit) {
      if (!limit || limit <= 0 || !pId) return;
      fetch('/cart.js')
        .then((r) => r.json())
        .then((cart) => {
          cart.items.forEach((item, idx) => {
            if (item.product_id !== pId) return;
            if (item.quantity < limit) return;
            const n = idx + 1;
            const row = drawer.querySelector(`#CartDrawer-Item-${n}`) || drawer.querySelector(`#CartItem-${n}`);
            if (!row) return;
            const qtyControl = row.querySelector('quantity-input') || row.querySelector('.quantity');
            if (qtyControl) qtyControl.style.display = 'none';
          });
        })
        .catch(() => {});
    }

    function watchDrawerForLimit(drawer, pId, limit) {
      if (!limit || limit <= 0 || !pId || !drawer) return;
      let debounceTimer;
      new MutationObserver(() => {
        enforceDrawerCartLimit(drawer, pId, limit);
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => checkCartLimit(), 300);
      }).observe(drawer, { childList: true, subtree: true });
    }

    let bagCount = 3;
    let selectedTile = root.querySelector('.bundle-pdp__tile.is-selected');
    if (!selectedTile && tiles.length) {
      selectedTile = root.querySelector('.bundle-pdp__tile[data-bag-count="3"]') || tiles[tiles.length - 1];
      if (selectedTile) {
        selectedTile.classList.add('is-selected');
        selectedTile.setAttribute('aria-checked', 'true');
      }
    }
    if (selectedTile) bagCount = parseInt(selectedTile.dataset.bagCount, 10) || 3;

    // Disable flavor pills whose flavor is entirely out of stock.
    root.querySelectorAll('.bundle-pdp__flavor-pill').forEach((pill) => {
      if (!flavorHasStock(pill.dataset.flavorValue)) {
        pill.disabled = true;
        pill.classList.add('is-sold-out');
        pill.setAttribute('aria-disabled', 'true');
      }
    });

    bagRows.forEach((row) => {
      // Drop a pre-selected pill if it turned out to be sold out.
      const preselected = row.querySelector('.bundle-pdp__flavor-pill.is-selected');
      if (preselected && preselected.disabled) {
        preselected.classList.remove('is-selected');
        preselected.setAttribute('aria-pressed', 'false');
      }
      if (!row.querySelector('.bundle-pdp__flavor-pill.is-selected')) {
        const firstPill = row.querySelector('.bundle-pdp__flavor-pill:not(:disabled)');
        if (firstPill) {
          firstPill.classList.add('is-selected');
          firstPill.setAttribute('aria-pressed', 'true');
        }
      }
    });

    function formatMoney(cents) {
      if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
        return window.Shopify.formatMoney(cents, window.Shopify.money_format);
      }
      return '$' + (cents / 100).toFixed(2);
    }

    function getSelectedTile() {
      return root.querySelector('.bundle-pdp__tile.is-selected');
    }

    function getSelectedBundleValue() {
      const t = getSelectedTile();
      return t ? t.dataset.bundleValue : '';
    }

    function getSelectedFlavors() {
      const flavors = [];
      const visibleRows = Array.from(bagRows).filter((r) => !r.classList.contains('is-hidden'));
      visibleRows.forEach((row) => {
        const pill = row.querySelector('.bundle-pdp__flavor-pill.is-selected');
        if (pill) flavors.push(pill.dataset.flavorValue);
      });
      return flavors;
    }

    function isMixed() {
      const flavors = getSelectedFlavors();
      if (flavors.length <= 1) return false;
      return !flavors.every((f) => f === flavors[0]);
    }

    function isSubscribe() {
      return subscribeRadio && subscribeRadio.checked;
    }

    // Picks a single bundle variant (Single/Duo/Trio) for the current tile.
    // For mixed flavors, prefers an available variant; falls back to any matching variant.
    function findBundleVariant() {
      const bundleValue = getSelectedBundleValue();
      const flavors = getSelectedFlavors();
      if (!flavors.length) return null;
      let firstFound = null;
      for (const f of flavors) {
        const v = findVariant(f, bundleValue);
        if (v) {
          if (v.available) return v;
          if (!firstFound) firstFound = v;
        }
      }
      return firstFound;
    }

    function getBaseTotal() {
      const flavors = getSelectedFlavors();
      if (flavors.length === 0) {
        const t = getSelectedTile();
        return t ? parseInt(t.dataset.bagPrice, 10) || 0 : 0;
      }
      const v = findBundleVariant();
      if (v) return v.price;
      const t = getSelectedTile();
      return t ? parseInt(t.dataset.bagPrice, 10) || 0 : 0;
    }

    function updateBagVisibility() {
      bagRows.forEach((row) => {
        const idx = parseInt(row.dataset.bagIndex, 10);
        row.classList.toggle('is-hidden', idx > bagCount);
      });
    }

    function updateTotals() {
      const base = getBaseTotal();
      const final = isSubscribe() ? Math.round(base * subscribeFactor) : base;
      const totalText = formatMoney(final);
      const metaText = hasFlavorUI ? '(' + bagCount + ' bag' + (bagCount === 1 ? '' : 's') + ')' : '';
      totalEls.forEach((el) => { el.textContent = totalText; });
      totalMetaEls.forEach((el) => { el.textContent = metaText; });
      if (onetimePriceEl) onetimePriceEl.textContent = formatMoney(base);
      if (subscribePriceEl) subscribePriceEl.textContent = formatMoney(Math.round(base * subscribeFactor));
      if (subscribeCompareEl) subscribeCompareEl.textContent = formatMoney(base);
      updateSubmitState();
    }

    // Checks the bundle variant the current selection would add to cart.
    function validateSelection() {
      if (!hasFlavorUI) {
        const available = !variants.length || variants.some((v) => v.available);
        return available ? { ok: true } : { ok: false, reason: 'soldout' };
      }
      const flavors = getSelectedFlavors();
      if (flavors.length === 0) return { ok: false, reason: 'select' };
      const v = findBundleVariant();
      if (!v) return { ok: false, reason: 'unavailable' };
      if (!v.available) return { ok: false, reason: 'soldout' };
      return { ok: true };
    }

    function updateSubmitState() {
      const liveBtns = root.querySelectorAll('.bundle-pdp__submit');
      if (!liveBtns.length) return;
      if (cartLimitReached) {
        liveBtns.forEach((btn) => { btn.disabled = true; btn.classList.add('is-sold-out'); });
        submitLabelEls.forEach((el) => { el.textContent = 'Already in cart'; });
        return;
      }
      const result = validateSelection();
      const labelText = result.ok
        ? defaultSubmitLabel
        : result.reason === 'select' ? 'Select your flavors' : 'Sold out';
      liveBtns.forEach((btn) => {
        btn.disabled = !result.ok;
        btn.classList.toggle('is-sold-out', !result.ok);
      });
      submitLabelEls.forEach((el) => { el.textContent = labelText; });
    }

    function updateOptionSelectionUI() {
      if (subscribeOptionLabel) subscribeOptionLabel.classList.toggle('is-selected', isSubscribe());
      if (onetimeOptionLabel) onetimeOptionLabel.classList.toggle('is-selected', !isSubscribe());
      if (sellingPlanInput) {
        if (isSubscribe() && frequencySelect) {
          sellingPlanInput.value = frequencySelect.value;
          sellingPlanInput.disabled = false;
        } else {
          sellingPlanInput.value = '';
          sellingPlanInput.disabled = true;
        }
      }
    }

    function updateGalleryForTile(tile) {
      if (root.dataset.lockGallery === 'true') return;
      const mediaId = tile && tile.dataset.mediaId;
      if (!mediaId) return;
      const sectionId = root.dataset.section;
      const fullMediaId = sectionId ? sectionId + '-' + mediaId : mediaId;
      root.querySelectorAll('media-gallery').forEach((gallery) => {
        const viewer = gallery.querySelector('[id^="GalleryViewer"]');
        if (!viewer || !viewer.querySelector('[data-media-id="' + fullMediaId + '"]')) return;
        if (typeof gallery.setActiveMedia === 'function') {
          gallery.setActiveMedia(fullMediaId, false);
        }
      });
    }

    tiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        tiles.forEach((t) => {
          t.classList.remove('is-selected');
          t.setAttribute('aria-checked', 'false');
        });
        tile.classList.add('is-selected');
        tile.setAttribute('aria-checked', 'true');
        bagCount = parseInt(tile.dataset.bagCount, 10) || 1;
        updateBagVisibility();
        updateTotals();
        updateGalleryForTile(tile);
      });
    });

    if (flavorContainer) {
      flavorContainer.addEventListener('click', (event) => {
        const pill = event.target.closest('.bundle-pdp__flavor-pill');
        if (!pill || pill.disabled) return;
        const row = pill.closest('.bundle-pdp__bag-row');
        if (!row) return;
        row.querySelectorAll('.bundle-pdp__flavor-pill').forEach((p) => {
          p.classList.remove('is-selected');
          p.setAttribute('aria-pressed', 'false');
        });
        pill.classList.add('is-selected');
        pill.setAttribute('aria-pressed', 'true');
        updateTotals();
      });
    }

    function setPurchaseMode(mode) {
      if (subscribeRadio) subscribeRadio.checked = mode === 'subscribe';
      if (onetimeRadio) onetimeRadio.checked = mode === 'onetime';
      console.log('[bundle-pdp] mode →', mode, {
        subscribeChecked: subscribeRadio && subscribeRadio.checked,
        onetimeChecked: onetimeRadio && onetimeRadio.checked,
      });
      updateOptionSelectionUI();
      updateTotals();
    }

    if (subscribeOptionLabel) {
      subscribeOptionLabel.addEventListener('click', (event) => {
        if (event.target.closest('[data-selling-plan-select]')) return;
        setPurchaseMode('subscribe');
      });
    }
    if (onetimeOptionLabel) {
      onetimeOptionLabel.addEventListener('click', () => {
        setPurchaseMode('onetime');
      });
    }

    if (form) {
      form.addEventListener('change', (event) => {
        const t = event.target;
        if (!t) return;
        if (t.matches('[data-selling-plan-select]')) {
          updateOptionSelectionUI();
          updateTotals();
        }
      });
    }

    function collectItems() {
      const items = [];
      if (!hasFlavorUI) {
        const variantInput = form && form.querySelector('[name="id"]');
        const variantId = variantInput ? parseInt(variantInput.value, 10) : null;
        if (!variantId) return items;
        const sellingPlanId = isSubscribe() && sellingPlanInput && sellingPlanInput.value ? sellingPlanInput.value : null;
        const item = { id: variantId, quantity: 1 };
        if (cartLimit > 0) item.properties = { _cart_limit: String(cartLimit) };
        if (sellingPlanId) item.selling_plan = sellingPlanId;
        items.push(item);
        return items; 
      }
      const flavors = getSelectedFlavors();
      if (flavors.length === 0) return items;
 
      const v = findBundleVariant();
      if (!v) return items;

      const sellingPlanId = isSubscribe() && sellingPlanInput && sellingPlanInput.value ? sellingPlanInput.value : null;
      const item = { id: v.id, quantity: 1 };

      // For mixed flavors, attach per-bag breakdown so fulfillment knows
      // which flavor goes in each bag (cart line variant is just the base SKU).
      if (isMixed()) {
        const properties = {};
        flavors.forEach((flavor, i) => {
          properties['Bag ' + (i + 1)] = flavor;
        });
        item.properties = properties;
      } 

      if (sellingPlanId) item.selling_plan = sellingPlanId;
      items.push(item);
      return items;
    }

    async function addToCart() {
      const items = collectItems();
      console.log('[bundle-pdp] submit', { items, bagCount, isSubscribe: isSubscribe(), sellingPlan: sellingPlanInput && sellingPlanInput.value });
      if (items.length === 0) {
        console.warn('[bundle-pdp] no items collected — check flavor pills + tile + variant lookup.');
        return;
      }  

      const errorWrapper = root.querySelector('.product-form__error-message-wrapper');
      const errorMessage = root.querySelector('.product-form__error-message');
      const hideError = () => { if (errorWrapper) errorWrapper.setAttribute('hidden', ''); };
      const showError = (msg) => {
        if (errorWrapper && errorMessage) {
          errorMessage.textContent = msg;
          errorWrapper.removeAttribute('hidden');
        }
      };
      hideError();

      const validity = validateSelection();
      if (!validity.ok) {
        showError(
          validity.reason === 'select'
            ? 'Please select your flavors.'
            : 'Sorry, the selected combination is sold out.'
        );
        updateSubmitState();
        return;
      }

      const liveBtns = root.querySelectorAll('.bundle-pdp__submit');
      liveBtns.forEach((btn) => {
        btn.setAttribute('aria-disabled', 'true');
        btn.classList.add('loading');
      });

      try {
        const cartAction = root.dataset.cartAction || 'checkout';
        const cartDrawer = cartAction === 'drawer' ? document.querySelector('cart-drawer') : null;
        const url = window.routes && window.routes.cart_add_url ? window.routes.cart_add_url : '/cart/add.js';

        const payload = { items };
        if (cartDrawer) {
          payload.sections = cartDrawer.getSectionsToRender().map((s) => s.id);
          payload.sections_url = window.location.pathname;
        }

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/javascript' },
          body: JSON.stringify(payload),
        });
        const responseBody = await res.json().catch(() => ({}));
        console.log('[bundle-pdp] /cart/add.js response', res.status, responseBody);
        if (!res.ok) {
          throw new Error(responseBody.description || responseBody.message || 'Could not add to cart');
        }

        if (cartAction === 'drawer' && cartDrawer) {
          cartDrawer.classList.remove('is-empty');
          cartDrawer.renderContents(responseBody);
          enforceDrawerCartLimit(cartDrawer, productId, cartLimit);
          checkCartLimit();
        } else if (cartAction === 'drawer' && !cartDrawer) {
          // Cart drawer not in DOM — theme cart type must be set to Drawer in Theme Settings
          window.location.href = (window.routes && window.routes.cart_url) || '/cart';
        } else if (cartAction === 'cart') {
          window.location.href = (window.routes && window.routes.cart_url) || '/cart';
        } else {
          window.location.href = '/checkout';
        }

      } catch (err) {
        showError(err.message || 'Could not add to cart');
      } finally {
        liveBtns.forEach((btn) => {
          btn.removeAttribute('aria-disabled');
          btn.classList.remove('loading');
        });
      }
    }

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        addToCart();
      });
    }

    root.addEventListener('click', (event) => {
      const btn = event.target.closest('.bundle-pdp__submit');
      if (!btn || !root.contains(btn)) return;
      event.preventDefault();

      // Sticky button is outside the form and has no name="add", so third-party apps
      // like Honeycomb that attach listeners to the real submit button never see the click.
      // Proxy through the real button so those listeners fire, then that click re-enters
      // this handler (isSticky will be false) and calls addToCart().
      if (btn.hasAttribute('data-bundle-sticky-submit')) {
        const realBtn = form && form.querySelector('button[name="add"]');
        if (realBtn && !realBtn.disabled) realBtn.click();
        return;
      }

      addToCart();
    });

    updateBagVisibility();
    updateOptionSelectionUI();
    updateTotals();
    checkCartLimit();
    watchDrawerForLimit(document.querySelector('cart-drawer'), productId, cartLimit);

    if (stickyCta) {
      stickyCta.setAttribute('aria-hidden', 'false');
    }

    window.addEventListener('pageshow', () => {
      console.log('[bundle-pdp] pageshow sync', {
        subscribeChecked: subscribeRadio && subscribeRadio.checked,
        onetimeChecked: onetimeRadio && onetimeRadio.checked,
      });
      updateOptionSelectionUI();
      updateTotals();
    });
  }

  function initAll() {
    document.querySelectorAll('.bundle-pdp').forEach(initBundlePdp);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

  document.addEventListener('shopify:section:load', (event) => {
    const sec = event.target.querySelector('.bundle-pdp');
    if (sec) initBundlePdp(sec);
  });
})();