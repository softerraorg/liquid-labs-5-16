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

    function getBaseTotal() {
      const bundleValue = getSelectedBundleValue();
      const flavors = getSelectedFlavors();
      if (flavors.length === 0) {
        const t = getSelectedTile();
        return t ? parseInt(t.dataset.bagPrice, 10) || 0 : 0;
      }
      if (!isMixed()) {
        const v = findVariant(flavors[0], bundleValue);
        if (v) return v.price;
        const t = getSelectedTile();
        return t ? parseInt(t.dataset.bagPrice, 10) || 0 : 0;
      }
      let total = 0;
      flavors.forEach((f) => {
        const v = findVariant(f, singleBundleValue);
        if (v) total += v.price;
      });
      return total;
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
      const metaText = '(' + bagCount + ' bag' + (bagCount === 1 ? '' : 's') + ')';
      totalEls.forEach((el) => { el.textContent = totalText; });
      totalMetaEls.forEach((el) => { el.textContent = metaText; });
      if (onetimePriceEl) onetimePriceEl.textContent = formatMoney(base);
      if (subscribePriceEl) subscribePriceEl.textContent = formatMoney(Math.round(base * subscribeFactor));
      if (subscribeCompareEl) subscribeCompareEl.textContent = formatMoney(base);
      updateSubmitState();
    }

    // Checks the exact variant(s) the current selection would add to cart and
    // confirms each one exists and is in stock. Mirrors collectItems() logic.
    function validateSelection() {
      const flavors = getSelectedFlavors();
      if (flavors.length === 0) return { ok: false, reason: 'select' };
      if (!isMixed()) {
        const v = findVariant(flavors[0], getSelectedBundleValue());
        if (!v) return { ok: false, reason: 'unavailable' };
        if (!v.available) return { ok: false, reason: 'soldout' };
        return { ok: true };
      }
      for (const flavor of flavors) {
        const v = findVariant(flavor, singleBundleValue);
        if (!v) return { ok: false, reason: 'unavailable' };
        if (!v.available) return { ok: false, reason: 'soldout' };
      }
      return { ok: true };
    }

    function updateSubmitState() {
      const liveBtns = root.querySelectorAll('.bundle-pdp__submit');
      if (!liveBtns.length) return;
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
      const bundleValue = getSelectedBundleValue();
      const flavors = getSelectedFlavors();
      if (flavors.length === 0) return items;

      const sellingPlanId = isSubscribe() && sellingPlanInput && sellingPlanInput.value ? sellingPlanInput.value : null;

      if (!isMixed()) {
        const v = findVariant(flavors[0], bundleValue);
        if (!v) return items;
        const item = { id: v.id, quantity: 1 };
        if (sellingPlanId) item.selling_plan = sellingPlanId;
        items.push(item);
        return items;
      }

      flavors.forEach((flavor, i) => {
        const v = findVariant(flavor, singleBundleValue);
        if (!v) return;
        const item = {
          id: v.id,
          quantity: 1,
          properties: { ['Bag ' + (i + 1)]: flavor, _bundle: bundleValue },
        };
        if (sellingPlanId) item.selling_plan = sellingPlanId;
        items.push(item);
      });

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
        const url = window.routes && window.routes.cart_add_url ? window.routes.cart_add_url : '/cart/add.js';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/javascript' },
          body: JSON.stringify({ items: items }),
        });
        const responseBody = await res.json().catch(() => ({}));
        console.log('[bundle-pdp] /cart/add.js response', res.status, responseBody);
        if (!res.ok) {
          throw new Error(responseBody.description || responseBody.message || 'Could not add to cart');
        }

        const skipCart = root.dataset.skipCart === 'true';
        window.location.href = skipCart ? '/checkout' : (window.routes && window.routes.cart_url) || '/cart';

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
        event.stopImmediatePropagation();
        addToCart();
      });
    }

    root.addEventListener('click', (event) => {
      const btn = event.target.closest('.bundle-pdp__submit');
      if (!btn || !root.contains(btn)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      addToCart();
    });

    updateBagVisibility();
    updateOptionSelectionUI();
    updateTotals();

    if (stickyCta && submitBtn && 'IntersectionObserver' in window) {
      const stickyObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
          stickyCta.classList.toggle('is-visible', scrolledPast);
          stickyCta.setAttribute('aria-hidden', scrolledPast ? 'false' : 'true');
        });
      }, { threshold: 0 });
      stickyObserver.observe(submitBtn);
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