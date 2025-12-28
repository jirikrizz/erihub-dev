@php
    $jsonFlags = JSON_THROW_ON_ERROR | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES;
    $tokenJson = json_encode($token, $jsonFlags);
    $htmlJson = json_encode($html, $jsonFlags);
    $stylesJson = json_encode($styles, $jsonFlags);
    $containerIdJson = json_encode($containerId ?? null, $jsonFlags);
    $containerClassJson = json_encode($containerClass ?? null, $jsonFlags);
@endphp
(function(){
  var token = {!! $tokenJson !!};
  var html = {!! $htmlJson !!};
  var styles = {!! $stylesJson !!};
  var containerId = {!! $containerIdJson !!};
  var containerClass = {!! $containerClassJson !!};
  var scriptTag = document.currentScript;
  var container = null;

  if (scriptTag) {
    var targetAttr = scriptTag.getAttribute('data-target');
    if (targetAttr) {
      container = document.getElementById(targetAttr) || document.querySelector(targetAttr);
    }
    if (!container && containerId) {
      container = document.getElementById(containerId);
    }
    if (!container) {
      var previous = scriptTag.previousElementSibling;
      if (matchesAnchor(previous, token, containerId)) {
        container = previous;
      }
    }
    if (!container) {
      var next = scriptTag.nextElementSibling;
      if (matchesAnchor(next, token, containerId)) {
        container = next;
      }
    }
    if (!container) {
      var existing = document.querySelector('[data-kv-widget=\"' + token + '\"]');
      if (matchesAnchor(existing, token, containerId)) {
        container = existing;
      }
    }
    if (!container) {
      container = document.createElement('div');
      if (containerId) {
        container.id = containerId;
      }
      applyClassNames(container, containerClass);
      container.setAttribute('data-kv-widget', token);
      if (scriptTag.parentNode) {
        scriptTag.parentNode.insertBefore(container, scriptTag);
      }
    } else {
      if (containerId && !container.id) {
        container.id = containerId;
      }
      applyClassNames(container, containerClass);
      container.setAttribute('data-kv-widget', token);
    }
  } else {
    if (containerId) {
      container = document.getElementById(containerId);
    }
    if (!container) {
      container = document.querySelector('[data-kv-widget=\"' + token + '\"]');
    }
    if (!container) {
      container = document.createElement('div');
      if (containerId) {
        container.id = containerId;
      }
      applyClassNames(container, containerClass);
      container.setAttribute('data-kv-widget', token);
      document.body.appendChild(container);
    } else {
      applyClassNames(container, containerClass);
      container.setAttribute('data-kv-widget', token);
    }
  }

  if (!container) {
    return;
  }

  if (styles) {
    var styleId = 'kv-widget-style-' + token;
    if (!document.getElementById(styleId)) {
      var styleTag = document.createElement('style');
      styleTag.id = styleId;
      styleTag.type = 'text/css';
      styleTag.textContent = styles;
      document.head.appendChild(styleTag);
    }
  }

  container = renderWidget(container, html, token);
  container.setAttribute('data-kv-widget-loaded', '1');

  var sliderTarget = container.querySelector ? container.querySelector('.kv-widget-slider') : null;
  var sliderController = setupResponsiveSlider(sliderTarget);

  var originalInfoCache = Object.create(null);
  var SHOP_CDN_ORIGIN = 'https://cdn.myshoptet.com';
  var SHOP_STORAGE_PREFIX = 'usr/www.krasnevune.cz/';
  var SHOP_IMAGES_ROOT = SHOP_CDN_ORIGIN + '/' + SHOP_STORAGE_PREFIX + 'user/shop/';
  var SHOP_BIG_ROOT = SHOP_IMAGES_ROOT + 'big/';
  var DEFAULT_APPENDIX_STYLE = 'display: block; margin: 0 auto; font-size: 14px; font-weight: 500; color: #6f6f6f; line-height: 1.35; text-align: center;';
  // Keep layout styles in CSS; this only acts as a placeholder for dynamic background styles.
  var DEFAULT_APPENDIX_STRONG_STYLE = '';
  var DEFAULT_SUBTITLE = 'Parfémovaná voda';

  function ensureElementVisible(element, fallbackDisplay) {
    if (!element) {
      return;
    }
    var defaultDisplay = element.getAttribute && element.getAttribute('data-kv-default-display');
    if (!defaultDisplay) {
      var inlineDisplay = element.style && element.style.display ? element.style.display : '';
      if (inlineDisplay && inlineDisplay !== 'none') {
        defaultDisplay = inlineDisplay;
      } else if (typeof window !== 'undefined' && window.getComputedStyle) {
        try {
          var computed = window.getComputedStyle(element);
          if (computed && computed.display && computed.display !== 'none') {
            defaultDisplay = computed.display;
          }
        } catch (error) {}
      }
      if (!defaultDisplay || defaultDisplay === 'none') {
        defaultDisplay = fallbackDisplay || 'block';
      }
      if (element.setAttribute) {
        element.setAttribute('data-kv-default-display', defaultDisplay);
      }
    }

    if (element.style) {
      if (!element.style.display || element.style.display === 'none') {
        element.style.display = defaultDisplay || fallbackDisplay || 'block';
      }
      if (element.style.visibility === 'hidden' || !element.style.visibility) {
        element.style.visibility = 'visible';
      }
    }

    if (!element.__kvVisibilityObserver && typeof MutationObserver !== 'undefined') {
      try {
        var observer = new MutationObserver(function () {
          if (!element || !element.style) {
            return;
          }
          if (!element.style.display || element.style.display === 'none') {
            var stored = element.getAttribute && element.getAttribute('data-kv-default-display');
            element.style.display = stored || fallbackDisplay || 'block';
          }
          if (element.style.visibility === 'hidden') {
            element.style.visibility = 'visible';
          }
        });
        observer.observe(element, { attributes: true, attributeFilter: ['style'] });
        element.__kvVisibilityObserver = observer;
      } catch (error) {}
    }
  }

  function stripSizePrefix(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var text = typeof value === 'string' ? value : String(value);
    text = text.replace(/\s+/g, ' ').trim();
    var match = text.match(/^\s*(velikost|size)\s*[:=\-]?\s*/i);
    if (match) {
      text = text.slice(match[0].length);
    }
    return text.trim();
  }

  function sanitizeSubtitleText(value) {
    if (value === null || value === undefined) {
      return '';
    }
    var text = typeof value === 'string' ? value : String(value);
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/[\r\n]+/g, ' ');
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) {
      return '';
    }
    if (/\b(const|let|var|function|return|window|document)\b/i.test(text)) {
      return '';
    }
    if (/[{}<>;=]/.test(text)) {
      return '';
    }
    text = text.replace(/^\s*(Složení|Složen[íi]|Ingredients)\s*[:=\-]?/i, '');
    text = text.replace(/,?\s*(zaměňována|inspirována).*/i, '');
    text = stripSizePrefix(text) || text;
    text = text.trim();
    if (!text) {
      return '';
    }
    if (/\b(Hlava|Srdce|Základ)\b(?!\s*[:\-])/iu.test(text)) {
      return '';
    }
    if (/^(Složení|Složen[íi]|Ingredients)\b/i.test(text)) {
      return '';
    }
    text = limitWords(text, 8);
    if (text.length > 120) {
      var sentenceEnd = text.indexOf('.');
      if (sentenceEnd > 20 && sentenceEnd <= 120) {
        text = text.slice(0, sentenceEnd + 1).trim();
      }
    }
    if (text.length > 120) {
      return '';
    }
    return text;
  }

  function limitWords(text, maxWords) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    var words = text.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return text.trim();
    }
    return words.slice(0, maxWords).join(' ') + '…';
  }

  function normalizeVolumeDisplay(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }
    var trimmed = stripSizePrefix(value);
    if (!trimmed) {
      return '';
    }
    if (!/\d/.test(trimmed)) {
      return '';
    }
    var pieces = trimmed.split(/\s+/);
    if (pieces.length > 3) {
      trimmed = pieces.slice(0, 3).join(' ') + '…';
    }
    return trimmed;
  }

  function parseHighlightTags(raw) {
    if (!raw || typeof raw !== 'string') {
      return [];
    }
    return raw
      .split('|')
      .map(function (entry) {
        return normalizeForComparison(entry || '');
      })
      .filter(Boolean);
  }

  function colorWithAlpha(color, alpha) {
    if (!color || typeof color !== 'string') {
      return 'rgba(37, 155, 99, ' + alpha + ')';
    }
    var trimmed = color.trim();
    var hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
      var hex = hexMatch[1];
      if (hex.length === 3) {
        hex = hex
          .split('')
          .map(function (char) {
            return char + char;
          })
          .join('');
      }
      var r = parseInt(hex.slice(0, 2), 16);
      var g = parseInt(hex.slice(2, 4), 16);
      var b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        return 'rgba(37, 155, 99, ' + alpha + ')';
      }
      return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
    }

    var rgbMatch = trimmed.match(/^rgba?\s*\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)(?:\s*,\s*([0-9.]+))?\s*\)\s*$/i);
    if (rgbMatch) {
      return 'rgba(' + rgbMatch[1] + ', ' + rgbMatch[2] + ', ' + rgbMatch[3] + ', ' + alpha + ')';
    }

    return trimmed;
  }

  function applyGenderHighlight(icon, defaults) {
    if (!icon || !defaults) {
      return;
    }
    if (!icon.hasAttribute('data-kv-gender-shadow')) {
      icon.setAttribute('data-kv-gender-shadow', icon.style.boxShadow || '');
      icon.setAttribute('data-kv-gender-radius', icon.style.borderRadius || '');
      icon.setAttribute('data-kv-gender-background', icon.style.background || '');
    }
    if (defaults.highlightGender) {
      var baseColor = defaults.titleColor || '#1fb56b';
      icon.classList.add('kv-widget-gender-highlight');
      icon.style.boxShadow =
        '0 10px 24px ' + colorWithAlpha(baseColor, 0.25) + ', 0 0 0 8px ' + colorWithAlpha(baseColor, 0.18);
      icon.style.borderRadius = '50%';
      icon.style.background = '#ffffff';
    } else {
      icon.classList.remove('kv-widget-gender-highlight');
      icon.style.boxShadow = icon.getAttribute('data-kv-gender-shadow') || '';
      icon.style.borderRadius = icon.getAttribute('data-kv-gender-radius') || '';
      icon.style.background = icon.getAttribute('data-kv-gender-background') || '';
    }
  }

  function applyTagHighlights(product, defaults) {
    if (!product || !defaults) {
      return;
    }
    var highlightTokens = Array.isArray(defaults.highlightTags) ? defaults.highlightTags : [];
    var tagElements = product.querySelectorAll ? product.querySelectorAll('.tags .tag') : null;
    if (!tagElements || !tagElements.length) {
      return;
    }
    var color = defaults.titleColor || '#1fb56b';
    var background = colorWithAlpha(color, 0.18);
    forEachNode(tagElements, function (tag) {
      if (!tag) {
        return;
      }

      if (!tag.hasAttribute('data-kv-tag-default-bg')) {
        tag.setAttribute('data-kv-tag-default-bg', tag.style.background || '');
        tag.setAttribute('data-kv-tag-default-color', tag.style.color || '');
        tag.setAttribute('data-kv-tag-default-shadow', tag.style.boxShadow || '');
        tag.setAttribute('data-kv-tag-default-weight', tag.style.fontWeight || '');
        tag.setAttribute('data-kv-tag-default-border', tag.style.borderColor || '');
      }

      var normalizedLabel = normalizeForComparison(tag.textContent || '');
      var isHighlighted = highlightTokens.indexOf(normalizedLabel) !== -1;
      if (isHighlighted) {
        tag.classList.add('kv-widget-tag-highlight');
        tag.style.background = background;
        tag.style.color = color;
        tag.style.boxShadow = '0 6px 18px ' + colorWithAlpha(color, 0.22);
        tag.style.fontWeight = '600';
        tag.style.borderColor = color;
      } else {
        tag.classList.remove('kv-widget-tag-highlight');
        tag.style.background = tag.getAttribute('data-kv-tag-default-bg') || '';
        tag.style.color = tag.getAttribute('data-kv-tag-default-color') || '';
        tag.style.boxShadow = tag.getAttribute('data-kv-tag-default-shadow') || '';
        tag.style.fontWeight = tag.getAttribute('data-kv-tag-default-weight') || '';
        tag.style.borderColor = tag.getAttribute('data-kv-tag-default-border') || '';
      }
    });
  }


  function loadOriginalInfo(code) {
    if (!code) {
      return Promise.resolve(null);
    }

    if (Object.prototype.hasOwnProperty.call(originalInfoCache, code)) {
      return originalInfoCache[code];
    }

    var request = fetch('https://app.krasnevune.cz/original/originalApp.php?productid=' + encodeURIComponent(code), {
      credentials: 'omit',
      method: 'GET',
    })
      .then(function (response) {
        if (!response.ok) {
          return null;
        }
        return response.json().catch(function () {
          return null;
        });
      })
      .then(function (data) {
        if (!Array.isArray(data) || data.length === 0) {
          return null;
        }
        var entry = data[0];
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        return {
          productName: safeString(entry.nazev_produktu),
          originalName: safeString(entry.nazev_originalu),
          imageUrl: safeString(entry.url_fotky),
        };
      })
      .catch(function () {
        return null;
      });

    originalInfoCache[code] = request;
    return request;
  }

  if (!container.getAttribute('data-kv-widget-init')) {
    container.setAttribute('data-kv-widget-init', '1');
    setupWidget(container);
  }

  sliderController.refresh();

  function renderWidget(container, html, token) {
    if (!container) {
      return container;
    }

    var wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    var candidate = wrapper.firstElementChild;
    var shouldReplace = false;

    if (candidate && candidate.getAttribute) {
      if (token && candidate.getAttribute('data-kv-widget') === token) {
        shouldReplace = true;
      } else if (container.id && candidate.id && candidate.id === container.id) {
        shouldReplace = true;
      }
    }

    if (shouldReplace) {
      var parent = container.parentNode;
      if (parent) {
        parent.replaceChild(candidate, container);
      } else {
        container.innerHTML = '';
        container.appendChild(candidate);
      }
      if (candidate && candidate.removeAttribute) {
        candidate.removeAttribute('data-kv-widget-init');
      }
      return candidate;
    }

    container.innerHTML = html;
    if (token && container.setAttribute) {
      container.setAttribute('data-kv-widget', token);
    }
    if (container.removeAttribute) {
      container.removeAttribute('data-kv-widget-init');
    }
    return container;
  }

  function enforceParentTargets(root) {
    if (!root || !root.querySelectorAll) {
      return;
    }
    var links = root.querySelectorAll('a[href]');
    forEachNode(links, function (link) {
      if (!link) { return; }
      try {
        link.setAttribute('target', '_parent');
      } catch (error) {}
    });
  }

  function setupWidget(root) {
    if (!root) {
      return;
    }

    enforceParentTargets(root);

    var products = root.querySelectorAll('.product[data-widget-item], .brx-product');
    forEachNode(products, function (product) {
      ensureElementVisible(product, 'block');
      var slide = null;
      if (product.closest) {
        slide = product.closest('.kv-widget-slide');
      } else {
        var ancestor = product.parentNode;
        while (ancestor && ancestor !== root) {
          if (ancestor.classList && ancestor.classList.contains('kv-widget-slide')) {
            slide = ancestor;
            break;
          }
          ancestor = ancestor.parentNode;
        }
      }
      ensureElementVisible(slide, 'flex');
      if (!product.getAttribute('data-widget-item')) {
        product.setAttribute('data-widget-item', '1');
      }
      var defaults = {
        image: normalizeImageUrl(getAttr(product, 'data-default-image')),
        miniImage: normalizeImageUrl(getAttr(product, 'data-default-mini-image')),
        price: getAttr(product, 'data-default-price'),
        originalPrice: getAttr(product, 'data-default-original-price'),
        volume: getAttr(product, 'data-default-volume'),
        discount: getAttr(product, 'data-default-discount'),
        discountPercent: getAttr(product, 'data-default-discount-percent'),
        detailUrl: getAttr(product, 'data-default-detail-url'),
        variantCode: getAttr(product, 'data-default-variant-code'),
        variantId: getAttr(product, 'data-active-variant-id'),
        titleColor: getAttr(product, 'data-title-color'),
        appendixBackground: getAttr(product, 'data-appendix-background'),
        titleText: getAttr(product, 'data-default-title'),
        originalName: getAttr(product, 'data-default-original-name'),
        genderIcon: getAttr(product, 'data-default-gender-icon'),
        gender: getAttr(product, 'data-default-gender'),
        inspiredBrand: getAttr(product, 'data-default-inspired-brand'),
        inspiredTitle: getAttr(product, 'data-default-inspired-title'),
        subtitle: getAttr(product, 'data-default-subtitle'),
        appendixStyle: getAttr(product, 'data-default-appendix-style'),
        highlightGender: (function () {
          var attr = getAttr(product, 'data-highlight-gender');
          if (!attr) {
            return false;
          }
          var normalizedFlag = attr.toString().toLowerCase();
          return normalizedFlag === '1' || normalizedFlag === 'true' || normalizedFlag === 'yes';
        })(),
        highlightTags: parseHighlightTags(getAttr(product, 'data-highlight-tags')),
        subtitleNode: null,
        currentFetchToken: null
      };
      defaults.volume = normalizeVolumeDisplay(defaults.volume);
      defaults.subtitle = sanitizeSubtitleText(defaults.subtitle);
      if (!defaults.inspiredTitle) {
        defaults.inspiredTitle = defaults.originalName || '';
      }
      defaults.inspiredTitle = removeBrandPrefix(defaults.inspiredTitle, defaults.inspiredBrand);
      if (defaults.subtitle) {
        defaults.subtitle = sanitizeSubtitleText(defaults.subtitle) || DEFAULT_SUBTITLE;
      } else {
        defaults.subtitle = DEFAULT_SUBTITLE;
      }

      var imageAnchor = product.querySelector('a.image');
      var mainImage = product.querySelector('img[data-role="product-image"]');
      var miniWrapper = product.querySelector('.mini-original-parfume[data-role="mini-wrapper"]') || product.querySelector('.mini-original-parfume');
      var miniImage = miniWrapper ? miniWrapper.querySelector('img[data-role="mini-image"]') || miniWrapper.querySelector('img') : null;
      var priceRoot = product.querySelector('.price-final');
      var priceStrong = priceRoot ? priceRoot.querySelector('strong') : null;
      var priceStandard = priceRoot ? (priceRoot.querySelector('.brx-price-standard') || priceRoot.querySelector('.price-standard')) : null;
      var priceStandardValue = priceStandard ? priceStandard.querySelector('span') : null;
      var priceSave = priceRoot ? (priceRoot.querySelector('.brx-price-save') || priceRoot.querySelector('.price-save')) : null;
      var volumeEl = product.querySelector('.productVolume');
      var buyButton = product.querySelector('.kv-widget-cart-button') || product.querySelector('.btn-cart');
      var detailButton = product.querySelector('.btn.btn-primary');
      var nameLink = product.querySelector('.name');
      var variantItems = product.querySelectorAll('.widget-parameter-value');
      var nameSpan = nameLink ? nameLink.querySelector('[data-testid="productCardName"]') : null;
      var nameTextSpan = nameSpan ? nameSpan.querySelector('[data-role="product-name-text"]') : null;
      var genderIconImg = product.querySelector('.gender_img_icon');
      var appendixEl = product.querySelector('.product-appendix.category-appendix');
      var changableEl = appendixEl ? appendixEl.querySelector('.changable') : null;
      var originalNameEl = changableEl ? changableEl.querySelector('strong') : null;

      if (!defaults.detailUrl) {
        defaults.detailUrl = getAttr(detailButton, 'data-default-url') || getAttr(imageAnchor, 'data-default-url') || '#';
      }
      if (!defaults.image && mainImage) {
        defaults.image = normalizeImageUrl(mainImage.getAttribute('src')) || '';
      }
      if (!defaults.miniImage && miniImage) {
        defaults.miniImage = normalizeImageUrl(miniImage.getAttribute('src')) || '';
      }
      if (!defaults.price && priceStrong) {
        defaults.price = priceStrong.textContent || '';
      }
      if (!defaults.originalPrice && priceStandardValue) {
        defaults.originalPrice = priceStandardValue.textContent || '';
      }
      if (!defaults.discount && priceSave) {
        defaults.discount = priceSave.textContent || '';
      }
      if (!defaults.volume && volumeEl) {
        defaults.volume = normalizeVolumeDisplay(volumeEl.textContent || '');
      }
      if (!defaults.titleText && nameTextSpan) {
        defaults.titleText = nameTextSpan.textContent || '';
      } else if (!defaults.titleText && nameSpan) {
        defaults.titleText = nameSpan.textContent || '';
      }
      if (!defaults.originalName && originalNameEl) {
        defaults.originalName = originalNameEl.textContent || '';
      }
      if (!defaults.genderIcon && genderIconImg) {
        defaults.genderIcon = genderIconImg.getAttribute('src') || '';
      }

      defaults.titleText = defaults.titleText || '';

      if (!defaults.appendixStyle) {
        defaults.appendixStyle = getAttr(appendixEl, 'style') || DEFAULT_APPENDIX_STYLE;
      }
      if (appendixEl) {
        defaults.subtitleNode = findAppendixSubtitleNode(appendixEl);
      }

      if (nameSpan && defaults.titleColor) {
        nameSpan.style.color = defaults.titleColor;
      }

      updateGenderIcon(genderIconImg, defaults.genderIcon, defaults.gender);
      applyAppendixStyle(product, defaults.appendixBackground);
      applyGenderHighlight(genderIconImg, defaults);
      applyTagHighlights(product, defaults);

      function setActiveOption(option) {
        forEachNode(variantItems, function (item) {
          var isActive = item === option;
          if (isActive) {
            item.classList.add('active-variant');
          } else {
            item.classList.remove('active-variant');
          }
          var optionLink = item.querySelector ? item.querySelector('a') : null;
          if (optionLink) {
            if (isActive) {
              optionLink.style.background = '#259B63';
              optionLink.style.color = '#ffffff';
              optionLink.style.borderColor = '#259B63';
            } else {
              optionLink.style.background = '#ffffff';
              optionLink.style.color = '#259B63';
              optionLink.style.borderColor = '#259B63';
            }
          }
        });
      }

      function updateDetailLinks(detailUrl) {
        var resolved = detailUrl || defaults.detailUrl || '#';
        if (detailButton) {
          detailButton.setAttribute('href', resolved);
        }
        if (imageAnchor) {
          imageAnchor.setAttribute('href', resolved);
        }
        if (nameLink) {
          nameLink.setAttribute('href', resolved);
        }
        product.setAttribute('data-current-detail-url', resolved);
      }

      function applyVariant(option) {
        setActiveOption(option);

        var variantCode = option ? (option.getAttribute('data-variant-code') || option.getAttribute('data-variant-id')) : '';
        if (!variantCode) {
          variantCode = defaults.variantCode || '';
        }

        var variantId = option ? option.getAttribute('data-variant-id') : '';
        if (!variantId) {
          variantId = defaults.variantId || '';
        }

        if (buyButton) {
          if (variantCode) {
            buyButton.setAttribute('data-variant-code', variantCode);
          } else {
            buyButton.removeAttribute('data-variant-code');
          }

          if (variantId) {
            buyButton.setAttribute('data-variant-id', variantId);
          } else {
            buyButton.removeAttribute('data-variant-id');
          }
        }

        if (variantCode) {
          product.setAttribute('data-current-variant-code', variantCode);
        } else {
          product.removeAttribute('data-current-variant-code');
        }
        defaults.currentVariantCode = variantCode || '';

        var priceValue = option ? option.getAttribute('data-variant-price') : '';
        if (!priceValue) {
          priceValue = defaults.price || '';
        }
        if (priceStrong) {
          if (priceValue) {
            priceStrong.style.visibility = 'visible';
            setText(priceStrong, priceValue);
          } else {
            priceStrong.style.visibility = 'hidden';
            setText(priceStrong, '');
          }
        }

        var originalValue = option ? option.getAttribute('data-variant-original-price') : '';
        if (!originalValue) {
          originalValue = defaults.originalPrice || '';
        }

        var discountValue = option ? option.getAttribute('data-variant-discount') : '';
        if (!discountValue) {
          discountValue = defaults.discount || '';
        }
        var discountPercentRaw = option ? option.getAttribute('data-variant-discount-percent') : '';
        if (!discountPercentRaw) {
          discountPercentRaw = defaults.discountPercent || '';
        }
        var parsedDiscountPercent = parsePercent(discountPercentRaw);
        var hasPositivePercent = parsedDiscountPercent !== null && parsedDiscountPercent > 0;
        var hasKnownPercent = parsedDiscountPercent !== null;
        if (!discountValue && hasPositivePercent) {
          discountValue = Math.round(parsedDiscountPercent) + ' %';
        }
        if (hasKnownPercent && !hasPositivePercent) {
          discountValue = '';
        }
        var shouldShowDiscount =
          (hasPositivePercent || (!hasKnownPercent && !!discountValue)) &&
          !!originalValue;

        if (priceStandard) {
          if (shouldShowDiscount) {
            priceStandard.style.display = 'inline-block';
            if (priceStandardValue) {
              setText(priceStandardValue, originalValue);
            }
          } else {
            priceStandard.style.display = 'none';
          }
        }

        if (priceSave) {
          if (shouldShowDiscount && discountValue) {
            priceSave.style.display = '';
            setText(priceSave, discountValue);
          } else {
            priceSave.style.display = 'none';
            setText(priceSave, '');
          }
        }

        var volumeValue = option ? option.getAttribute('data-variant-volume') : '';
        volumeValue = normalizeVolumeDisplay(volumeValue);
        if (!volumeValue) {
          volumeValue = defaults.volume || '';
        }
        if (volumeEl) {
          if (volumeValue) {
            volumeEl.style.display = '';
            setText(volumeEl, volumeValue);
          } else {
            volumeEl.style.display = 'none';
            setText(volumeEl, '');
          }
        }

        var imageUrl = option ? normalizeImageUrl(option.getAttribute('data-variant-image')) : '';
        if (!imageUrl) {
          imageUrl = defaults.image || '';
        }
        if (mainImage) {
          if (imageUrl) {
            mainImage.src = imageUrl;
            mainImage.style.visibility = 'visible';
          } else {
            mainImage.style.visibility = 'hidden';
          }
        }

        var miniUrl = option ? normalizeImageUrl(option.getAttribute('data-variant-mini-image')) : '';
        if (!miniUrl) {
          miniUrl = defaults.miniImage || '';
        }
        if (miniWrapper) {
          if (miniUrl) {
            miniWrapper.style.display = 'flex';
            if (miniImage) {
              miniImage.src = miniUrl;
            }
          } else {
            miniWrapper.style.display = 'none';
          }
        }

        var detailUrl = option ? (option.getAttribute('data-variant-detail-url') || option.getAttribute('data-variant-url')) : '';
        if (!detailUrl) {
          detailUrl = defaults.detailUrl || '';
        }
        updateDetailLinks(detailUrl);

        var inspiredBrand = option ? option.getAttribute('data-variant-inspired-brand') : '';
        if (!inspiredBrand) {
          inspiredBrand = defaults.inspiredBrand || '';
        }
        defaults.inspiredBrand = inspiredBrand;
        if (inspiredBrand) {
          product.setAttribute('data-current-inspired-brand', inspiredBrand);
        } else {
          product.removeAttribute('data-current-inspired-brand');
        }

        var inspiredTitle = option ? option.getAttribute('data-variant-inspired-title') : '';
        if (!inspiredTitle) {
          inspiredTitle = defaults.inspiredTitle || defaults.originalName || '';
        }
        inspiredTitle = removeBrandPrefix(inspiredTitle, inspiredBrand);
        defaults.inspiredTitle = inspiredTitle;
        if (inspiredTitle) {
          product.setAttribute('data-current-inspired-title', inspiredTitle);
        } else {
          product.removeAttribute('data-current-inspired-title');
        }

        var elementState = {
          nameSpan: nameSpan,
          nameTextSpan: nameTextSpan,
          appendixEl: appendixEl,
          changableEl: changableEl,
          originalNameEl: originalNameEl,
          miniWrapper: miniWrapper,
          miniImage: miniImage,
          genderIconImg: genderIconImg,
        };

        applyOriginalInfo(product, defaults, null, elementState);

        appendixEl = elementState.appendixEl;
        changableEl = elementState.changableEl;
        originalNameEl = elementState.originalNameEl;
        miniWrapper = elementState.miniWrapper;
        miniImage = elementState.miniImage;

        applyAppendixStyle(product, defaults.appendixBackground);
        applyGenderHighlight(genderIconImg, defaults);
        applyTagHighlights(product, defaults);

        if (variantCode) {
          var fetchToken = variantCode + '::' + Date.now();
          defaults.currentFetchToken = fetchToken;
          loadOriginalInfo(variantCode).then(function (info) {
            var activeCode = product.getAttribute('data-current-variant-code') || '';
            if (activeCode !== (variantCode || '')) {
              return;
            }
            if (defaults.currentFetchToken !== fetchToken) {
              return;
            }
            var asyncElementState = {
              nameSpan: nameSpan,
              nameTextSpan: nameTextSpan,
              appendixEl: appendixEl,
              changableEl: changableEl,
              originalNameEl: originalNameEl,
              miniWrapper: miniWrapper,
              miniImage: miniImage,
              genderIconImg: genderIconImg,
            };
            applyOriginalInfo(product, defaults, info, asyncElementState);
            appendixEl = asyncElementState.appendixEl;
            changableEl = asyncElementState.changableEl;
            originalNameEl = asyncElementState.originalNameEl;
            miniWrapper = asyncElementState.miniWrapper;
            miniImage = asyncElementState.miniImage;
            applyAppendixStyle(product, defaults.appendixBackground);
            applyGenderHighlight(genderIconImg, defaults);
            applyTagHighlights(product, defaults);
          });
        }
      }

      forEachNode(variantItems, function (option) {
        var clickable = option.querySelector('a');
        var handler = function (event) {
          if (event) {
            event.preventDefault();
            if (typeof event.stopPropagation === 'function') {
              event.stopPropagation();
            }
            if (typeof event.stopImmediatePropagation === 'function') {
              event.stopImmediatePropagation();
            }
          }
          applyVariant(option);
        };
        option.addEventListener('click', handler);
        if (clickable) {
          clickable.addEventListener('click', handler);
        }
      });

      var initial = product.querySelector('.widget-parameter-value.active-variant');
      if (!initial && variantItems.length > 0) {
        initial = variantItems[0];
      }
      if (initial) {
        applyVariant(initial);
      } else {
        applyVariant(null);
      }

      if (buyButton) {
        buyButton.addEventListener('click', function (event) {
          if (event) {
            if (typeof event.preventDefault === 'function') {
              event.preventDefault();
            }
            if (typeof event.stopPropagation === 'function') {
              event.stopPropagation();
            }
            if (typeof event.stopImmediatePropagation === 'function') {
              event.stopImmediatePropagation();
            }
          }

          var variantCode = buyButton.getAttribute('data-variant-code') || product.getAttribute('data-current-variant-code') || defaults.variantCode || '';
          var detailUrl = product.getAttribute('data-current-detail-url') || defaults.detailUrl || '#';

          if (variantCode && window.shoptet && window.shoptet.cartShared && typeof window.shoptet.cartShared.addToCart === 'function') {
            try {
              window.shoptet.cartShared.addToCart({ productCode: variantCode });
            } catch (error) {
              safeConsoleWarn('[kv-widget] addToCart failed', error);
              if (detailUrl) {
                window.location.href = detailUrl;
              }
            }
          } else if (detailUrl) {
            window.location.href = detailUrl;
          }
        });
      }
    });
  }

  function findAppendixSubtitleNode(appendixEl) {
    if (!appendixEl) {
      return null;
    }
    var node = appendixEl.firstChild;
    while (node) {
      if (node.nodeType === 3) {
        return node;
      }
      node = node.nextSibling;
    }
    return null;
  }

  function ensureAppendixElements(product, defaults, elements) {
    if (!defaults || !elements) {
      return null;
    }

    var nameSpan = elements.nameSpan || null;
    var appendixEl = elements.appendixEl || null;

    if (!defaults.subtitle) {
      defaults.subtitle = DEFAULT_SUBTITLE;
    }

    if (!defaults.appendixStyle || defaults.appendixStyle === '') {
      var styleCandidate = appendixEl ? appendixEl.getAttribute('style') || '' : '';
      defaults.appendixStyle = styleCandidate || DEFAULT_APPENDIX_STYLE;
    }

    if (!appendixEl || !appendixEl.parentNode) {
      if (!nameSpan) {
        elements.appendixEl = null;
        elements.changableEl = null;
        elements.originalNameEl = null;
        return null;
      }
      appendixEl = document.createElement('span');
      appendixEl.className = 'product-appendix category-appendix';
      if (defaults.appendixStyle) {
        appendixEl.setAttribute('style', defaults.appendixStyle);
      }
      var textNode = document.createTextNode(defaults.subtitle || '');
      appendixEl.appendChild(textNode);
      defaults.subtitleNode = textNode;
      nameSpan.appendChild(appendixEl);
      elements.appendixEl = appendixEl;
    }

    appendixEl = elements.appendixEl || null;

    if (appendixEl) {
      if (!defaults.subtitleNode || defaults.subtitleNode.parentNode !== appendixEl) {
        defaults.subtitleNode = findAppendixSubtitleNode(appendixEl);
      }
      if (!defaults.subtitleNode) {
        var newTextNode = document.createTextNode(defaults.subtitle || '');
        appendixEl.insertBefore(newTextNode, appendixEl.firstChild || null);
        defaults.subtitleNode = newTextNode;
      } else {
        defaults.subtitleNode.nodeValue = defaults.subtitle || '';
      }
    }

    var changableEl = appendixEl ? appendixEl.querySelector('.changable') : null;
    var originalNameEl = changableEl ? changableEl.querySelector('strong') : null;

    elements.appendixEl = appendixEl;
    elements.changableEl = changableEl;
    elements.originalNameEl = originalNameEl;

    return appendixEl;
  }

  function applyOriginalInfo(product, defaults, info, elements) {
    if (!product || !defaults || !elements) {
      return;
    }

    var nameSpan = elements.nameSpan || null;
    var nameTextSpan = elements.nameTextSpan || null;
    var appendixEl = ensureAppendixElements(product, defaults, elements);
    var changableEl = elements.changableEl || null;
    var originalNameEl = elements.originalNameEl || null;
    var miniWrapper = elements.miniWrapper || null;
    var miniImage = elements.miniImage || null;
    var genderIconImg = elements.genderIconImg || null;
    if (changableEl && !originalNameEl) {
      if (changableEl.parentNode) {
        changableEl.parentNode.removeChild(changableEl);
      }
      changableEl = null;
      elements.changableEl = null;
      elements.originalNameEl = null;
    }
    if (originalNameEl) {
      var enforcedStrongStyle = DEFAULT_APPENDIX_STRONG_STYLE;
      if (defaults.appendixBackground) {
        enforcedStrongStyle += ' background-image: url("' + defaults.appendixBackground + '");';
      } else {
        enforcedStrongStyle += ' background-image: none;';
      }
      enforcedStrongStyle += ' background-repeat: no-repeat; background-size: cover;';
      originalNameEl.setAttribute('style', enforcedStrongStyle);
    }

    var productName = info && info.productName ? info.productName : defaults.titleText || '';
    var inspiredBrand = defaults.inspiredBrand || '';
    var inspiredTitle = defaults.inspiredTitle || defaults.originalName || '';
    if (info && info.originalName) {
      inspiredTitle = info.originalName;
    }
    if (info && info.originalBrand) {
      inspiredBrand = info.originalBrand;
    }

    inspiredBrand = safeString(inspiredBrand);
    inspiredTitle = safeString(inspiredTitle);
    if (info && info.originalName) {
      defaults.inspiredTitle = inspiredTitle;
    }
    if (info && info.originalBrand) {
      defaults.inspiredBrand = inspiredBrand;
    }
    inspiredTitle = removeBrandPrefix(inspiredTitle, inspiredBrand);
    defaults.inspiredTitle = removeBrandPrefix(defaults.inspiredTitle, inspiredBrand);
    // Do not truncate inspiration title
    var miniUrl = info && info.imageUrl ? normalizeImageUrl(info.imageUrl) : defaults.miniImage || '';
    var inspiredMarkup = buildInspiredHtml(inspiredBrand, inspiredTitle);
    var shouldShow = inspiredMarkup !== '';

    if (nameTextSpan) {
      setText(nameTextSpan, productName);
    } else if (nameSpan) {
      setText(nameSpan, productName);
    }
    if (nameSpan && defaults.titleColor) {
      nameSpan.style.color = defaults.titleColor;
    }

    if (changableEl && originalNameEl) {
      changableEl.style.display = shouldShow ? 'inline' : 'none';
      originalNameEl.innerHTML = shouldShow ? inspiredMarkup : '';
    } else if (appendixEl && shouldShow && !changableEl) {
      var newChangable = document.createElement('span');
      newChangable.className = 'changable';
      newChangable.style.display = 'inline';
      newChangable.appendChild(document.createTextNode(', zaměňována s:'));
      newChangable.appendChild(document.createElement('br'));
      var strong = document.createElement('strong');
      var strongStyle = DEFAULT_APPENDIX_STRONG_STYLE;
      if (defaults.appendixBackground) {
        strongStyle += ' background-image: url("' + defaults.appendixBackground + '");';
      } else {
        strongStyle += ' background-image: none;';
      }
      strongStyle += ' background-repeat: no-repeat; background-size: cover;';
      strong.setAttribute('style', strongStyle);
      strong.innerHTML = inspiredMarkup;
      newChangable.appendChild(strong);
      appendixEl.appendChild(newChangable);
      elements.changableEl = newChangable;
      elements.originalNameEl = strong;
      changableEl = newChangable;
      originalNameEl = strong;
      var storedTitle = removeBrandPrefix(inspiredTitle || '', inspiredBrand || '');
      defaults.originalName = storedTitle || inspiredBrand;
      defaults.inspiredTitle = storedTitle || '';
      defaults.inspiredBrand = inspiredBrand || '';
    }

    if (miniWrapper) {
      if (miniUrl) {
        miniWrapper.style.display = 'flex';
        if (miniImage) {
          miniImage.src = miniUrl;
        }
      } else {
        miniWrapper.style.display = 'none';
      }
    }

    updateGenderIcon(genderIconImg, defaults.genderIcon, defaults.gender);
    elements.appendixEl = appendixEl;
    elements.changableEl = changableEl;
    elements.originalNameEl = originalNameEl;
    elements.miniWrapper = miniWrapper;
    elements.miniImage = miniImage;
    elements.genderIconImg = genderIconImg;
  }

  function applyAppendixStyle(product, backgroundUrl) {
    if (!product) {
      return;
    }
    var appendices = product.querySelectorAll('.product-appendix strong');
    if (!appendices || appendices.length === 0) {
      return;
    }
    forEachNode(appendices, function (element) {
      if (!element) {
        return;
      }
      if (backgroundUrl) {
        element.style.backgroundImage = 'url("' + backgroundUrl + '")';
        element.style.backgroundRepeat = 'no-repeat';
        element.style.backgroundSize = 'cover';
      } else {
        element.style.backgroundImage = '';
      }
    });
  }

  function updateGenderIcon(element, url, gender) {
    if (!element) {
      return;
    }

    var normalizedGender = (gender || '').toString().toLowerCase();
    var shouldHide = !url || !normalizedGender || normalizedGender === 'unknown';

    if (!shouldHide) {
      element.style.display = '';
      element.src = url;
    } else {
      element.style.display = 'none';
      element.removeAttribute('src');
    }
  }

  function setupResponsiveSlider(slider) {
    var noop = {
      refresh: function () {},
      destroy: function () {},
    };

    if (!slider || typeof window === 'undefined') {
      return noop;
    }

    var viewport = slider.querySelector('.kv-widget-viewport');
    var track = slider.querySelector('.kv-widget-track');

    if (!viewport || !track) {
      return noop;
    }

    var prevButton = slider.querySelector('.kv-widget-prev');
    var nextButton = slider.querySelector('.kv-widget-next');
    var dotsContainer = slider.querySelector('.kv-widget-slider-dots');

    var slides = [];
    var dotEntries = [];
    var pages = [];
    var currentPage = 0;
    var resizeObserver = null;
    var prevHandler = null;
    var nextHandler = null;
    var loadHandler = null;
    var scrollHandler = null;
    var navHoverHandlers = [];

    function collectSlides() {
      slides = Array.prototype.slice.call(track.querySelectorAll('.kv-widget-slide'));
    }

    function cleanupDots() {
      if (!dotEntries) {
        return;
      }
      for (var i = 0; i < dotEntries.length; i += 1) {
        var entry = dotEntries[i];
        if (entry && entry.element && entry.handler) {
          entry.element.removeEventListener('click', entry.handler);
        }
      }
      dotEntries = [];
      if (dotsContainer) {
        dotsContainer.innerHTML = '';
        dotsContainer.style.display = 'none';
      }
    }

    function updateDots() {
      for (var i = 0; i < dotEntries.length; i += 1) {
        var entry = dotEntries[i];
        if (!entry || !entry.element) {
          continue;
        }
        var isActive = i === currentPage;
        if (isActive) {
          entry.element.classList.add('is-active');
        } else {
          entry.element.classList.remove('is-active');
        }
        entry.element.style.background = isActive ? '#1fb56b' : '#ffffff';
        entry.element.style.borderColor = isActive ? '#1fb56b' : 'rgba(31, 181, 107, 0.45)';
        entry.element.style.transform = isActive ? 'scale(1.1)' : 'scale(1)';
      }
    }

    function updateNavState() {
      var totalPages = pages.length;
      var showControls = totalPages > 1;
      if (prevButton) {
        prevButton.style.display = showControls ? '' : 'none';
        prevButton.disabled = !showControls;
        prevButton.classList.toggle('is-disabled', !showControls);
        prevButton.style.pointerEvents = showControls ? 'auto' : 'none';
        prevButton.style.opacity = showControls ? '1' : '0.45';
        prevButton.style.background = showControls ? '#ffffff' : '#f5f6fa';
        prevButton.style.color = showControls ? '#1fb56b' : 'rgba(31, 181, 107, 0.45)';
        prevButton.style.borderColor = showControls ? 'rgba(208, 213, 232, 0.8)' : 'rgba(208, 213, 232, 0.5)';
        prevButton.style.boxShadow = showControls ? '0 14px 28px rgba(31, 181, 107, 0.2)' : 'none';
      }
      if (nextButton) {
        nextButton.style.display = showControls ? '' : 'none';
        nextButton.disabled = !showControls;
        nextButton.classList.toggle('is-disabled', !showControls);
        nextButton.style.pointerEvents = showControls ? 'auto' : 'none';
        nextButton.style.opacity = showControls ? '1' : '0.45';
        nextButton.style.background = showControls ? '#ffffff' : '#f5f6fa';
        nextButton.style.color = showControls ? '#1fb56b' : 'rgba(31, 181, 107, 0.45)';
        nextButton.style.borderColor = showControls ? 'rgba(208, 213, 232, 0.8)' : 'rgba(208, 213, 232, 0.5)';
        nextButton.style.boxShadow = showControls ? '0 14px 28px rgba(31, 181, 107, 0.2)' : 'none';
      }
    }

    function bindNavHover(button) {
      if (!button) {
        return;
      }
      var enter = function () {
        if (button.disabled) {
          return;
        }
        button.style.background = '#1fb56b';
        button.style.color = '#ffffff';
        button.style.borderColor = '#1fb56b';
      };
      var leave = function () {
        if (button.disabled) {
          return;
        }
        button.style.background = '#ffffff';
        button.style.color = '#1fb56b';
        button.style.borderColor = 'rgba(208, 213, 232, 0.8)';
      };
      button.addEventListener('mouseenter', enter);
      button.addEventListener('mouseleave', leave);
      button.addEventListener('focus', enter);
      button.addEventListener('blur', leave);
      navHoverHandlers.push({
        button: button,
        enter: enter,
        leave: leave,
      });
    }

    function syncPageFromScroll() {
      if (!slides || slides.length === 0) {
        return;
      }
      var scrollLeft = viewport.scrollLeft || 0;
      var closestIndex = 0;
      var closestDistance = Infinity;
      for (var i = 0; i < slides.length; i += 1) {
        var slide = slides[i];
        if (!slide) {
          continue;
        }
        var distance = Math.abs((slide.offsetLeft || 0) - scrollLeft);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = i;
        }
      }
      var newPage = 0;
      var bestPageDistance = Infinity;
      for (var p = 0; p < pages.length; p += 1) {
        var startIndex = pages[p] || 0;
        var startSlide = slides[startIndex];
        if (!startSlide) {
          continue;
        }
        var delta = Math.abs((startSlide.offsetLeft || 0) - scrollLeft);
        if (delta < bestPageDistance) {
          bestPageDistance = delta;
          newPage = p;
        }
      }
      if (newPage !== currentPage) {
        currentPage = newPage;
        updateDots();
        updateNavState();
      }
    }

    function goToPage(pageIndex, instant) {
      if (pages.length === 0) {
        return;
      }

      var totalPages = pages.length;
      var normalized = pageIndex % totalPages;
      if (normalized < 0) {
        normalized += totalPages;
      }
      currentPage = normalized;
      var slideIndex = pages[normalized] || 0;
      var targetSlide = slides[slideIndex];
      var offset = targetSlide ? targetSlide.offsetLeft : 0;

      if (typeof viewport.scrollTo === 'function') {
        viewport.scrollTo({
          left: offset,
          top: 0,
          behavior: instant ? 'auto' : 'smooth',
        });
      } else {
        viewport.scrollLeft = offset;
      }

      updateDots();
      updateNavState();
    }

    function buildDots() {
      cleanupDots();

      if (!dotsContainer || pages.length <= 1) {
        return;
      }

      dotsContainer.style.display = 'flex';
      for (var index = 0; index < pages.length; index += 1) {
        (function (pageIndex) {
          var button = document.createElement('button');
          button.type = 'button';
          button.className = 'kv-widget-slider-dot';
          button.style.width = '12px';
          button.style.height = '12px';
          button.style.borderRadius = '50%';
          button.style.border = '1px solid rgba(31, 181, 107, 0.45)';
          button.style.background = '#ffffff';
          button.style.padding = '0';
          button.style.cursor = 'pointer';
          button.style.transition = 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease';
          button.setAttribute('aria-label', 'Stránka ' + (pageIndex + 1));
          var handler = function (event) {
            if (event) {
              event.preventDefault();
            }
            goToPage(pageIndex, false);
          };
          button.addEventListener('click', handler);
          dotsContainer.appendChild(button);
          dotEntries.push({ element: button, handler: handler });
        })(index);
      }

      updateDots();
    }

    function calculateLayout() {
      collectSlides();

      if (!slides || slides.length <= 1) {
        slider.removeAttribute('data-kv-slider');
        cleanupDots();
        if (prevButton) {
          prevButton.style.display = 'none';
        }
        if (nextButton) {
          nextButton.style.display = 'none';
        }
        track.style.transition = '';
        track.style.transform = 'translate3d(0, 0, 0)';
        return;
      }

      var originalTransition = track.style.transition || '';
      track.style.transition = 'none';
      track.style.transform = 'translate3d(0, 0, 0)';

      var computedStyles = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(track) : null;
      var gapValue = 0;
      if (computedStyles) {
        var gapCandidate =
          computedStyles.columnGap || computedStyles.gap || computedStyles.rowGap || computedStyles.marginRight || '0';
        var parsedGap = parseFloat(gapCandidate);
        if (!Number.isNaN(parsedGap)) {
          gapValue = parsedGap;
        }
      }

      var baseSlideWidth = slides[0].getBoundingClientRect().width;
      if (!baseSlideWidth || baseSlideWidth <= 0) {
        baseSlideWidth = slides[0].offsetWidth || 0;
      }
      if (!baseSlideWidth || baseSlideWidth <= 0) {
        baseSlideWidth = 300;
      }

      var step = slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : baseSlideWidth + gapValue;
      if (!step || step <= 0) {
        step = baseSlideWidth + gapValue;
      }

      var viewportWidth = viewport.clientWidth || slider.clientWidth || step;
      var effectiveWidth = baseSlideWidth + gapValue;
      if (!effectiveWidth || effectiveWidth <= 0) {
        effectiveWidth = step;
      }
      var computedSlidesPerPage = Math.max(1, Math.round(viewportWidth / effectiveWidth));
      if (computedSlidesPerPage < 1) {
        computedSlidesPerPage = 1;
      }

      pages = [];
      for (var start = 0; start < slides.length; start += computedSlidesPerPage) {
        pages.push(start);
      }
      if (pages.length === 0) {
        pages.push(0);
      }
      if (currentPage >= pages.length) {
        currentPage = pages.length - 1;
      }

      slider.setAttribute('data-kv-slider', 'enabled');

      buildDots();
      track.style.transition = '';
      track.style.transform = '';
      goToPage(currentPage, true);
      updateNavState();
    }

    prevHandler = function (event) {
      if (event) {
        event.preventDefault();
      }
      goToPage(currentPage - 1, false);
    };

    nextHandler = function (event) {
      if (event) {
        event.preventDefault();
      }
      goToPage(currentPage + 1, false);
    };

    if (prevButton) {
      prevButton.addEventListener('click', prevHandler);
    }
    if (nextButton) {
      nextButton.addEventListener('click', nextHandler);
    }
    bindNavHover(prevButton);
    bindNavHover(nextButton);

    var throttledResize = throttle(calculateLayout, 150);
    window.addEventListener('resize', throttledResize);

    scrollHandler = throttle(syncPageFromScroll, 100);
    viewport.addEventListener('scroll', scrollHandler, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(calculateLayout);
      resizeObserver.observe(viewport);
    }

    calculateLayout();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () {
        calculateLayout();
      });
    }
    setTimeout(calculateLayout, 120);
    if (typeof window !== 'undefined') {
      loadHandler = function () {
        calculateLayout();
      };
      window.addEventListener('load', loadHandler);
    }

    return {
      refresh: calculateLayout,
      destroy: function () {
        cleanupDots();
        if (prevButton && prevHandler) {
          prevButton.removeEventListener('click', prevHandler);
          prevButton.classList.remove('is-disabled');
          prevButton.disabled = false;
          prevButton.style.display = '';
          prevButton.style.pointerEvents = 'auto';
          prevButton.style.opacity = '1';
          prevButton.style.background = '';
          prevButton.style.color = '';
          prevButton.style.borderColor = '';
          prevButton.style.boxShadow = '';
        }
        if (nextButton && nextHandler) {
          nextButton.removeEventListener('click', nextHandler);
          nextButton.classList.remove('is-disabled');
          nextButton.disabled = false;
          nextButton.style.display = '';
          nextButton.style.pointerEvents = 'auto';
          nextButton.style.opacity = '1';
          nextButton.style.background = '';
          nextButton.style.color = '';
          nextButton.style.borderColor = '';
          nextButton.style.boxShadow = '';
        }
        if (navHoverHandlers && navHoverHandlers.length > 0) {
          for (var i = 0; i < navHoverHandlers.length; i += 1) {
            var record = navHoverHandlers[i];
            if (!record || !record.button) {
              continue;
            }
            if (record.enter) {
              record.button.removeEventListener('mouseenter', record.enter);
              record.button.removeEventListener('focus', record.enter);
            }
            if (record.leave) {
              record.button.removeEventListener('mouseleave', record.leave);
              record.button.removeEventListener('blur', record.leave);
            }
          }
          navHoverHandlers = [];
      }
      window.removeEventListener('resize', throttledResize);
      if (scrollHandler) {
        viewport.removeEventListener('scroll', scrollHandler);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (loadHandler && typeof window !== 'undefined') {
        window.removeEventListener('load', loadHandler);
      }
      slider.removeAttribute('data-kv-slider');
      track.style.transition = '';
      track.style.transform = '';
    },
  };
}

  function matchesAnchor(element, tokenValue, expectedId) {
    if (!element || element.nodeType !== 1) {
      return false;
    }
    if (element.getAttribute('data-kv-widget') === tokenValue) {
      return true;
    }
    if (expectedId && element.id === expectedId) {
      return true;
    }
    return false;
  }

  function normalizeClassTokens(input) {
    if (Array.isArray(input)) {
      return input
        .map(normalizeClassTokens)
        .reduce(function (all, subset) {
          return all.concat(subset);
        }, []);
    }
    if (input === null || input === undefined) {
      return [];
    }
    return String(input)
      .split(/[\s,]+/)
      .map(function (token) {
        return token.trim();
      })
      .filter(Boolean);
  }

  function applyClassNames(element, classNames) {
    if (!element || !classNames) {
      return;
    }
    var parts = normalizeClassTokens(classNames);
    for (var i = 0; i < parts.length; i += 1) {
      var name = parts[i];
      if (!name) {
        continue;
      }
      if (element.classList && typeof element.classList.add === 'function') {
        element.classList.add(name);
      } else {
        var current = element.className || '';
        if ((' ' + current + ' ').indexOf(' ' + name + ' ') === -1) {
          element.className = current ? current + ' ' + name : name;
        }
      }
    }
  }

  function normalizeImageUrl(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }
    var trimmed = value.trim();
    if (trimmed === '') {
      return '';
    }
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    if (trimmed.indexOf('//') === 0) {
      return 'https:' + trimmed;
    }
    var sanitized = trimmed.replace(/^\/+/, '');
    var lowered = sanitized.toLowerCase();
    if (lowered.indexOf('cdn.myshoptet.com/') === 0) {
      return 'https://' + sanitized;
    }
    if (lowered.indexOf('usr/') === 0) {
      return SHOP_CDN_ORIGIN + '/' + sanitized;
    }
    if (lowered.indexOf('user/') === 0) {
      return SHOP_CDN_ORIGIN + '/' + SHOP_STORAGE_PREFIX + sanitized;
    }
    var prefixes = ['orig/', 'big/', 'medium/', 'small/', 'thumb/', 'thumbnail/'];
    for (var i = 0; i < prefixes.length; i += 1) {
      if (lowered.indexOf(prefixes[i]) === 0) {
        return SHOP_IMAGES_ROOT + sanitized;
      }
    }
    return SHOP_BIG_ROOT + sanitized;
  }

  function forEachNode(list, callback) {
    if (!list || typeof callback !== 'function') {
      return;
    }
    for (var index = 0; index < list.length; index += 1) {
      callback(list[index], index);
    }
  }

  function normalizeForComparison(value) {
    if (!value || typeof value !== 'string') {
      return '';
    }
    var normalized = value;
    if (typeof normalized.normalize === 'function') {
      normalized = normalized.normalize('NFD');
    }
    normalized = normalized.replace(/[\u0300-\u036f]/g, '');
    return normalized.toLowerCase();
  }

  function removeBrandPrefix(title, brand) {
    if (!title || typeof title !== 'string') {
      return title || '';
    }
    if (!brand || typeof brand !== 'string') {
      return title;
    }
    var cleanTitle = decodeEntities(title).trim();
    var cleanBrand = decodeEntities(brand).trim();
    if (cleanBrand === '') {
      return cleanTitle;
    }
    var normalizedBrand = normalizeForComparison(cleanBrand);
    var normalizedTitle = normalizeForComparison(cleanTitle);
    var escapedBrand = escapeRegExp(cleanBrand);
    if (escapedBrand) {
      var pattern = new RegExp('^\\s*' + escapedBrand, 'i');
      if (pattern.test(cleanTitle)) {
        var strippedDirect = cleanTitle.replace(pattern, '').replace(/^[\\s,;:-]+/, '').trim();
        if (strippedDirect !== '') {
          return strippedDirect;
        }
      }
    }
    if (normalizedBrand !== '' && normalizedTitle.indexOf(normalizedBrand) === 0) {
      var brandWords = normalizedBrand.split(' ').filter(Boolean);
      var titleWords = cleanTitle.split(/\s+/);
      if (brandWords.length > 0 && titleWords.length >= brandWords.length) {
        var remaining = titleWords.slice(brandWords.length).join(' ').trim();
        if (remaining !== '') {
          return remaining;
        }
      }
    }
    return cleanTitle;
  }

  function getAttr(element, attribute) {
    if (!element) {
      return '';
    }
    var value = element.getAttribute(attribute);
    return value === null ? '' : value;
  }

  function setText(element, value) {
    if (!element) {
      return;
    }
    element.textContent = value || '';
  }

  function safeString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function safeConsoleWarn(message, error) {
    if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
      console.warn(message, error);
    }
  }

  function escapeHtml(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/[&<>"']/g, function (character) {
      switch (character) {
        case '&':
          return '&amp;';
        case '<':
          return '&lt;';
        case '>':
          return '&gt;';
        case '"':
          return '&quot;';
        case "'":
          return '&#39;';
        default:
          return character;
      }
    });
  }

  function decodeEntities(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ');
  }

  function escapeRegExp(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildInspiredHtml(brand, title) {
    var brandText = safeString(decodeEntities(brand));
    var titleText = safeString(decodeEntities(title));
    var hasBrand = brandText !== '';
    var hasTitle = titleText !== '';
    var brandHtml = hasBrand ? '<span class="inspired-brand">' + escapeHtml(brandText) + '</span>' : '';
    var titleHtml = hasTitle ? '<span class="inspired-title">' + escapeHtml(titleText) + '</span>' : '';
    if (hasBrand && hasTitle) {
      return brandHtml + '<br>' + titleHtml;
    }
    if (hasBrand) {
      return brandHtml;
    }
    if (hasTitle) {
      return titleHtml;
    }
    return '';
  }

  function parsePercent(value) {
    if (value === null || value === undefined) {
      return null;
    }
    var stringValue = String(value).trim();
    if (stringValue === '') {
      return null;
    }
    var normalizedMatch = stringValue.replace(',', '.').match(/-?\d+(\.\d+)?/);
    if (!normalizedMatch) {
      return null;
    }
    var parsed = parseFloat(normalizedMatch[0]);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function throttle(fn, delay) {
    if (typeof fn !== 'function') {
      return function () {};
    }
    var timeoutId = null;
    var lastCall = 0;
    return function () {
      var now = Date.now();
      var remaining = delay - (now - lastCall);
      var context = this;
      var args = arguments;

      if (remaining <= 0) {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        lastCall = now;
        fn.apply(context, args);
      } else if (!timeoutId) {
        timeoutId = setTimeout(function () {
          timeoutId = null;
          lastCall = Date.now();
          fn.apply(context, args);
        }, remaining);
      }
    };
  }
})();
