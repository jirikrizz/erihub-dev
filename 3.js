// Plugin: tests (verze #1)
(function(){
  var config = {"widgetScript":"https://hub.krasnevune.cz/widgets/f858bfe1-dda7-4aa7-91c8-22e72b00f8bd.js","widgetToken":"f858bfe1-dda7-4aa7-91c8-22e72b00f8bd","widgetId":"8ff426a0-fdc1-4bba-bab1-a46b26a579af","containerId":"kv-widget-f858bfe1-dda7-4aa7-91c8-22e72b00f8bd","containerClass":"products products-block kv-widget-block homepage-products-1 parfemy","pageTargets":["productDetail"],"selector":".p-detail-inner","placement":"before","maxAttempts":60,"pollInterval":500,"instanceId":"kv-auto-f858bfe1-dda7-4aa7-91c8-22e72b00f8bd-3","dataSource":"inventory_recommendations","recommendationEndpoint":"https://hub.krasnevune.cz/widgets/inventory/recommendations.js","recommendationLimit":8};
  if (!config || !config.containerId || !config.selector) { return; }
  var dataSource = (config.dataSource || 'widget').toString().toLowerCase();
  if (dataSource === 'widget' && !config.widgetScript) { return; }
  if (dataSource === 'inventory_recommendations' && (!config.widgetId || !config.recommendationEndpoint)) { return; }
  var attempts = 0;
  var maxAttempts = Number(config.maxAttempts) || 60;
  var pollInterval = Number(config.pollInterval) || 500;
  var mounted = false;
  var dynamicContainer = null;
  var variantWatcherId = null;
  var variantEventsRegistered = false;
  var loadedVariantKey = null;
  var pendingVariantKey = null;
  var locationVariantIdCache = undefined;
  var normalizedTargets = Array.isArray(config.pageTargets)
    ? config.pageTargets
        .map(function (value) {
          return (value || '').toString().trim().toLowerCase();
        })
        .filter(Boolean)
    : [];

  function normalize(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function getLocationVariantId() {
    if (locationVariantIdCache !== undefined) {
      return locationVariantIdCache;
    }
    locationVariantIdCache = null;
    try {
      var search = (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string')
        ? window.location.search
        : '';
      if (search) {
        try {
          var params = new URLSearchParams(search);
          var candidate = params.get('variantId') || params.get('variantid') || params.get('variant_id') || params.get('variant');
          if (candidate) {
            var normalized = safeString(candidate);
            if (normalized) {
              locationVariantIdCache = normalized;
              return locationVariantIdCache;
            }
          }
        } catch (error) {}
      }
      if (typeof window !== 'undefined' && window.location && typeof window.location.hash === 'string') {
        var hash = window.location.hash || '';
        var match = hash.match(/variantId=([^&]+)/i);
        if (match && match[1]) {
          var hashed = safeString(match[1]);
          if (hashed) {
            locationVariantIdCache = hashed;
            return locationVariantIdCache;
          }
        }
      }
    } catch (error) {}
    return locationVariantIdCache;
  }

  function getVariantsSplitMap() {
    var global = typeof window !== 'undefined' ? window.shoptet : null;
    if (!global || typeof global !== 'object') { return null; }
    var split = global.variantsSplit || global.variantSplit || global.variantsController;
    if (split && split.necessaryVariantData && typeof split.necessaryVariantData === 'object') {
      return split.necessaryVariantData;
    }
    return null;
  }

  function resolveShoptetLayer() {
    if (typeof window.getShoptetDataLayer === 'function') {
      try {
        var layer = window.getShoptetDataLayer();
        if (layer && typeof layer === 'object') {
          if (layer.shoptet) {
            return layer.shoptet;
          }
          return layer;
        }
      } catch (error) {}
    }
    var layers = window.dataLayer;
    if (Array.isArray(layers)) {
      for (var i = layers.length - 1; i >= 0; i--) {
        var entry = layers[i];
        if (entry && entry.shoptet) {
          return entry.shoptet;
        }
      }
    }
    return null;
  }

  function resolveLanguage() {
    var context = resolveShoptetLayer();
    var language = safeString(
      (context && (context.language || context.lang)) ||
      (context && context.web && (context.web.language || context.web.lang)) ||
      (context && context.localization && (context.localization.language || context.localization.lang)) ||
      (context && context.locale)
    );
    if (!language && document.documentElement) {
      language = safeString(document.documentElement.getAttribute('lang') || document.documentElement.lang);
    }
    return language;
  }

  function resolveCurrency() {
    var context = resolveShoptetLayer();
    var currency = safeString(
      (context && (context.currency || context.currencyCode || context.currency_code)) ||
      (context && context.web && (context.web.currency || context.web.currencyCode || context.web.currency_code)) ||
      (context && context.shop && (context.shop.currency || context.shop.currencyCode || context.shop.currency_code)) ||
      (context && context.priceInfo && (context.priceInfo.currency || context.priceInfo.currencyCode || context.priceInfo.currency_code))
    );
    return currency;
  }

  function extractProductCodeFrom(source) {
    if (!source || typeof source !== 'object') { return null; }
    var direct = safeString(
      source.product_code ||
      source.productCode ||
      source.code ||
      source.sku ||
      source.id
    );
    if (direct) { return direct; }
    var codes = source.codes;
    if (Array.isArray(codes)) {
      for (var i = 0; i < codes.length; i++) {
        var entry = codes[i];
        var value = null;
        if (typeof entry === 'string' || typeof entry === 'number') {
          value = entry;
        } else if (entry && typeof entry === 'object') {
          value = entry.code || entry.id || entry.value;
        }
        var normalized = safeString(value);
        if (normalized) {
          return normalized;
        }
      }
    }
    return null;
  }

  function resolveProductCode() {
    var context = resolveShoptetLayer();
    // Primary source: data layer product.codes[0].code
    if (context && context.product && Array.isArray(context.product.codes) && context.product.codes.length) {
      var firstCode = extractProductCodeFrom({ codes: context.product.codes });
      if (firstCode) { return firstCode; }
    }
    // Fallbacks (legacy)
    var candidates = [];
    if (context) {
      candidates.push(context.product);
      if (context.detail) {
        candidates.push(context.detail.product || context.detail);
      }
      if (context.ecommerce && context.ecommerce.detail) {
        candidates.push(context.ecommerce.detail.product);
        if (Array.isArray(context.ecommerce.detail.products) && context.ecommerce.detail.products.length) {
          candidates.push(context.ecommerce.detail.products[0]);
        }
      }
    }
    for (var i = 0; i < candidates.length; i++) {
      var code = extractProductCodeFrom(candidates[i]);
      if (code) { return code; }
    }
    return null;
  }

  function currentPageType() {
    var context = resolveShoptetLayer();
    if (context && context.pageType) {
      return context.pageType.toString();
    }
    var html = document.documentElement;
    if (html && html.getAttribute) {
      var pageType = html.getAttribute('data-page-type');
      if (pageType) {
        return pageType.toString();
      }
    }
    if (document.body && document.body.getAttribute) {
      var bodyType = document.body.getAttribute('data-page-type');
      if (bodyType) {
        return bodyType.toString();
      }
    }
    return null;
  }

  function matchesPage() {
    if (!normalizedTargets.length) {
      return true;
    }
    var type = normalize(currentPageType());
    if (!type) {
      return false;
    }
    return normalizedTargets.indexOf(type) !== -1;
  }

  function parseClassList(value) {
    if (Array.isArray(value)) {
      var resolved = [];
      for (var i = 0; i < value.length; i++) {
        var nested = parseClassList(value[i]);
        if (nested.length) {
          resolved = resolved.concat(nested);
        }
      }
      return resolved;
    }
    return (value || '').toString().split(/[\s,]+/).filter(Boolean);
  }

  function applyClasses(node) {
    if (!node) { return; }
    var classes = parseClassList(config.containerClass);
    classes.forEach(function (className) {
      if (!className) {
        return;
      }
      if (node.classList) {
        node.classList.add(className);
      } else if ((' ' + (node.className || '') + ' ').indexOf(' ' + className + ' ') === -1) {
        node.className = ((node.className || '') + ' ' + className).trim();
      }
    });
  }

  function ensureContainer(target) {
    if (!target) { return null; }
    var existing = document.getElementById(config.containerId);
    if (existing) {
      existing.setAttribute('data-kv-widget', config.widgetToken || '');
      applyClasses(existing);
      return existing;
    }
    var container = document.createElement('div');
    container.id = config.containerId;
    container.setAttribute('data-kv-widget', config.widgetToken || '');
    applyClasses(container);
    var placement = config.placement || 'append';
    if (placement === 'before' && target.parentNode) {
      target.parentNode.insertBefore(container, target);
    } else if (placement === 'after' && target.parentNode) {
      target.parentNode.insertBefore(container, target.nextSibling);
    } else if (placement === 'prepend') {
      target.insertBefore(container, target.firstChild || null);
    } else {
      target.appendChild(container);
    }
    return container;
  }

  function loadWidget(container) {
    if (!container) { return; }
    var existing = document.querySelector('script[data-kv-auto-widget=\"' + (config.instanceId || '') + '\"]');
    if (existing) {
      return;
    }
    var script = document.createElement('script');
    script.src = config.widgetScript;
    script.async = true;
    script.setAttribute('data-target', '#' + container.id);
    script.setAttribute('data-kv-auto-widget', config.instanceId || '');
    document.head.appendChild(script);
  }

  function safeString(value) {
    if (value === null || value === undefined) { return null; }
    var normalized = value.toString().trim();
    return normalized === '' ? null : normalized;
  }

  function toNumber(value) {
    if (value === null || value === undefined) { return null; }
    var number = Number(value);
    return isFinite(number) ? number : null;
  }

  function firstNumber(values) {
    if (!Array.isArray(values)) { return null; }
    for (var i = 0; i < values.length; i++) {
      var candidate = toNumber(values[i]);
      if (candidate !== null) {
        return candidate;
      }
    }
    return null;
  }

  function normalizeVariant(source) {
    if (!source) { return null; }
    if (typeof source === 'string' || typeof source === 'number') {
      var raw = safeString(source);
      if (!raw) { return null; }
      return { code: raw, selected: true };
    }
    if (typeof source !== 'object') { return null; }
    var primaryCode = safeString(
      source.variant_code ||
      source.variantCode ||
      source.code ||
      source.sku ||
      source.item_code ||
      source.itemCode
    );
    var fallbackIdentifier = safeString(source.id || source.ID);
    var id = safeString(source.variant_id || source.variantId) || fallbackIdentifier;
    var code = primaryCode || fallbackIdentifier;
    if (!code && !id) { return null; }
    var candidate = {
      code: code,
      id: id,
      price: firstNumber([
        source.price,
        source.price_with_tax,
        source.priceWithVat,
        source.priceVat,
        source.price_with_vat,
        source.priceValue,
        source.item_price
      ]),
      volume: firstNumber([
        source.volume,
        source.volume_value,
        source.volumeValue,
        source.content,
        source.capacity,
        source.size,
        source.weight,
        source.objem
      ]),
      stock: firstNumber([
        source.stock,
        source.stockAmount,
        source.stock_amount,
        source.available_amount,
        source.stock_quantity,
        source.stockQuantity,
        source.quantity,
        source.amount
      ]),
      order: firstNumber([
        source.order,
        source.position,
        source.priority,
        source.sort
      ]),
      selected: Boolean(
        source.selected ||
        source.isSelected ||
        source.actual ||
        source.isActual ||
        source.default ||
        source.isDefault ||
        source.defaultSelected ||
        source.active ||
        source.isActive
      ),
    };
    var productCode = extractProductCodeFrom(source.product || source);
    if (productCode) {
      candidate.productCode = productCode;
    }
    return candidate;
  }

  function collectVariantCandidates() {
    var candidates = [];
    var seen = Object.create(null);

    function pushCandidate(source, selectedHint) {
      var variant = normalizeVariant(source);
      if (!variant) { return; }
      if (typeof selectedHint === 'boolean' && selectedHint) {
        variant.selected = true;
      }
      var key = (variant.code || '') + '::' + (variant.id || '');
      if (seen[key]) { return; }
      seen[key] = true;
      candidates.push(variant);
    }

    function pushList(list, selectedHint) {
      if (!Array.isArray(list)) { return; }
      for (var i = 0; i < list.length; i++) {
        pushCandidate(list[i], selectedHint);
      }
    }

    function scanContext(ctx, depth) {
      if (!ctx || typeof ctx !== 'object') { return; }
      if (Array.isArray(ctx)) {
        pushList(ctx);
        return;
      }
      var level = depth || 0;
      if (level > 4) { return; }
      pushCandidate(ctx.variant, true);
      pushCandidate(ctx.selectedVariant, true);
      pushCandidate(ctx.currentVariant, true);
      if (ctx.variantCode) {
        pushCandidate({ variant_code: ctx.variantCode }, true);
      }
      pushList(ctx.codes);
      pushList(ctx.codeList);
      pushList(ctx.variants);
      pushList(ctx.variantList);
      pushList(ctx.variant_list);
      if (ctx.product) {
        scanContext(ctx.product, level + 1);
      }
      if (ctx.products) {
        pushList(ctx.products);
      }
      if (ctx.detail && ctx.detail.products) {
        pushList(ctx.detail.products);
      }
      if (ctx.ecommerce && ctx.ecommerce.detail && ctx.ecommerce.detail.products) {
        pushList(ctx.ecommerce.detail.products);
      }
    }

    function collectDomVariants() {
      if (typeof document === 'undefined' || !document.querySelectorAll) { return; }
      var selectors = [
        '.detail [data-variant-id][data-variant-code]',
        '.product-detail [data-variant-id][data-variant-code]',
        '[data-detail-variant-id][data-variant-code]',
        'button[data-action=\"buy\"][data-variant-id][data-variant-code]'
      ];
      for (var s = 0; s < selectors.length; s++) {
        var sel = selectors[s];
        var nodes;
        try {
          nodes = document.querySelectorAll(sel);
        } catch (error) {
          nodes = [];
        }
        if (!nodes || !nodes.length) {
          continue;
        }
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (!node) { continue; }
          if (node.closest && node.closest('[data-kv-widget]')) { continue; }
          var codeAttr = node.getAttribute && (node.getAttribute('data-variant-code') || node.getAttribute('data-variant') || node.getAttribute('data-code'));
          var idAttr = node.getAttribute && (node.getAttribute('data-detail-variant-id') || node.getAttribute('data-variant-id'));
          pushCandidate({
            variant_code: codeAttr || (node.dataset && (node.dataset.variantCode || node.dataset.variant)),
            variant_id: idAttr || (node.dataset && (node.dataset.detailVariantId || node.dataset.variantId))
          }, true);
        }
      }
    }

    scanContext(resolveShoptetLayer(), 0);

    var layers = window.dataLayer;
    if (Array.isArray(layers)) {
      for (var i = layers.length - 1; i >= 0; i--) {
        scanContext(layers[i], 0);
      }
    }

    if (typeof window.shoptet === 'object' && window.shoptet) {
      scanContext(window.shoptet, 0);
    }

    var splitMap = getVariantsSplitMap();
    if (splitMap) {
      for (var key in splitMap) {
        if (!Object.prototype.hasOwnProperty.call(splitMap, key)) { continue; }
        pushCandidate(splitMap[key]);
      }
    }

    collectDomVariants();

    var locationVariantId = getLocationVariantId();
    if (locationVariantId) {
      var prioritized = findSelectedVariant(candidates);
      if (prioritized) {
        if (!prioritized.id) {
          prioritized.id = locationVariantId;
        }
      } else if (candidates.length && !candidates[0].id) {
        candidates[0].id = locationVariantId;
      }
    }

    return candidates;
  }

  function findSelectedVariant(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && candidates[i].selected) {
        return candidates[i];
      }
    }
    return null;
  }

  function findLargestByKey(candidates, key) {
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var current = candidates[i];
      if (!current) { continue; }
      var value = current[key];
      if (typeof value !== 'number' || !isFinite(value)) { continue; }
      if (!best || value > best[key]) {
        best = current;
      }
    }
    return best;
  }

  function findSmallestPositive(candidates, key) {
    var best = null;
    for (var i = 0; i < candidates.length; i++) {
      var current = candidates[i];
      if (!current) { continue; }
      var value = current[key];
      if (typeof value !== 'number' || !isFinite(value)) { continue; }
      if (value < 0) { continue; }
      if (!best || value < best[key]) {
        best = current;
      }
    }
    return best;
  }

  function pickVariantCandidate() {
    // Preferred: use product code from Shoptet data layer
    var productCode = resolveProductCode();
    if (productCode) {
      return { productCode: productCode };
    }

    // Legacy fallbacks
    var variants = collectVariantCandidates();
    if (!variants.length) {
      return null;
    }
    var selectedVariant = findSelectedVariant(variants);
    if (selectedVariant) { return selectedVariant; }
    var byVolume = findLargestByKey(variants, 'volume');
    if (byVolume) { return byVolume; }
    var byPrice = findLargestByKey(variants, 'price');
    if (byPrice) { return byPrice; }
    var byStock = findLargestByKey(variants, 'stock');
    if (byStock) { return byStock; }
    var byOrder = findSmallestPositive(variants, 'order');
    if (byOrder) { return byOrder; }
    return variants[0];
  }

  function variantKey(variant) {
    if (!variant) { return null; }
    var code = safeString(variant.code);
    var id = safeString(variant.id);
    var productCode = safeString(variant.productCode);
    if (code) {
      return code + '::' + (id || '');
    }
    if (id) {
      return '::' + id;
    }
    if (productCode) {
      return 'product::' + productCode;
    }
    return null;
  }

  function buildRecommendationUrl(variant) {
    if (!variant) { return null; }
    var code = safeString(variant.code);
    var id = safeString(variant.id);
    var productCode = safeString(variant.productCode) || resolveProductCode();
    var pageType = normalize(currentPageType()) || null;
    var language = resolveLanguage();
    var currency = resolveCurrency();
    if (!code && !id && !productCode) { return null; }
    var endpoint = config.recommendationEndpoint;
    if (!endpoint) { return null; }
    var params = [
      ['widget_id', config.widgetId],
      ['variant_code', code],
      ['variant_id', id],
      ['limit', config.recommendationLimit],
      ['container', config.containerId],
      ['product_code', productCode],
      ['page_type', pageType],
      ['language', language],
      ['currency', currency]
    ];
    var query = params
      .filter(function (pair) {
        return pair[1] !== null && pair[1] !== undefined && pair[1] !== '';
      })
      .map(function (pair) {
        return pair[0] + '=' + encodeURIComponent(pair[1]);
      })
      .join('&');
    if (!query) {
      return endpoint;
    }
    return endpoint + (endpoint.indexOf('?') === -1 ? '?' : '&') + query;
  }

  function loadRecommendationWidget(container, variant) {
    if (!container || !variant) { return; }
    var key = variantKey(variant);
    if (!key) { return; }
    if (key === loadedVariantKey || key === pendingVariantKey) { return; }
    var url = buildRecommendationUrl(variant);
    if (!url) { return; }
    pendingVariantKey = key;
    container.removeAttribute('data-kv-widget-error');
    container.setAttribute('data-kv-widget-loading', key);
    container.setAttribute('data-kv-widget', config.widgetToken || '');
    container.setAttribute('data-kv-widget-loaded', '0');

    var script = document.createElement('script');
    script.async = true;
    script.src = url;
    script.setAttribute('data-target', '#' + container.id);
    script.setAttribute('data-kv-auto-widget', (config.instanceId || '') + ':' + key);

    script.addEventListener('load', function () {
      loadedVariantKey = key;
      pendingVariantKey = null;
      container.removeAttribute('data-kv-widget-loading');
      container.removeAttribute('data-kv-widget-error');
      cleanupScript();
    });

    script.addEventListener('error', function () {
      pendingVariantKey = null;
      container.setAttribute('data-kv-widget-error', key);
      cleanupScript();
    });

    function cleanupScript() {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }

    document.head.appendChild(script);
  }

  function resolveCombinationVariant(key) {
    var splitMap = getVariantsSplitMap();
    if (!splitMap || !key) { return null; }
    return splitMap[key] || null;
  }

  function extractVariantFromEvent(event) {
    if (!event) { return null; }
    var detail = event.detail || (event.originalEvent && event.originalEvent.detail) || null;
    var target = event.target || event.srcElement || null;

    function normalizeCandidate(candidate) {
      var normalized = normalizeVariant(candidate);
      if (normalized && (normalized.code || normalized.id)) {
        return normalized;
      }
      return null;
    }

    if (detail === null && target) {
      var attrCode = safeString(
        (target.getAttribute && (target.getAttribute('data-variant-code') || target.getAttribute('data-code'))) ||
        (target.dataset && (target.dataset.variantCode || target.dataset.code))
      );
      var attrId = safeString(
        (target.getAttribute && (target.getAttribute('data-variant-id') || target.getAttribute('data-item-id') || target.getAttribute('data-id'))) ||
        (target.dataset && (target.dataset.variantId || target.dataset.itemId || target.dataset.id))
      );
      var fromTarget = normalizeCandidate({
        variant_code: attrCode,
        variant_id: attrId,
        id: attrId
      });
      if (fromTarget) { return fromTarget; }
    }

    if (detail === null) {
      return null;
    }

    if (typeof detail === 'string' || typeof detail === 'number') {
      var raw = safeString(detail);
      if (raw) {
        var direct = normalizeCandidate({ variant_code: raw });
        if (direct) { return direct; }
        var asId = normalizeCandidate({ variant_id: raw, id: raw });
        if (asId) { return asId; }
      }
    }

    var directCode = safeString(
      detail.variantCode ||
      detail.code ||
      detail.variant_code ||
      detail.itemCode ||
      detail.item_code ||
      detail.itemCodeString
    );
    var directId = safeString(
      detail.variantId ||
      detail.variant_id ||
      detail.id ||
      detail.itemId ||
      detail.item_id ||
      detail.productId ||
      detail.product_id
    );
    var directCandidate = normalizeCandidate({
      variant_code: directCode,
      variant_id: directId,
      id: directId
    });
    if (directCandidate) { return directCandidate; }

    var combinationKey = safeString(detail.combination || detail.combinationId || detail.variantCombination || detail.key);
    if (combinationKey) {
      var fromCombination = normalizeCandidate(resolveCombinationVariant(combinationKey));
      if (fromCombination) { return fromCombination; }
    }

    var byObject = normalizeCandidate(
      detail.variant ||
      detail.selectedVariant ||
      detail.currentVariant ||
      detail.detail ||
      detail.product ||
      detail
    );
    if (byObject) {
      return byObject;
    }

    if (Array.isArray(detail.variants)) {
      var normalizedVariants = detail.variants
        .map(function (entry) { return normalizeVariant(entry); })
        .filter(function (entry) { return entry && (entry.code || entry.id); });
      var fromList = findSelectedVariant(normalizedVariants)
        || findLargestByKey(normalizedVariants, 'volume')
        || findLargestByKey(normalizedVariants, 'price')
        || normalizedVariants[0];
      if (fromList && (fromList.code || fromList.id)) {
        return fromList;
      }
    }

    return null;
  }

  function attemptDynamicLoad(forceReload) {
    if (!dynamicContainer) { return; }
    var variant = pickVariantCandidate();
    if (!variant || (!variant.code && !variant.id && !variant.productCode)) { return; }
    var key = variantKey(variant);
    if (!key) { return; }
    if (!forceReload && (key === loadedVariantKey || key === pendingVariantKey)) {
      return;
    }
    loadRecommendationWidget(dynamicContainer, variant);
  }

  function startVariantWatcher() {
    if (!dynamicContainer) { return; }
    if (!variantEventsRegistered) {
      variantEventsRegistered = true;
      var events = [
        'shoptetVariantChanged',
        'shoptet:variantChanged',
        'shoptet:variant-changed',
        'ShoptetVariantChanged'
      ];
      events.forEach(function (eventName) {
        document.addEventListener(eventName, function (event) {
          var eventVariant = extractVariantFromEvent(event);
          if (eventVariant && dynamicContainer) {
            loadRecommendationWidget(dynamicContainer, eventVariant);
            return;
          }
          attemptDynamicLoad(true);
        });
      });
    }
    if (variantWatcherId) { return; }
    var interval = Math.max(1500, pollInterval);
    variantWatcherId = window.setInterval(function () {
      attemptDynamicLoad(false);
    }, interval);
  }

  function queryTarget() {
    if (!config.selector) { return null; }
    try {
      return document.querySelector(config.selector);
    } catch (error) {
      return null;
    }
  }

  function tryMount() {
    if (mounted) { return; }
    if (normalizedTargets.length && !matchesPage()) {
      return schedule();
    }
    var target = queryTarget();
    if (!target) {
      return schedule();
    }
    var container = ensureContainer(target);
    if (!container) {
      return schedule();
    }
    if (dataSource === 'inventory_recommendations') {
      dynamicContainer = container;
      mounted = true;
      attemptDynamicLoad(true);
      startVariantWatcher();
      return;
    }
    mounted = true;
    loadWidget(container);
  }

  function schedule() {
    if (mounted) { return; }
    if (attempts >= maxAttempts) { return; }
    attempts += 1;
    window.setTimeout(tryMount, pollInterval);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryMount);
  } else {
    tryMount();
  }

  window.setTimeout(tryMount, pollInterval);
})();
// End plugin: tests
