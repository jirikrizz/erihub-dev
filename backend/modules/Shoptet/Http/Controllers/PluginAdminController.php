<?php

namespace Modules\Shoptet\Http\Controllers;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Modules\Pim\Models\ProductWidget;
use Modules\Pim\Services\ProductWidgetRenderer;
use Modules\Shoptet\Http\ShoptetClient;
use Modules\Shoptet\Models\Shop;
use Modules\Shoptet\Models\ShoptetPlugin;
use Modules\Shoptet\Models\ShoptetPluginVersion;

class PluginAdminController extends Controller
{
    private const ADVENT_TRANSLATIONS = [
        'cs' => [
            'card_label' => 'Adventní okénko',
            'window_label' => 'Okénko',
            'locked_prefix' => 'Otevřeme',
            'default_body' => 'Zůstaň naladěn, čeká tě překvapení.',
            'open_label' => 'Otevřít okénko',
            'opened_label' => 'Otevřeno',
            'copy_success' => 'Kód byl zkopírován!',
            'copy_error' => 'Kód se nepodařilo zkopírovat.',
        ],
        'sk' => [
            'card_label' => 'Adventné okienko',
            'window_label' => 'Okienko',
            'locked_prefix' => 'Otvoríme',
            'default_body' => 'Zostaň naladený, čaká ťa prekvapenie.',
            'open_label' => 'Otvoriť okienko',
            'opened_label' => 'Otvorené',
            'copy_success' => 'Kód bol skopírovaný!',
            'copy_error' => 'Kód sa nepodarilo skopírovať.',
        ],
        'ro' => [
            'card_label' => 'Fereastra de Advent',
            'window_label' => 'Fereastra',
            'locked_prefix' => 'Deschidem',
            'default_body' => 'Rămâi pe fază, te așteaptă o surpriză.',
            'open_label' => 'Deschide fereastra',
            'opened_label' => 'Deschis',
            'copy_success' => 'Codul a fost copiat!',
            'copy_error' => 'Codul nu a putut fi copiat.',
        ],
        'hu' => [
            'card_label' => 'Adventi ablak',
            'window_label' => 'Ablak',
            'locked_prefix' => 'Megnyitjuk',
            'default_body' => 'Maradj velünk, meglepetés vár rád.',
            'open_label' => 'Ablak megnyitása',
            'opened_label' => 'Megnyitva',
            'copy_success' => 'A kód másolva lett!',
            'copy_error' => 'A kód másolása nem sikerült.',
        ],
        'hr' => [
            'card_label' => 'Adventski prozorčić',
            'window_label' => 'Prozorčić',
            'locked_prefix' => 'Otvorimo',
            'default_body' => 'Ostani uz nas, čeka te iznenađenje.',
            'open_label' => 'Otvori prozorčić',
            'opened_label' => 'Otvoreno',
            'copy_success' => 'Kod je kopiran!',
            'copy_error' => 'Kod se nije uspio kopirati.',
        ],
        'en' => [
            'card_label' => 'Advent window',
            'window_label' => 'Window',
            'locked_prefix' => 'Opens',
            'default_body' => 'Stay tuned, a surprise awaits.',
            'open_label' => 'Open window',
            'opened_label' => 'Opened',
            'copy_success' => 'Code copied!',
            'copy_error' => 'Unable to copy code.',
        ],
    ];

    public function __construct(
        private readonly ShoptetClient $client,
        private readonly ProductWidgetRenderer $widgetRenderer
    )
    {
    }

    public function flags(Request $request)
    {
        $shopId = $request->integer('shop_id');

        if (! $shopId) {
            return response()->json(['flags' => []]);
        }

        $shop = Shop::findOrFail($shopId);

        try {
            $response = $this->client->listFlags($shop);
        } catch (\Throwable $exception) {
            Log::error('Shoptet flag fetch failed', [
                'shop_id' => $shop->id,
                'message' => $exception->getMessage(),
            ]);

            return response()->json([
                'flags' => [],
                'message' => 'Načtení štítků selhalo. Zkontroluj připojení Shoptetu.',
            ], 422);
        }

        $flags = collect(data_get($response, 'data.flags', []))
            ->filter(fn ($flag) => is_array($flag))
            ->map(function (array $flag) use ($shop) {
                $code = isset($flag['code']) ? trim((string) $flag['code']) : '';
                $title = isset($flag['title']) ? trim((string) $flag['title']) : $code;

                return [
                    'code' => $code !== '' ? $code : null,
                    'title' => $title !== '' ? $title : ($code !== '' ? $code : 'Štítek'),
                    'shop_id' => $shop->id,
                ];
            })
            ->values()
            ->sortBy(fn ($flag) => mb_strtolower($flag['title'], 'UTF-8'))
            ->values()
            ->all();

        return response()->json(['flags' => $flags]);
    }

    public function storeCountdown(Request $request)
    {
        $data = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'name' => ['required', 'string', 'max:160'],
            'flag_code' => ['nullable', 'string', 'max:120'],
            'flag_label' => ['nullable', 'string', 'max:190'],
            'message_template' => ['required', 'string', 'max:500'],
            'finished_text' => ['nullable', 'string', 'max:300'],
            'deadline' => ['required', 'date'],
            'timezone' => ['nullable', 'string', 'max:64'],
            'accent_color' => ['nullable', 'string', 'max:32'],
            'background_color' => ['nullable', 'string', 'max:32'],
            'text_color' => ['nullable', 'string', 'max:32'],
            'bundle_key' => ['nullable', 'string', 'max:64'],
            'plugin_id' => ['nullable', 'integer', 'exists:shoptet_plugins,id'],
        ]);

        $shop = Shop::findOrFail($data['shop_id']);
        $timezone = $data['timezone'] ?? $shop->timezone ?? config('app.timezone');
        $deadline = CarbonImmutable::parse($data['deadline'], $timezone ?? config('app.timezone'));
        $bundleKey = $this->normalizeBundleKey($data['bundle_key'] ?? null);

        $config = [
            'flag_code' => $data['flag_code'] ?? null,
            'flag_label' => $data['flag_label'] ?? null,
            'message_template' => $data['message_template'],
            'finished_text' => $data['finished_text'] ?? null,
            'deadline' => $deadline->toIso8601String(),
            'timezone' => $timezone,
            'accent_color' => $data['accent_color'] ?? null,
            'background_color' => $data['background_color'] ?? null,
            'text_color' => $data['text_color'] ?? null,
        ];

        [$plugin, $version] = DB::transaction(function () use ($shop, $data, $config, $bundleKey) {
            $plugin = $this->resolvePlugin($data['plugin_id'] ?? null, $shop, $data['name']);

            $nextVersion = (int) ($plugin->versions()->max('version') ?? 0) + 1;

                $version = $plugin->versions()->create([
                    'version' => $nextVersion,
                    'filename' => sprintf(
                        'countdown-%s-v%s.js',
                        Str::slug($data['flag_code'] ?? 'promo'),
                        $nextVersion
                    ),
                    'bundle_key' => $bundleKey,
                    'summary' => 'Plugin s odpočtem pro produkty se štítkem '.($data['flag_label'] ?? $data['flag_code'] ?? ''),
                'description' => 'Zobrazí zvýrazněný odpočet nad názvem produktu, pokud produkt nese vybraný štítek.',
                'code' => $this->buildCountdownScript($config),
                'installation_steps' => [
                    'Otevři administraci Shoptetu → Přizpůsobení → Vlastní JavaScript.',
                    'Klikni na „+ Přidat“, vlož nový soubor a vlož kód pluginu.',
                    'Ulož soubor a ověř, že se odpočet zobrazuje v detailu produktu se štítkem.',
                ],
                'testing_checklist' => [
                    'Produkt se zadaným štítkem zobrazuje hlášku s odpočtem.',
                    'Produkt bez štítku nezobrazuje žádnou změnu.',
                    'Odpočet se každou sekundu aktualizuje a po vypršení zobrazí finální text.',
                ],
                'dependencies' => [],
                'warnings' => [],
                'metadata' => [
                    'plugin_type' => 'countdown_admin',
                    'countdown' => $config,
                ],
            ]);

            return [$plugin, $version];
        });

        return response()->json([
            'plugin_id' => $plugin->id,
            'plugin_name' => $plugin->name,
            'shop_id' => $plugin->shop_id,
            'version' => $version->version,
            'version_id' => $version->id,
            'created_at' => optional($version->created_at)->toISOString(),
            'metadata' => $version->metadata,
        ], 201);
    }

    private function buildCountdownScript(array $config): string
    {
        $payload = json_encode([
            'flagCode' => $config['flag_code'] ?? null,
            'flagLabel' => $config['flag_label'] ?? null,
            'messageTemplate' => $config['message_template'] ?? '',
            'finishedText' => $config['finished_text'] ?? null,
            'deadline' => $config['deadline'] ?? null,
            'accentColor' => $config['accent_color'] ?? '#EA580C',
            'backgroundColor' => $config['background_color'] ?? '#FFF7ED',
            'textColor' => $config['text_color'] ?? '#111827',
            'targetSelector' => '.p-info-wrapper-box',
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return <<<JS
(function(){
  var config = {$payload};
  if (!config || !config.deadline) { return; }
  var bannerId = 'kv-countdown-' + Math.random().toString(36).slice(2);
  var normalizedCode = (config.flagCode || '').toString().trim().toLowerCase();
  var normalizedLabel = (config.flagLabel || '').toString().trim().toLowerCase();

  function normalize(value) {
    return (value || '').toString().trim().toLowerCase();
  }

  function hasFlagInDom() {
    var selectors = [
      '.p-detail-info .flags .flag',
      '.p-detail-info .flags span',
      '[data-flag-code]',
      '[data-flag]',
      '.p-labels span',
      '.product-flag',
      '.label-flag',
      '.p-flag'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var nodes = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < nodes.length; j++) {
        var node = nodes[j];
        var code = node.getAttribute && (node.getAttribute('data-flag-code') || node.getAttribute('data-flag'));
        if (code && normalizedCode && normalize(code) === normalizedCode) {
          return true;
        }
        var text = normalize(node.textContent || '');
        if (normalizedLabel && text && text.indexOf(normalizedLabel) !== -1) {
          return true;
        }
      }
    }
    return false;
  }

  function hasFlagInDataLayer() {
    var layers = window.dataLayer;
    if (!Array.isArray(layers)) { return false; }
    for (var i = 0; i < layers.length; i++) {
      var entry = layers[i] || {};
      var product = entry.shoptet && entry.shoptet.product;
      var flags = product && product.flags;
      if (!Array.isArray(flags)) { continue; }
      for (var j = 0; j < flags.length; j++) {
        var flag = flags[j] || {};
        var code = normalize(flag.code || '');
        var title = normalize(flag.name || flag.title || '');
        if (normalizedCode && code && code === normalizedCode) {
          return true;
        }
        if (normalizedLabel && title && title.indexOf(normalizedLabel) !== -1) {
          return true;
        }
      }
    }
    return false;
  }

  function productHasFlag() {
    if (!normalizedCode && !normalizedLabel) {
      return true;
    }
    return hasFlagInDom() || hasFlagInDataLayer();
  }

  function ensureStyles() {
    if (document.getElementById(bannerId + '-styles')) { return; }
    var style = document.createElement('style');
    style.id = bannerId + '-styles';
    style.textContent =
      '#' + bannerId + '{border-radius:8px;padding:12px 16px;margin-bottom:12px;background:' + (config.backgroundColor || '#FFF7ED') + ';color:' + (config.textColor || '#111827') + ';font-weight:600;font-size:15px;display:flex;align-items:center;gap:8px;box-shadow:0 10px 20px rgba(0,0,0,0.08);}' +
      '#' + bannerId + ' .kv-countdown__dot{width:10px;height:10px;border-radius:999px;background:' + (config.accentColor || '#EA580C') + ';display:inline-block;flex-shrink:0;}';
    document.head.appendChild(style);
  }

  function formatCountdown(diff) {
    var totalSeconds = Math.max(0, Math.floor(diff / 1000));
    var days = Math.floor(totalSeconds / 86400);
    var hours = Math.floor((totalSeconds % 86400) / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    var parts = [];
    if (days > 0) { parts.push(days + 'd'); }
    parts.push((hours < 10 && days > 0 ? '0' : '') + hours + 'h');
    parts.push((minutes < 10 ? '0' : '') + minutes + 'm');
    parts.push((seconds < 10 ? '0' : '') + seconds + 's');
    return parts.join(' ');
  }

  function renderText(template, countdownValue) {
    if (!template) {
      return countdownValue;
    }
    if (template.indexOf('{{countdown}}') !== -1) {
      return template.replace('{{countdown}}', countdownValue);
    }
    return (template + ' ' + countdownValue).trim();
  }

  function mountBanner() {
    if (!productHasFlag()) {
      return;
    }

    var host = document.querySelector(config.targetSelector || '.p-info-wrapper-box');
    if (!host || document.getElementById(bannerId)) {
      return;
    }

    ensureStyles();

    var container = document.createElement('div');
    container.id = bannerId;

    var dot = document.createElement('span');
    dot.className = 'kv-countdown__dot';
    container.appendChild(dot);

    var text = document.createElement('span');
    text.className = 'kv-countdown__text';
    container.appendChild(text);

    host.insertBefore(container, host.firstChild || null);

    var targetTime = Date.parse(config.deadline);
    if (!targetTime || isNaN(targetTime)) {
      text.textContent = renderText(config.messageTemplate, '');
      return;
    }

    function update() {
      var now = Date.now();
      var diff = targetTime - now;
      if (diff <= 0) {
        text.textContent = config.finishedText || renderText(config.messageTemplate, '0s');
        clearInterval(timer);
        return;
      }
      text.textContent = renderText(config.messageTemplate, formatCountdown(diff));
    }

    var timer = setInterval(update, 1000);
    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountBanner);
  } else {
    mountBanner();
  }
})();
JS;
    }

    private function buildAutoWidgetScript(array $config): string
    {
        $payload = json_encode([
            'widgetScript' => $config['widget_script_url'] ?? null,
            'widgetToken' => $config['widget_token'] ?? null,
            'widgetId' => $config['widget_id'] ?? null,
            'containerId' => $config['container_id'] ?? null,
            'containerClass' => $config['container_class'] ?? null,
            'pageTargets' => $config['page_targets'] ?? [],
            'selector' => $config['selector'] ?? null,
            'placement' => $config['placement'] ?? 'append',
            'maxAttempts' => $config['max_attempts'] ?? 60,
            'pollInterval' => $config['poll_interval_ms'] ?? 500,
            'instanceId' => $config['instance_id'] ?? ('kv-auto-'.$config['widget_token'] ?? ''),
            'dataSource' => $config['data_source'] ?? 'widget',
            'recommendationEndpoint' => $config['recommendation_endpoint'] ?? null,
            'recommendationLimit' => $config['recommendation_limit'] ?? null,
            'recommendationMode' => $config['recommendation_mode'] ?? null,
            'heading' => $config['heading'] ?? null,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return <<<JS
(function(){
  var config = {$payload};
  if (!config || !config.containerId || !config.selector) { return; }
  var dataSource = (config.dataSource || 'widget').toString().toLowerCase();
  if (dataSource === 'widget' && !config.widgetScript) { return; }
  var isInventoryFeed = dataSource === 'inventory_recommendations' || dataSource === 'inventory_similarity';
  if (isInventoryFeed && (!config.widgetId || !config.recommendationEndpoint)) { return; }
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

  function applyHeading(container) {
    if (!container) { return; }
    var headingId = container.id + '-heading';
    var existing = document.getElementById(headingId);
    var innerExisting = container.querySelector && container.querySelector('.kv-widget-heading');
    if (!config.heading) {
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
      if (innerExisting && innerExisting.parentNode) {
        innerExisting.parentNode.removeChild(innerExisting);
      }
      return;
    }
    var target = innerExisting || existing;
    if (!target) {
      target = document.createElement('h3');
      target.id = headingId;
    }
    target.textContent = config.heading;
    target.className = 'kv-widget-heading';
    if (target.parentNode !== container) {
      if (target.parentNode && target.parentNode !== container) {
        target.parentNode.removeChild(target);
      }
      container.insertBefore(target, container.firstChild || null);
    }
    if (existing && existing !== target && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    observeHeading(container);
  }

  function observeHeading(container) {
    if (!config.heading || !container || typeof MutationObserver !== 'function') {
      return;
    }
    if (container.getAttribute('data-kv-heading-watcher') === '1') {
      return;
    }
    var update = function (target) {
      if (!config.heading || !target) {
        return false;
      }
      var found = target.querySelector('.kv-widget-heading');
      if (found) {
        found.textContent = config.heading;
        found.className = 'kv-widget-heading';
        return true;
      }
      return false;
    };
    if (update(container)) {
      return;
    }
    try {
      var observer = new MutationObserver(function () {
        if (update(container)) {
          observer.disconnect();
        }
      });
      observer.observe(container, { childList: true, subtree: true });
      container.setAttribute('data-kv-heading-watcher', '1');
    } catch (e) {
    }
  }

  function ensureContainer(target) {
    if (!target) { return null; }
    var existing = document.getElementById(config.containerId);
    if (existing) {
      existing.setAttribute('data-kv-widget', config.widgetToken || '');
      applyClasses(existing);
      applyHeading(existing);
      return existing;
    }
    var container = document.createElement('div');
    container.id = config.containerId;
    container.setAttribute('data-kv-widget', config.widgetToken || '');
    applyClasses(container);
    applyHeading(container);
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
      ['currency', currency],
      ['mode', config.recommendationMode]
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
      var refreshed = document.getElementById(container.id || (config && config.containerId));
      if (refreshed) {
        applyHeading(refreshed);
        observeHeading(refreshed);
      }
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
    if (isInventoryFeed) {
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
JS;
    }

    public function storeSnowfall(Request $request)
    {
        $data = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'name' => ['required', 'string', 'max:160'],
            'category_paths' => ['required', 'array', 'min:1'],
            'category_paths.*' => ['nullable', 'string', 'max:255'],
            'bundle_key' => ['nullable', 'string', 'max:64'],
            'flake_color' => ['nullable', 'string', 'max:32'],
            'flake_count' => ['nullable', 'integer', 'min:20', 'max:400'],
            'flake_count_desktop' => ['nullable', 'integer', 'min:20', 'max:400'],
            'flake_count_mobile' => ['nullable', 'integer', 'min:20', 'max:400'],
            'min_size' => ['nullable', 'numeric', 'min:1', 'max:10'],
            'max_size' => ['nullable', 'numeric', 'min:2', 'max:20'],
            'fall_speed' => ['nullable', 'numeric', 'min:0.5', 'max:3'],
            'sway' => ['nullable', 'numeric', 'min:0.1', 'max:2'],
            'twinkle' => ['sometimes', 'boolean'],
            'plugin_id' => ['nullable', 'integer', 'exists:shoptet_plugins,id'],
        ]);

        $shop = Shop::findOrFail($data['shop_id']);
        $bundleKey = $this->normalizeBundleKey($data['bundle_key'] ?? null);
        $categoryPaths = collect($data['category_paths'] ?? [])
            ->map(fn ($path) => $this->normalizeCategoryPath($path))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if ($categoryPaths === []) {
            return response()->json([
                'message' => 'Zadej alespoň jednu kategorii, kde se má efekt zobrazit.',
            ], 422);
        }

        $clampFlakeCount = static function ($value, int $fallback): int {
            $candidate = $value !== null ? (int) $value : $fallback;
            return (int) max(20, min(400, $candidate));
        };

        $defaultFlakeCount = $clampFlakeCount($data['flake_count'] ?? null, 90);
        $desktopFlakeCount = $clampFlakeCount($data['flake_count_desktop'] ?? null, $defaultFlakeCount);
        $mobileFlakeCount = $clampFlakeCount($data['flake_count_mobile'] ?? null, $desktopFlakeCount);

        $config = [
            'category_paths' => $categoryPaths,
            'flake_color' => $data['flake_color'] ?? '#FFFFFF',
            'flake_count' => $defaultFlakeCount,
            'flake_count_desktop' => $desktopFlakeCount,
            'flake_count_mobile' => $mobileFlakeCount,
            'min_size' => $data['min_size'] ?? 2,
            'max_size' => $data['max_size'] ?? 6,
            'fall_speed' => $data['fall_speed'] ?? 1.2,
            'sway' => $data['sway'] ?? 0.6,
            'twinkle' => array_key_exists('twinkle', $data) ? (bool) $data['twinkle'] : true,
        ];

        if ($config['min_size'] > $config['max_size']) {
            [$config['min_size'], $config['max_size']] = [$config['max_size'], $config['min_size']];
        }

        [$plugin, $version] = DB::transaction(function () use ($shop, $data, $config, $bundleKey) {
            $plugin = $this->resolvePlugin($data['plugin_id'] ?? null, $shop, $data['name']);

            $nextVersion = (int) ($plugin->versions()->max('version') ?? 0) + 1;

            $version = $plugin->versions()->create([
                'version' => $nextVersion,
                'filename' => sprintf('snowfall-%s-v%s.js', $shop->id, $nextVersion),
                'bundle_key' => $bundleKey,
                'summary' => 'Sněhový efekt pro vybrané kategorie',
                'description' => 'Vloží jemný sněhový efekt na určené kategorie a automaticky se vypne na ostatních stránkách.',
                'code' => $this->buildSnowfallScript($config),
                'installation_steps' => [
                    'Zkopíruj veřejnou URL souboru pluginů pro daný e-shop.',
                    'Vlož ji v Shoptetu do Nastavení → Editor → Vlastní JavaScript.',
                    'Ověř, že se na určených kategoriích zobrazuje animace sněhu.',
                ],
                'testing_checklist' => [
                    'Efekt se zobrazuje pouze na zadaných kategoriích.',
                    'Kvalita animace neblokuje posouvání stránky.',
                    'Na jiných stránkách se skript nespouští.',
                ],
                'dependencies' => [],
                'warnings' => [],
                'metadata' => [
                    'plugin_type' => 'snowfall_admin',
                    'snowfall' => $config,
                ],
            ]);

            return [$plugin, $version];
        });

        return response()->json([
            'plugin_id' => $plugin->id,
            'plugin_name' => $plugin->name,
            'shop_id' => $plugin->shop_id,
            'version' => $version->version,
            'version_id' => $version->id,
            'created_at' => optional($version->created_at)->toISOString(),
            'metadata' => $version->metadata,
        ], 201);
    }

    public function storeAdventCalendar(Request $request)
    {
        $data = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'name' => ['required', 'string', 'max:160'],
            'bundle_key' => ['nullable', 'string', 'max:64'],
            'start_date' => ['required', 'date'],
            'timezone' => ['nullable', 'string', 'max:64'],
            'enable_snowfall' => ['sometimes', 'boolean'],
            'show_countdown' => ['sometimes', 'boolean'],
            'decor_variant' => ['nullable', 'string', Rule::in(['classic', 'gingerbread', 'frost'])],
            'card_label' => ['nullable', 'string', 'max:80'],
            'countdown_prefix' => ['nullable', 'string', 'max:160'],
            'countdown_complete' => ['nullable', 'string', 'max:160'],
            'overview_targets' => ['nullable', 'array', 'min:1'],
            'overview_targets.*' => ['required', 'string', 'max:255'],
            'days' => ['required', 'array', 'min:1', 'max:24'],
            'days.*.day' => ['required', 'integer', 'min:1', 'max:24'],
            'days.*.title' => ['nullable', 'string', 'max:160'],
            'days.*.targets' => ['required', 'array', 'min:1'],
            'days.*.targets.*' => ['required', 'string', 'max:255'],
            'days.*.html' => ['required', 'string', 'max:8000'],
            'plugin_id' => ['nullable', 'integer', 'exists:shoptet_plugins,id'],
        ]);

        $shop = Shop::findOrFail($data['shop_id']);
        $bundleKey = $this->normalizeBundleKey($data['bundle_key'] ?? null);
        $timezone = $data['timezone'] ?: ($shop->timezone ?? config('app.timezone'));
        $shopLocale = $shop->locale ?? $shop->default_locale ?? config('app.locale');
        $startDate = CarbonImmutable::parse($data['start_date'], $timezone ?? config('app.timezone'))->startOfDay();

        $days = collect($data['days'])
            ->map(function (array $entry) use ($startDate, $timezone) {
                $dayNumber = (int) ($entry['day'] ?? 0);
                $html = isset($entry['html']) ? trim((string) $entry['html']) : '';
                $targets = collect($entry['targets'] ?? [])
                    ->map(fn ($path) => $this->normalizeCategoryPath($path))
                    ->filter()
                    ->values()
                    ->all();

                if ($dayNumber < 1 || $dayNumber > 24) {
                    return null;
                }

                if ($html === '' || $targets === []) {
                    return null;
                }

                $safeHtml = str_ireplace('</script', '<\/script', $html);

                $dayDate = $startDate->addDays($dayNumber - 1);

                return [
                    'day' => $dayNumber,
                    'title' => isset($entry['title']) ? trim((string) $entry['title']) : null,
                    'targets' => $targets,
                    'html' => $safeHtml,
                    'start_at' => $dayDate->toIso8601String(),
                    'end_at' => $dayDate->addDay()->toIso8601String(),
                ];
            })
            ->filter()
            ->values()
            ->all();

        if ($days === []) {
            return response()->json([
                'message' => 'Vyplň alespoň jeden den kalendáře se stránkou a obsahem.',
            ], 422);
        }

        $overviewTargets = collect($data['overview_targets'] ?? [])
            ->map(fn ($path) => $this->normalizeCategoryPath($path))
            ->filter()
            ->unique()
            ->values()
            ->all();

        $decorVariant = $data['decor_variant'] ?? 'classic';
        $enableSnowfall = array_key_exists('enable_snowfall', $data) ? (bool) $data['enable_snowfall'] : false;
        $showCountdown = array_key_exists('show_countdown', $data) ? (bool) $data['show_countdown'] : false;
        $cardLabel = $data['card_label'] ?? 'Adventní okénko';
        $countdownPrefix = $data['countdown_prefix'] ?? 'Další překvapení za';
        $countdownComplete = $data['countdown_complete'] ?? 'Další okénko je připraveno!';

        [$plugin, $version] = DB::transaction(function () use ($shop, $data, $bundleKey, $days, $timezone, $startDate, $decorVariant, $enableSnowfall, $showCountdown, $cardLabel, $countdownPrefix, $countdownComplete, $overviewTargets, $shopLocale) {
            $plugin = $this->resolvePlugin($data['plugin_id'] ?? null, $shop, $data['name']);

            $nextVersion = (int) ($plugin->versions()->max('version') ?? 0) + 1;

            $version = $plugin->versions()->create([
                'version' => $nextVersion,
                'filename' => sprintf('advent-calendar-%s-v%s.js', $shop->id, $nextVersion),
                'bundle_key' => $bundleKey,
                'summary' => 'Adventní kalendář s denní odměnou',
                'description' => 'Zobrazí vlastní HTML obsah pro každý adventní den na určených kategoriích nebo produktech.',
                'code' => $this->buildAdventCalendarScript([
                    'days' => $days,
                    'timezone' => $timezone,
                    'start_date' => $startDate->toIso8601String(),
                    'decor_variant' => $decorVariant,
                    'enable_snowfall' => $enableSnowfall,
                    'show_countdown' => $showCountdown,
                    'card_label' => $cardLabel,
                    'countdown_prefix' => $countdownPrefix,
                    'countdown_complete' => $countdownComplete,
                    'overview_targets' => $overviewTargets,
                    'shop_locale' => $shopLocale,
                ]),
                'installation_steps' => [
                    'Zkontroluj, že všechny cílové URL odpovídají kategoriím nebo produktům.',
                    'Zkopíruj veřejnou URL souboru pluginů pro daný e-shop a vlož ji v Shoptetu.',
                    'Ověř během každého dne, že se kalendář zobrazuje jen na vybraných stránkách.',
                ],
                'testing_checklist' => [
                    'Aktuální den se zobrazuje jen na stránkách uvedených v konfiguraci.',
                    'HTML obsah je vložen na začátek #content-wrapper.',
                    'Po půlnoci se automaticky aktivuje další den.',
                ],
                'dependencies' => [],
                'warnings' => [],
                'metadata' => [
                    'plugin_type' => 'advent_calendar_admin',
                    'advent_calendar' => [
                        'days_count' => count($days),
                        'timezone' => $timezone,
                        'start_date' => $startDate->toIso8601String(),
                        'decor_variant' => $decorVariant,
                        'enable_snowfall' => $enableSnowfall,
                        'show_countdown' => $showCountdown,
                        'card_label' => $cardLabel,
                        'countdown_prefix' => $countdownPrefix,
                        'countdown_complete' => $countdownComplete,
                        'overview_targets' => $overviewTargets,
                        'shop_locale' => $shopLocale,
                        'days' => $days,
                    ],
                ],
            ]);

            return [$plugin, $version];
        });

        return response()->json([
            'plugin_id' => $plugin->id,
            'plugin_name' => $plugin->name,
            'shop_id' => $plugin->shop_id,
            'version' => $version->version,
            'version_id' => $version->id,
            'created_at' => optional($version->created_at)->toISOString(),
            'metadata' => $version->metadata,
        ], 201);
    }

    public function storeAutoWidget(Request $request)
    {
        $data = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'name' => ['required', 'string', 'max:160'],
            'widget_id' => ['required', 'uuid', 'exists:product_widgets,id'],
            'page_targets' => ['required', 'array', 'min:1'],
            'page_targets.*' => ['required', 'string', Rule::in(['homepage', 'category', 'productDetail', 'cart'])],
            'selector' => ['required', 'string', 'max:255'],
            'placement' => ['required', 'string', Rule::in(['before', 'after', 'prepend', 'append'])],
            'bundle_key' => ['nullable', 'string', 'max:64'],
            'max_attempts' => ['nullable', 'integer', 'min:1', 'max:200'],
            'poll_interval_ms' => ['nullable', 'integer', 'min:100', 'max:5000'],
            'data_source' => ['nullable', 'string', Rule::in(['widget', 'inventory_recommendations', 'inventory_similarity'])],
            'recommendation_limit' => ['nullable', 'integer', 'min:1', 'max:12'],
            'recommendation_mode' => ['nullable', 'string', Rule::in(['fragrance', 'nonfragrance', 'product'])],
            'plugin_id' => ['nullable', 'integer', 'exists:shoptet_plugins,id'],
            'heading' => ['nullable', 'string', 'max:160'],
            'container_id' => ['nullable', 'string', 'max:190'],
        ]);

        $shop = Shop::findOrFail($data['shop_id']);
        $widget = ProductWidget::query()->with('items')->findOrFail($data['widget_id']);

        if ($widget->status !== 'published') {
            return response()->json([
                'message' => 'Vyber publikovaný widget z Produkty → Widgety.',
            ], 422);
        }

        $pageTargets = collect($data['page_targets'] ?? [])
            ->map(fn ($target) => trim((string) $target))
            ->filter()
            ->unique()
            ->values()
            ->all();

        if ($pageTargets === []) {
            return response()->json([
                'message' => 'Zadej alespoň jeden typ stránky, kde se má widget zobrazit.',
            ], 422);
        }

        $selector = trim((string) ($data['selector'] ?? ''));
        if ($selector === '') {
            return response()->json([
                'message' => 'Vyplň CSS selektor, do kterého se má widget vložit.',
            ], 422);
        }

        $bundleKey = $this->normalizeBundleKey($data['bundle_key'] ?? null);
        $render = $this->widgetRenderer->render($widget);
        $maxAttempts = isset($data['max_attempts']) ? max(1, min(200, (int) $data['max_attempts'])) : 60;
        $pollInterval = isset($data['poll_interval_ms']) ? max(100, min(5000, (int) $data['poll_interval_ms'])) : 500;
        $dataSource = $data['data_source'] ?? 'widget';
        $recommendationLimit = isset($data['recommendation_limit'])
            ? max(1, min(12, (int) $data['recommendation_limit']))
            : 6;
        $recommendationMode = $data['recommendation_mode'] ?? null;
        $heading = isset($data['heading']) ? trim((string) $data['heading']) : '';
        $containerIdOverride = isset($data['container_id']) ? trim((string) $data['container_id']) : '';

        $defaultContainerId = $containerIdOverride !== ''
            ? $containerIdOverride
            : (data_get($render, 'settings.container_id') ?: 'kv-widget-'.Str::lower($widget->public_token));

        if ($dataSource === 'inventory_similarity' && $containerIdOverride === '') {
            $defaultContainerId = 'reco-product-similar-erihub';
        }

        $instanceSuffix = $dataSource === 'inventory_similarity' ? 'similarity' : ($dataSource === 'inventory_recommendations' ? 'inspiration' : 'static');

        $config = [
            'widget_id' => $widget->id,
            'widget_name' => $widget->name,
            'widget_token' => $widget->public_token,
            'widget_script_url' => secure_url(sprintf('/widgets/%s.js', $widget->public_token)),
            'container_id' => $defaultContainerId,
            'container_class' => data_get($render, 'settings.container_class') ?: 'products products-block kv-widget-block',
            'page_targets' => $pageTargets,
            'selector' => $selector,
            'placement' => $data['placement'],
            'max_attempts' => $maxAttempts,
            'poll_interval_ms' => $pollInterval,
            'bundle_key' => $bundleKey,
            'bundle_url' => secure_url(sprintf('/plugins/public/%s.js', $shop->id), ['bundle' => $bundleKey]),
            'instance_id' => sprintf('kv-auto-%s-%s-%s', $widget->public_token, $shop->id, $instanceSuffix),
            'shop_id' => $shop->id,
            'data_source' => $dataSource,
            'recommendation_limit' => $recommendationLimit,
            'recommendation_mode' => $recommendationMode,
            'heading' => $heading !== '' ? $heading : null,
        ];

        if (in_array($dataSource, ['inventory_recommendations', 'inventory_similarity'], true)) {
            $config['recommendation_endpoint'] = secure_url('widgets/inventory/recommendations.js');
            if ($dataSource === 'inventory_similarity') {
                $config['recommendation_mode'] = 'similarity';
            }
        }

        $targetLabels = array_map(function (string $target): string {
            return match (strtolower($target)) {
                'homepage' => 'homepage',
                'category' => 'kategorie',
                'productdetail' => 'detail produktu',
                'cart' => 'košík',
                default => $target,
            };
        }, $pageTargets);

        $placementLabels = [
            'before' => 'před vybraný prvek',
            'after' => 'za vybraný prvek',
            'prepend' => 'na začátek prvku',
            'append' => 'na konec prvku',
        ];

        $summary = sprintf('Automatický widget „%s“ pro %s', $widget->name, implode(', ', $targetLabels));
        $description = sprintf(
            'Skript sleduje pageType v dataLayeru a jakmile se návštěvník nachází na vybraných stránkách, vloží widget do selektoru „%s“ (%s).',
            $selector,
            $placementLabels[$data['placement']] ?? 'na pozici podle selektoru'
        );

        [$plugin, $version] = DB::transaction(function () use ($shop, $data, $bundleKey, $config, $summary, $description, $targetLabels) {
            $plugin = $this->resolvePlugin($data['plugin_id'] ?? null, $shop, $data['name']);

            $nextVersion = (int) ($plugin->versions()->max('version') ?? 0) + 1;

            $version = $plugin->versions()->create([
                'version' => $nextVersion,
                'filename' => sprintf('auto-widget-%s-v%s.js', $shop->id, $nextVersion),
                'bundle_key' => $bundleKey,
                'summary' => $summary,
                'description' => $description,
                'code' => $this->buildAutoWidgetScript($config),
                'installation_steps' => [
                    'Otevři Shoptet → Nastavení → Editor → Vlastní JavaScript.',
                    'Přidej nebo aktualizuj veřejný bundle soubor a vlož do něj vygenerovaný kód.',
                    sprintf('Navštiv jednu z vybraných stránek (např. %s) a ověř vložení widgetu k selektoru %s.', implode(', ', $targetLabels), $config['selector']),
                ],
                'testing_checklist' => [
                    'Widget se zobrazuje pouze na vybraných stránkách.',
                    'Obsah odpovídá widgetu z administrace (Produkty → Widgety).',
                    sprintf('Selektor %s je dostupný ve všech šablonách, kde se má widget zobrazit.', $config['selector']),
                ],
                'dependencies' => [],
                'warnings' => [],
                'metadata' => [
                    'plugin_type' => 'auto_widget_admin',
                    'auto_widget' => $config,
                ],
            ]);

            return [$plugin, $version];
        });

        return response()->json([
            'plugin_id' => $plugin->id,
            'plugin_name' => $plugin->name,
            'shop_id' => $plugin->shop_id,
            'version' => $version->version,
            'version_id' => $version->id,
            'created_at' => optional($version->created_at)->toISOString(),
            'metadata' => $version->metadata,
        ], 201);
    }

    private function buildSnowfallScript(array $config): string
    {
        $payload = json_encode([
            'categoryPaths' => $config['category_paths'] ?? [],
            'flakeColor' => $config['flake_color'] ?? '#FFFFFF',
            'flakeCount' => $config['flake_count'] ?? 90,
            'flakeCountDesktop' => $config['flake_count_desktop'] ?? null,
            'flakeCountMobile' => $config['flake_count_mobile'] ?? null,
            'minSize' => $config['min_size'] ?? 2,
            'maxSize' => $config['max_size'] ?? 6,
            'fallSpeed' => $config['fall_speed'] ?? 1.2,
            'sway' => $config['sway'] ?? 0.6,
            'twinkle' => (bool) ($config['twinkle'] ?? true),
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return <<<JS
(function(){
  var config = {$payload};
  if (!config || !Array.isArray(config.categoryPaths) || config.categoryPaths.length === 0) { return; }

  function normalizePath(value) {
    if (!value) { return null; }
    var normalized = value.toString().trim().toLowerCase();
    if (normalized === '') { return null; }
    if (normalized.charAt(0) !== '/') { normalized = '/' + normalized; }
    if (normalized.length > 1 && normalized.endsWith('/')) { normalized = normalized.slice(0, -1); }
    return normalized;
  }

  var allowedPaths = config.categoryPaths
    .map(normalizePath)
    .filter(function (value, index, array) {
      return value && array.indexOf(value) === index;
    });

  if (allowedPaths.length === 0) { return; }

  var currentPath = normalizePath(window.location.pathname) || '/';
  var matchesCategory = allowedPaths.some(function (path) {
    if (!path) { return false; }
    if (path === '/') { return currentPath === '/'; }
    return currentPath === path || currentPath.indexOf(path + '/') === 0;
  });

  if (!matchesCategory) { return; }

  if (document.querySelector('[data-kv-snowfall="active"]')) {
    return;
  }

  var canvas = document.createElement('canvas');
  canvas.setAttribute('data-kv-snowfall', 'active');
  canvas.style.position = 'fixed';
  canvas.style.pointerEvents = 'none';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '2147483646';
  canvas.style.opacity = '0.95';

  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d');
  if (!ctx) { return; }

  var width = window.innerWidth;
  var height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;

  function clampCount(value, fallback) {
    var parsed = Number(value);
    if (!isFinite(parsed) || parsed <= 0) {
      var fallbackNumber = Number(fallback);
      parsed = isFinite(fallbackNumber) && fallbackNumber > 0 ? fallbackNumber : 90;
    }
    return Math.max(20, Math.min(400, Math.round(parsed)));
  }

  function isMobileViewport() {
    if (typeof window.matchMedia === 'function') {
      try {
        return window.matchMedia('(max-width: 767px)').matches;
      } catch (e) {}
    }
    return window.innerWidth <= 767;
  }

  function targetFlakeCount() {
    return isMobileViewport() ? mobileFlakeCount : desktopFlakeCount;
  }

  var flakes = [];
  var defaultFlakeCount = clampCount(config.flakeCount, 90);
  var desktopFlakeCount = clampCount(config.flakeCountDesktop, defaultFlakeCount);
  var mobileFlakeCount = clampCount(config.flakeCountMobile, desktopFlakeCount);
  var currentTargetCount = 0;
  var minSize = Math.max(1, Math.min(10, config.minSize || 2));
  var maxSize = Math.max(minSize + 1, Math.min(20, config.maxSize || 6));
  var speed = Math.max(0.5, Math.min(3, config.fallSpeed || 1.2));
  var sway = Math.max(0.1, Math.min(2, config.sway || 0.6));

  var color = config.flakeColor || '#FFFFFF';
  var twinkle = Boolean(config.twinkle);

  function createFlake() {
    return {
      x: Math.random() * width,
      y: Math.random() * -height,
      radius: Math.random() * (maxSize - minSize) + minSize,
      velocityY: Math.random() * speed + speed,
      drift: (Math.random() * sway) - (sway / 2),
      opacity: twinkle ? (Math.random() * 0.6 + 0.2) : 0.8,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function syncFlakeAmount(target) {
    target = Math.max(20, Math.min(400, target));
    if (target > flakes.length) {
      var toAdd = target - flakes.length;
      for (var i = 0; i < toAdd; i++) {
        flakes.push(createFlake());
      }
    } else if (target < flakes.length) {
      flakes.splice(target);
    }
    currentTargetCount = target;
  }

  syncFlakeAmount(targetFlakeCount());

  function handleResize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    var desired = targetFlakeCount();
    if (desired !== currentTargetCount) {
      syncFlakeAmount(desired);
    }
  }

  window.addEventListener('resize', handleResize);

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = color;

    for (var i = 0; i < flakes.length; i++) {
      var flake = flakes[i];
      ctx.globalAlpha = twinkle ? Math.abs(Math.sin(flake.phase)) * flake.opacity : flake.opacity;
      ctx.save();
      ctx.shadowColor = 'rgba(17, 24, 39, 0.35)';
      ctx.shadowBlur = flake.radius * 0.8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = flake.radius * 0.4;
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      flake.y += flake.velocityY;
      flake.x += flake.drift + Math.sin(flake.phase) * sway;
      flake.phase += 0.01;

      if (flake.y > height + 5) {
        flakes[i] = createFlake();
        flakes[i].y = -10;
      }

      if (flake.x > width + 5) {
        flake.x = -5;
      } else if (flake.x < -5) {
        flake.x = width + 5;
      }
    }

    requestAnimationFrame(draw);
  }

  draw();
})();
JS;
    }

    private function buildAdventCalendarScript(array $config): string
    {
        $snowWaveUrl = asset('plugins/advent/snow-waves.svg');
        $lightsUrl = asset('plugins/advent/lights.svg');

        $payload = json_encode([
            'days' => $config['days'] ?? [],
            'decorVariant' => $config['decor_variant'] ?? 'classic',
            'enableSnowfall' => (bool) ($config['enable_snowfall'] ?? false),
            'showCountdown' => (bool) ($config['show_countdown'] ?? false),
            'cardLabel' => $config['card_label'] ?? 'Adventní okénko',
            'countdownPrefix' => $config['countdown_prefix'] ?? 'Další překvapení za',
            'countdownComplete' => $config['countdown_complete'] ?? 'Další okénko je připraveno!',
            'snowWaveUrl' => $snowWaveUrl,
            'lightsUrl' => $lightsUrl,
            'overviewTargets' => $config['overview_targets'] ?? [],
            'shopLocale' => $config['shop_locale'] ?? null,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

        return <<<JS
(function(){
  var config = {$payload};
  if (!config || !Array.isArray(config.days) || config.days.length === 0) { return; }

  var decorVariant = (config.decorVariant || 'classic').toString().trim().toLowerCase();
  var cardLabel = (config.cardLabel || 'Adventní okénko').toString();
  var countdownPrefix = (config.countdownPrefix || 'Další překvapení za').toString();
  var countdownComplete = (config.countdownComplete || 'Další okénko je připraveno!').toString();
  var snowWaveUrl = (config.snowWaveUrl || '').toString();
  var lightsUrl = (config.lightsUrl || '').toString();
  var overviewTargets = Array.isArray(config.overviewTargets) ? config.overviewTargets : [];
  var localeCandidateRaw = (config.shopLocale || document.documentElement.lang || navigator.language || '').toString().trim();
  var localeCandidate = localeCandidateRaw.replace(/_/g, '-').toLowerCase();
  var localeKey = localeCandidate.split('-')[0] || 'cs';
  if (!localeKey) { localeKey = 'cs'; }

  var translations = {
    cs: {
      localeTag: 'cs-CZ',
      gridTitle: 'Adventní kalendář',
      gridSubtitle: 'Všechna okénka máte na jednom místě. Nová se odemknou automaticky ve stanovený čas.',
      windowLabel: 'Okénko',
      lockedPrefix: 'Otevřeme',
      defaultBody: 'Zůstaň naladěn, čeká tě překvapení.',
      metaPrefix: 'Aktivní od',
      linkLabel: 'Přejít na stránku',
      openLabel: 'Otevřít okénko',
      coverHint: 'Odtáhni nebo klikni pro otevření',
      openedLabel: 'Otevřeno',
      defaultCardLabel: 'Adventní okénko',
      countdownPrefix: 'Další překvapení za',
      countdownComplete: 'Další okénko je připraveno!',
      dateBadgeLabel: 'Datum',
      dateBadgeFallback: '--',
      lockedButton: 'Zamčeno',
      copySuccess: 'Kód byl zkopírován!',
      copyError: 'Kód se nepodařilo zkopírovat.'
    },
    sk: {
      localeTag: 'sk-SK',
      gridTitle: 'Adventný kalendár',
      gridSubtitle: 'Všetky okienka máte na jednom mieste. Nové sa odomknú automaticky v stanovenom čase.',
      windowLabel: 'Okienko',
      lockedPrefix: 'Otvoríme',
      defaultBody: 'Zostaň naladený, čaká ťa prekvapenie.',
      metaPrefix: 'Aktívne od',
      linkLabel: 'Prejsť na stránku',
      openLabel: 'Otvoriť okienko',
      coverHint: 'Potiahni alebo klikni pre otvorenie',
      openedLabel: 'Otvorené',
      defaultCardLabel: 'Adventné okienko',
      countdownPrefix: 'Ďalšie prekvapenie o',
      countdownComplete: 'Ďalšie okienko je pripravené!',
      dateBadgeLabel: 'Dátum',
      dateBadgeFallback: '--',
      lockedButton: 'Zamknuté',
      copySuccess: 'Kód bol skopírovaný!',
      copyError: 'Kód sa nepodarilo skopírovať.'
    },
    ro: {
      localeTag: 'ro-RO',
      gridTitle: 'Calendar de Advent',
      gridSubtitle: 'Toate ferestrele sunt într-un singur loc. Cele noi se deschid automat la ora stabilită.',
      windowLabel: 'Fereastra',
      lockedPrefix: 'Deschidem',
      defaultBody: 'Rămâi pe fază, te așteaptă o surpriză.',
      metaPrefix: 'Activ din',
      linkLabel: 'Vezi pagina',
      openLabel: 'Deschide fereastra',
      coverHint: 'Glisează sau apasă pentru a deschide',
      openedLabel: 'Deschis',
      defaultCardLabel: 'Fereastra de Advent',
      countdownPrefix: 'Următoarea surpriză în',
      countdownComplete: 'Următoarea fereastră este gata!',
      dateBadgeLabel: 'Data',
      dateBadgeFallback: '--',
      lockedButton: 'Blocat',
      copySuccess: 'Codul a fost copiat!',
      copyError: 'Codul nu a putut fi copiat.'
    },
    hu: {
      localeTag: 'hu-HU',
      gridTitle: 'Adventi naptár',
      gridSubtitle: 'Minden ablak egy helyen. Az újak a megadott időben automatikusan megnyílnak.',
      windowLabel: 'Ablak',
      lockedPrefix: 'Megnyitjuk',
      defaultBody: 'Maradj velünk, meglepetés vár rád.',
      metaPrefix: 'Aktív ettől',
      linkLabel: 'Ugrás az oldalra',
      openLabel: 'Ablak megnyitása',
      coverHint: 'Húzd vagy kattints a megnyitáshoz',
      openedLabel: 'Megnyitva',
      defaultCardLabel: 'Adventi ablak',
      countdownPrefix: 'Következő meglepetés eddig',
      countdownComplete: 'A következő ablak kész!',
      dateBadgeLabel: 'Dátum',
      dateBadgeFallback: '--',
      lockedButton: 'Zárolva',
      copySuccess: 'A kód másolva lett!',
      copyError: 'A kód másolása nem sikerült.'
    },
    hr: {
      localeTag: 'hr-HR',
      gridTitle: 'Adventski kalendar',
      gridSubtitle: 'Sva prozorčića su na jednom mjestu. Nova se otvaraju automatski u zadano vrijeme.',
      windowLabel: 'Prozorčić',
      lockedPrefix: 'Otvaramo',
      defaultBody: 'Ostani uz nas, čeka te iznenađenje.',
      metaPrefix: 'Aktivno od',
      linkLabel: 'Otvori stranicu',
      openLabel: 'Otvori prozorčić',
      coverHint: 'Povuci ili klikni za otvaranje',
      openedLabel: 'Otvoreno',
      defaultCardLabel: 'Adventski prozorčić',
      countdownPrefix: 'Sljedeće iznenađenje za',
      countdownComplete: 'Novi prozorčić je spreman!',
      dateBadgeLabel: 'Datum',
      dateBadgeFallback: '--',
      lockedButton: 'Zaključano',
      copySuccess: 'Kod je kopiran!',
      copyError: 'Kod se nije uspio kopirati.'
    },
    default: {
      localeTag: 'cs-CZ',
      gridTitle: 'Advent Calendar',
      gridSubtitle: 'All surprises live in one place. New ones unlock automatically at the scheduled time.',
      windowLabel: 'Window',
      lockedPrefix: 'Opens',
      defaultBody: 'Stay tuned, a surprise is waiting for you.',
      metaPrefix: 'Active from',
      linkLabel: 'Open page',
      openLabel: 'Open window',
      coverHint: 'Drag or click to open',
      openedLabel: 'Opened',
      defaultCardLabel: 'Advent Window',
      countdownPrefix: 'Next surprise in',
      countdownComplete: 'Next window is ready!',
      dateBadgeLabel: 'Date',
      dateBadgeFallback: '--',
      lockedButton: 'Locked',
      copySuccess: 'Code copied!',
      copyError: 'Unable to copy code.'
    }
  };

  var hostname = (window.location && window.location.hostname ? window.location.hostname.toLowerCase() : '');
  if (!translations[localeKey]) {
    var tld = hostname ? hostname.split('.').pop() : '';
    var tldMap = { hr: 'hr', hu: 'hu', sk: 'sk', ro: 'ro', cz: 'cs' };
    if (tld && tldMap[tld]) {
      localeKey = tldMap[tld];
    }
    if (!translations[localeKey]) {
      localeKey = 'default';
    }
  }
  var isCzechShoptetHost = Boolean(hostname && (hostname.indexOf('shoptet.cz') !== -1 || hostname.endsWith('.cz')));
  var svgIcons = {
    clock: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-clock w-5 h-5 text-accent animate-pulse"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    gift: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-gift w-5 h-5"><rect x="3" y="8" width="18" height="4" rx="1"></rect><path d="M12 8v13"></path><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"></path><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"></path></svg>',
    lock: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-lock w-5 h-5"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>'
  };
  var labels = translations[localeKey] || translations['default'];

  if (!config.cardLabel || config.cardLabel === 'Adventní okénko') {
    cardLabel = labels.defaultCardLabel;
  }
  if (!config.countdownPrefix || config.countdownPrefix === 'Další překvapení za') {
    countdownPrefix = labels.countdownPrefix;
  }
  if (!config.countdownComplete || config.countdownComplete === 'Další okénko je připraveno!') {
    countdownComplete = labels.countdownComplete;
  }

  var header = document.querySelector('#header');
  var host = document.querySelector('#content-wrapper');
  var insertParent = header && header.parentNode ? header.parentNode : host;
  var now = new Date();

  function normalizePath(value) {
    if (!value) { return null; }
    var normalized = value.toString().trim().toLowerCase();
    if (normalized === '') { return null; }
    if (normalized.charAt(0) !== '/') { normalized = '/' + normalized; }
    if (normalized.length > 1 && normalized.endsWith('/')) { normalized = normalized.slice(0, -1); }
    return normalized;
  }

  function resolveTarget(value) {
    if (!value) { return null; }
    var trimmed = value.toString().trim();
    if (trimmed === '') { return null; }
    if (/^https?:\/\//i.test(trimmed)) { return trimmed; }
    if (trimmed.charAt(0) !== '/') { return '/' + trimmed.replace(/^\/+/, ''); }
    return trimmed;
  }

  function decodeSnippetHtml(value) {
    if (!value) { return ''; }
    return value
      .toString()
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function copyToClipboardValue(text, onSuccess, onError) {
    if (!text) {
      if (onError) { onError(); }
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (onSuccess) { onSuccess(); }
      }).catch(function () {
        if (onError) { onError(); }
      });
      return;
    }
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      var ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) {
        if (onSuccess) { onSuccess(); }
      } else if (onError) {
        onError();
      }
    } catch (err) {
      document.body.removeChild(textarea);
      if (onError) { onError(err); }
    }
  }

  function normalizeCopyValue(value) {
    if (!value) { return ''; }
    var temp = document.createElement('div');
    temp.innerHTML = value;
    var text = temp.textContent || temp.innerText || '';
    return text.trim();
  }

  function inferSiblingCopyValue(trigger) {
    if (!trigger) { return ''; }
    var candidateNodes = [];
    if (trigger.previousElementSibling) {
      candidateNodes.push(trigger.previousElementSibling);
    }
    if (trigger.parentElement) {
      var targetEm = trigger.parentElement.querySelector('em:last-of-type');
      if (targetEm) {
        candidateNodes.push(targetEm);
      }
    }
    for (var i = 0; i < candidateNodes.length; i++) {
      var node = candidateNodes[i];
      if (!node) { continue; }
      var tag = node.tagName ? node.tagName.toUpperCase() : '';
      if (tag !== 'EM' && tag !== 'STRONG' && tag !== 'CODE') { continue; }
      var text = (node.textContent || '').trim();
      if (text) {
        return text;
      }
    }
    return '';
  }

  function resolveCopyValue(trigger) {
    if (!trigger) { return ''; }
    var initial = (trigger.getAttribute('data-kv-copy') || trigger.getAttribute('data-kv-copy-value') || '').trim();
    var normalized = normalizeCopyValue(initial);
    if (normalized) {
      return normalized;
    }
    var fallback = normalizeCopyValue(inferSiblingCopyValue(trigger));
    if (fallback) {
      trigger.setAttribute('data-kv-copy', fallback);
      return fallback;
    }
    return '';
  }

  function showCopyFeedback(target, success) {
    if (!target) { return; }
    if (target.getAttribute('data-kv-copy-original') === null) {
      target.setAttribute('data-kv-copy-original', target.innerHTML);
    }
    clearTimeout(target.__kvCopyTimer);
    var message = success
      ? (target.getAttribute('data-kv-copy-success') || labels.copySuccess || 'Code copied!')
      : (target.getAttribute('data-kv-copy-error') || labels.copyError || 'Unable to copy code.');
    target.textContent = message;
    if (success) {
      target.classList.add('kv-copy-button--copied');
    } else {
      target.classList.remove('kv-copy-button--copied');
    }
    target.__kvCopyTimer = window.setTimeout(function () {
      var original = target.getAttribute('data-kv-copy-original');
      if (original !== null) {
        target.innerHTML = original;
      }
      target.classList.remove('kv-copy-button--copied');
    }, 2000);
  }

  function findCopyTrigger(node, boundary) {
    var current = node;
    while (current && current !== boundary) {
      if (current.nodeType === 1 && (current.hasAttribute('data-kv-copy') || current.hasAttribute('data-kv-copy-value'))) {
        return current;
      }
      current = current.parentElement;
    }
    if (boundary && boundary.nodeType === 1 && (boundary.hasAttribute('data-kv-copy') || boundary.hasAttribute('data-kv-copy-value'))) {
      return boundary;
    }
    return null;
  }

  function attachCopyHandlers(scope) {
    if (!scope || scope.__kvCopyHandlersAttached) { return; }
    scope.__kvCopyHandlersAttached = true;
    scope.addEventListener('click', function (event) {
      var trigger = findCopyTrigger(event.target, scope);
      if (!trigger) { return; }
      event.preventDefault();
      var copyValue = resolveCopyValue(trigger);
      if (copyValue === '') { return; }
      copyToClipboardValue(copyValue, function () {
        showCopyFeedback(trigger, true);
      }, function () {
        showCopyFeedback(trigger, false);
      });
    });
  }

  var currentPath = normalizePath(window.location.pathname) || '/';
  var overviewPaths = overviewTargets
    .map(normalizePath)
    .filter(function (value, index, array) {
      return value && array.indexOf(value) === index;
    });

  var today = null;
  for (var i = 0; i < config.days.length; i++) {
    var day = config.days[i];
    if (!day || !day.start_at || !day.end_at) { continue; }
    var start = new Date(day.start_at);
    var end = new Date(day.end_at);
    if (now >= start && now < end) {
      today = day;
      break;
    }
  }

  var heroTargets = [];
  if (today && Array.isArray(today.targets)) {
    heroTargets = today.targets
      .map(normalizePath)
      .filter(function (value, index, array) {
        return value && array.indexOf(value) === index;
      });
  }

  function matchesPath(path) {
    if (!path) { return false; }
    if (path === '/') { return currentPath === '/'; }
    return currentPath === path || currentPath.indexOf(path + '/') === 0;
  }

  var heroShouldRender = Boolean(today && heroTargets.length && heroTargets.some(matchesPath));
  var overviewShouldRender = Boolean(overviewPaths.length && overviewPaths.some(matchesPath));

  if (!heroShouldRender && !overviewShouldRender) {
    return;
  }

  var heroElement = null;
  if (heroShouldRender) {
    heroElement = renderHero(today);
  }

  if (overviewShouldRender) {
    renderGrid(config.days.slice(), heroElement);
  }

  function renderHero(day) {
    if (!day || document.querySelector('[data-kv-advent-card="active"]')) { return null; }

    var styleId = 'kv-advent-style';
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      var styleRules = [
        '.kv-advent-card{--kv-hero-gradient:linear-gradient(140deg,#8f041a,#2f0107);font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;overflow:hidden;border-radius:0;margin:0 auto;padding:clamp(40px,8vw,80px);color:#fff9f0;box-shadow:none;}',
        '.kv-advent-card.kv-theme-classic{--kv-hero-gradient:linear-gradient(145deg,#a50c25,#360109);}',
        '.kv-advent-card.kv-theme-gingerbread{--kv-hero-gradient:linear-gradient(145deg,#7e2f0e,#2d0a03);}',
        '.kv-advent-card.kv-theme-frost{--kv-hero-gradient:linear-gradient(145deg,#4c0f2e,#08021a);}',
        '.kv-advent-card::before{content:"";position:absolute;inset:0;background:var(--kv-hero-gradient);z-index:0;}',
        '.kv-advent-card::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 12% 0%,rgba(255,255,255,0.22),transparent 55%),radial-gradient(circle at 82% 0%,rgba(255,255,255,0.15),transparent 55%);z-index:1;pointer-events:none;}',
        '.kv-advent-card__lights{position:absolute;top:-16px;left:50%;transform:translateX(-50%);width:120%;max-width:1200px;z-index:2;pointer-events:none;}',
        '.kv-advent-card__lights img{display:block;width:100%;opacity:0.95;}',
        '.kv-advent-card__wave{position:absolute;top:-10px;left:50%;transform:translateX(-50%);width:115%;z-index:2;pointer-events:none;}',
        '.kv-advent-card__wave img{display:block;width:100%;opacity:1;}',
        '.kv-advent-card__content{position:relative;z-index:3;max-width:860px;margin:0 auto;display:flex;flex-direction:column;gap:1.1rem;text-align:center;}',
        '.kv-advent-card__tag{display:inline-flex;align-items:center;gap:0.4rem;margin:0 auto;font-size:0.72rem;letter-spacing:0.3em;text-transform:uppercase;padding:0.55rem 1.8rem;border-radius:999px;background:#f9cf68;color:#4a050e;font-weight:700;box-shadow:0 24px 40px rgba(249,207,104,0.45);}',
        '.kv-advent-card__tag::after{content:"";width:6px;height:6px;border-radius:50%;background:rgba(74,5,14,0.6);}',
        '.kv-advent-card__title{margin:0;font-size:clamp(2.6rem,4.6vw,3.5rem);font-family:"Playfair Display",serif;font-weight:700;letter-spacing:0.05em;color:#fff;}',
        '.kv-advent-card__body{font-size:14px;line-height:1.75;color:rgba(255,249,240,0.9);}',
        '.kv-advent-card__body ul{list-style-type:none;padding-left:0;}',
        '.kv-advent-card__body h3{color:#fff;}',
        '.kv-copy-button{display:inline-flex;align-items:center;justify-content:center;gap:0.35rem;margin:0 auto;font-weight:600;text-transform:none;font-size:0.85rem;padding:0.5rem 1.4rem;border-radius:999px;border:1px solid rgba(249,207,104,0.55);background:rgba(0,0,0,0.25);color:#fff;cursor:pointer;transition:transform 200ms ease,background 200ms ease;min-width:160px;}',
        '.kv-copy-button:hover{transform:translateY(-2px);background:rgba(249,207,104,0.18);}',
        '.kv-copy-button--copied{background:#f9cf68;color:#2a0109;}',
        '.kv-advent-card__link{display:inline-flex;align-items:center;justify-content:center;gap:0.4rem;margin:0 auto;font-weight:700;text-transform:uppercase;font-size:0.84rem;padding:0.95rem 2rem;border-radius:999px;background:#f9cf68;color:#410308;text-decoration:none;border:0;box-shadow:0 28px 50px rgba(249,207,104,0.55);}',
        '.kv-advent-card__link:hover{transform:translateY(-4px);box-shadow:0 34px 58px rgba(249,207,104,0.65);}',
        '.kv-advent-card__pill{margin-top:0.8rem;font-weight:600;color:#f9cf68;background:rgba(0,0,0,0.35);display:inline-flex;align-items:center;justify-content:center;padding:0.45rem 1.3rem;border-radius:999px;}',
        '@media(max-width:767px){.kv-advent-card{padding:clamp(24px,8vw,48px);}.kv-advent-card__title{font-size:2.2rem;}.kv-advent-card__body{font-size:14px;}.kv-advent-card__wave{top:-5px;width:100%;height:50px;}.kv-advent-card__wave img{height:45px;object-fit:cover;}}',
        '@media(min-width:768px){#header{border-bottom:transparent;background:#fff;}body:not(.dklabFixHead) .navigation-in>ul>li>a{background-color:transparent;color:#000;}body:not(.dklabFixHead) .navigation-in>ul>li.exp>a,body:not(.dklabFixHead) .navigation-in>ul>li>a:hover{background-color:transparent;color:#000;}}'
      ];
      if (hostname && hostname.indexOf('krasnevune.cz') !== -1) {
        styleRules.push(
          '@media only screen and (max-width:768px){#header .search{background:#fff;}}',
          '@media(max-width:767px){.top-navigation-bar{background:#fff;}}',
          '@media(max-width:767px){.navigation-window-visible .top-navigation-bar .container>div.top-navigation-contacts,.top-navigation-contacts{background:#fff;border-bottom:0;}}',
          '@media(max-width:767px){.site-msg.information{z-index:9;}}',
          '@media(max-width:767px){.kv-advent-card__wave{top:150px;width:100%;height:60px;position:fixed;z-index:4;opacity:1;}}',
          '@media(max-width:767px){.kv-advent-card__wave img{height:40px;object-fit:cover;opacity:1;}}',
          '@media(max-width:767px){.mobileHeaderSmall .kv-advent-card__wave{top:60px;width:100%;height:18px;position:fixed;z-index:10;opacity:1;}}',
          '@media(max-width:767px){.mobileHeaderSmall .kv-advent-card__wave img{height:40px;object-fit:cover;opacity:1;}}'
        );
      }
      style.textContent = styleRules.join('');
      document.head.appendChild(style);
    }

    var wrapper = document.createElement('section');
    wrapper.setAttribute('data-kv-advent-card', 'active');
    wrapper.setAttribute('data-day', day.day || '');
    wrapper.className = 'kv-advent-card kv-theme-' + (['classic','gingerbread','frost'].indexOf(decorVariant) !== -1 ? decorVariant : 'classic');

    var lights = document.createElement('div');
    lights.className = 'kv-advent-card__lights';
    if (lightsUrl) {
      var lightsImg = document.createElement('img');
      lightsImg.src = lightsUrl;
      lightsImg.alt = '';
      lightsImg.loading = 'lazy';
      lights.appendChild(lightsImg);
    }
    wrapper.appendChild(lights);

    if (snowWaveUrl) {
      var heroWave = document.createElement('div');
      heroWave.className = 'kv-advent-card__wave';
      var heroWaveImg = document.createElement('img');
      heroWaveImg.src = snowWaveUrl;
      heroWaveImg.alt = '';
      heroWaveImg.loading = 'lazy';
      heroWave.appendChild(heroWaveImg);
      wrapper.appendChild(heroWave);
    }

    var content = document.createElement('div');
    content.className = 'kv-advent-card__content';
    wrapper.appendChild(content);

    var tag = document.createElement('div');
    tag.className = 'kv-advent-card__tag';
    tag.textContent = cardLabel + ' ' + (day.day || '');
    content.appendChild(tag);

    if (day.title) {
      var heading = document.createElement('h3');
      heading.className = 'kv-advent-card__title';
      heading.textContent = day.title;
      content.appendChild(heading);
    }

    var body = document.createElement('div');
    body.className = 'kv-advent-card__body';
    body.innerHTML = decodeSnippetHtml(day.html || '');
    content.appendChild(body);

    if (header && header.parentNode) {
      header.parentNode.insertBefore(wrapper, header.nextSibling);
    } else if (host) {
      host.insertBefore(wrapper, host.firstChild || null);
    } else {
      document.body.insertBefore(wrapper, document.body.firstChild || null);
    }

    if (Boolean(config.showCountdown) && day.end_at) {
      mountHeroCountdown(content, day.end_at);
    }

    attachCopyHandlers(wrapper);
    return wrapper;
  }

  function mountHeroCountdown(container, endAt) {
    if (!container || container.querySelector('.kv-advent-card__pill')) {
      return;
    }

    var countdown = document.createElement('div');
    countdown.className = 'kv-advent-card__pill';
    countdown.setAttribute('aria-live', 'polite');
    container.appendChild(countdown);

    var target = new Date(endAt).getTime();

    function format(diff) {
      var totalSeconds = Math.max(0, Math.floor(diff / 1000));
      var hours = Math.floor(totalSeconds / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;
      return hours.toString().padStart(2, '0') + 'h ' + minutes.toString().padStart(2, '0') + 'm ' + seconds.toString().padStart(2, '0') + 's';
    }

    function update() {
      var diff = target - Date.now();
      if (diff <= 0) {
        countdown.textContent = countdownComplete;
        clearInterval(timer);
        return;
      }

      countdown.textContent = countdownPrefix + ' ' + format(diff);
    }

    update();
    var timer = setInterval(update, 1000);
  }

  function renderGrid(days, heroElement) {
    if (document.querySelector('[data-kv-advent-grid="active"]')) { return; }
    var styleId = 'kv-advent-grid-style';
    if (!document.getElementById(styleId)) {
      var style = document.createElement('style');
      style.id = styleId;
      style.textContent = [
        '.kv-advent-grid{--kv-shell:#680211;--kv-shell-end:#230006;--kv-gold:#f9cf68;font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;position:relative;overflow:hidden;border-radius:0;margin:0 auto 60px;color:#fffbf2;box-shadow:0 45px 120px rgba(18,0,4,0.7);}',
        '.kv-advent-grid::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,var(--kv-shell),var(--kv-shell-end));z-index:0;}',
        '.kv-advent-grid::after{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(circle at 15% 0%,rgba(255,255,255,0.16),transparent 58%),radial-gradient(circle at 90% 5%,rgba(255,255,255,0.12),transparent 55%);border:1px solid rgba(251,207,106,0.1);z-index:1;pointer-events:none;}',
        '.kv-advent-grid__lights,.kv-advent-grid__wave{position:absolute;left:50%;transform:translateX(-50%);width:105%;pointer-events:none;z-index:2;}',
        '.kv-advent-grid__lights{top:-10px;}',
        '.kv-advent-grid__wave{top:-4px;}',
        '.kv-advent-grid__lights img,.kv-advent-grid__wave img{display:block;width:100%;height:auto;opacity:0.95;}',
        '.kv-advent-grid__inner{position:relative;z-index:3;padding:clamp(34px,5vw,88px);max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(2.4rem,4vw,3.8rem);}',
        '.kv-advent-grid__header{display:flex;flex-direction:column;align-items:center;text-align:center;gap:1rem;}',
        '.kv-advent-grid__tag{display:inline-flex;align-items:center;gap:0.35rem;padding:0.55rem 1.8rem;border-radius:999px;background:#f9cf68;color:#5b0810;font-weight:700;font-size:0.75rem;letter-spacing:0.28em;text-transform:uppercase;}',
        '.kv-advent-grid__tag::after{content:"";width:6px;height:6px;border-radius:50%;background:rgba(91,8,16,0.7);}',
        '.kv-advent-grid__header h2{margin:0;font-size:clamp(2.5rem,4.2vw,4rem);font-family:"Playfair Display",serif;font-weight:700;letter-spacing:0.04em;color:#fff;}',
        '.kv-advent-grid__subtitle{margin:0;color:rgba(255,251,242,0.82);font-size:14px;max-width:680px;line-height:1.75;}',
        '.kv-advent-grid__countdown{display:flex;justify-content:center;}',
        '.kv-advent-grid__countdown span{display:inline-flex;align-items:center;gap:0.7rem;padding:0.75rem 1.9rem;border-radius:999px;background:rgba(0,0,0,0.28);border:1px solid rgba(249,207,104,0.25);box-shadow:0 24px 40px rgba(0,0,0,0.55);font-weight:600;color:var(--kv-gold);font-size:0.95rem;}',
        '.kv-advent-grid__countdown-icon{width:auto;height:auto;border-radius:50%;background:none !important;display:inline-flex;align-items:center;justify-content:center;color:#3e070d;font-size:32px;border:none !important;padding:5px !important;box-shadow:none !important;}',
        '.kv-advent-grid__countdown>span>span:not(.kv-advent-grid__countdown-icon){background:transparent;box-shadow:none;border:0;font-size:14px;padding:12px 12px 12px 0;}',
        '.kv-advent-grid__days{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:clamp(16px,2vw,26px);}',
        '.kv-advent-grid__day{position:relative;overflow:hidden;border-radius:30px;padding:1.6rem;background:linear-gradient(155deg,rgba(255,255,255,0.14),rgba(255,255,255,0.02));border:1px solid rgba(255,255,255,0.2);box-shadow:0 30px 60px rgba(0,0,0,0.55);transition:transform 220ms ease,box-shadow 220ms ease;color:#fff7ef;backdrop-filter:blur(12px);display:flex;flex-direction:column;gap:0.8rem;}',
        '.kv-advent-grid__day:hover{transform:translateY(-8px);box-shadow:0 36px 70px rgba(0,0,0,0.65);}',
        '.kv-advent-grid__day--active,.kv-advent-grid__day--revealed{background:linear-gradient(165deg,#ffecc0,#f9cf68);color:#3d030a;border-color:rgba(249,207,104,0.55);box-shadow:0 36px 70px rgba(82,0,10,0.35);}',
        '.kv-advent-grid__day--revealed{opacity:0.85;filter:saturate(0.4);}',
        '.kv-advent-grid__day--revealed .kv-advent-grid__button{pointer-events:none;cursor:not-allowed;opacity:0.65;box-shadow:none;background:rgba(61,5,13,0.18);color:#45030a;}',
        '.kv-advent-grid__day--locked{background:linear-gradient(150deg,rgba(18,0,4,0.9),rgba(36,0,8,0.95));color:rgba(255,255,255,0.73);border-color:rgba(255,255,255,0.12);}',
        '.kv-advent-grid__chip{align-self:flex-start;font-size:0.7rem;letter-spacing:0.32em;text-transform:uppercase;padding:0.32rem 0.95rem;border-radius:999px;background:rgba(255,255,255,0.09);border:1px solid rgba(255,255,255,0.22);}',
        '.kv-advent-grid__day--active .kv-advent-grid__chip,.kv-advent-grid__day--revealed .kv-advent-grid__chip{background:rgba(61,5,13,0.08);border-color:rgba(61,5,13,0.25);color:#5e0810;}',
        '.kv-advent-grid__icon{position:absolute;top:1.1rem;right:1.1rem;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.05rem;}',
        '.kv-advent-grid__day--active .kv-advent-grid__icon,.kv-advent-grid__day--revealed .kv-advent-grid__icon{background:#f9cf68;border:1px solid rgba(249,207,104,0.8);color:#45030a;}',
        '.kv-advent-grid__day--locked .kv-advent-grid__icon{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.18);color:rgba(255,255,255,0.7);}',
        '.kv-advent-grid__number{font-size:3.1rem;font-weight:700;font-family:"Playfair Display",serif;letter-spacing:0.09em;margin-top:0.6rem;color:#fff;}',
        '.kv-advent-grid__day--active.kv-advent-grid__day--opened .kv-advent-grid__number{color:#230006;margin-top:0;}',
        '.kv-advent-grid__status{font-size:0.74rem;letter-spacing:0.26em;text-transform:uppercase;color:var(--kv-gold);}',
        '.kv-advent-grid__day--active .kv-advent-grid__status,.kv-advent-grid__day--revealed .kv-advent-grid__status{color:#b00427;}',
        '.kv-advent-grid__status--muted{color:rgba(255,255,255,0.58);}',
        '.kv-advent-grid__date{display:flex;flex-direction:column;font-size:0.8rem;color:rgba(255,255,255,0.72);text-transform:uppercase;letter-spacing:0.22em;}',
        '.kv-advent-grid__date span{font-size:0.68rem;letter-spacing:0.3em;}',
        '.kv-advent-grid__date strong{font-size:1.125rem;letter-spacing:0.16em;color:#fff;}',
        '.kv-advent-grid__day--active .kv-advent-grid__date,.kv-advent-grid__day--revealed .kv-advent-grid__date{color:#5c080d;}',
        '.kv-advent-grid__day--active .kv-advent-grid__date span,.kv-advent-grid__day--revealed .kv-advent-grid__date span{color:rgba(92,8,13,0.7);}',
        '.kv-advent-grid__day--active .kv-advent-grid__date strong,.kv-advent-grid__day--revealed .kv-advent-grid__date strong{color:#3c0407;}',
        '.kv-advent-grid__title{margin:0;font-size:1.2rem;font-weight:600;letter-spacing:0.01em;}',
        '.kv-advent-grid__body{font-size:0.95rem;line-height:1.6;color:rgba(255,255,255,0.85);}',
        '.kv-advent-grid__day--active .kv-advent-grid__body,.kv-advent-grid__day--revealed .kv-advent-grid__body{display:none;color:#3d030a;}',
        '.kv-copy-button{display:inline-flex;align-items:center;justify-content:center;gap:0.35rem;margin-top:0.75rem;padding:0.5rem 1.2rem;border-radius:999px;border:1px solid rgba(249,207,104,0.45);background:rgba(33,0,6,0.55);color:#fff;font-weight:600;font-size:0.8rem;cursor:pointer;transition:transform 200ms ease,background 200ms ease;min-width:140px;}',
        '.kv-copy-button:hover{transform:translateY(-2px);background:rgba(249,207,104,0.18);color:#230006;}',
        '.kv-copy-button--copied{background:#f9cf68;color:#230006;}',
        '.kv-advent-grid__meta{font-size:0.78rem;text-transform:uppercase;letter-spacing:0.2em;color:rgba(255,255,255,0.6);}',
        '.kv-advent-grid__day--active .kv-advent-grid__meta,.kv-advent-grid__day--revealed .kv-advent-grid__meta{color:rgba(61,5,13,0.75);}',
        '.kv-advent-grid__button{display:inline-flex;align-items:center;justify-content:center;margin-top:auto;padding:0.78rem 1.4rem;border-radius:999px;background:var(--kv-gold);color:#4d090c;font-weight:700;text-decoration:none;border:0;text-transform:uppercase;font-size:0.78rem;letter-spacing:0.2em;transition:transform 150ms ease,box-shadow 150ms ease;}',
        '.kv-advent-grid__button:hover{transform:translateY(-4px);box-shadow:0 24px 36px rgba(249,207,104,0.4);}',
        '.kv-advent-grid__day.kv-advent-grid__day--active.kv-advent-grid__day--opened .kv-advent-grid__button{width:100%;height:28px;padding:0;color:#fff;border-radius:999px;background:#21040b;}',
        '.kv-advent-grid__button[aria-disabled="true"]{background:transparent;color:rgba(255,255,255,0.75);border:1px solid rgba(255,255,255,0.3);box-shadow:none;cursor:not-allowed;}',
        '.kv-advent-grid__cover{position:absolute;inset:0;border-radius:inherit;background:linear-gradient(160deg,rgba(21,1,6,0.95),rgba(8,0,2,0.92));border:1px solid rgba(255,255,255,0.12);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.45rem;text-align:center;color:#fff;box-shadow:0 30px 60px rgba(0,0,0,0.55);cursor:grab;--kv-cover-progress:0;transform:translateY(calc(-10px * var(--kv-cover-progress)));opacity:calc(1 - (var(--kv-cover-progress) * 0.9));}',
        '.kv-advent-grid__cover-note{font-size:0.8rem;letter-spacing:0.24em;text-transform:uppercase;}',
        '.kv-advent-grid__cover-icon{font-size:1.4rem;}',
        '.kv-advent-grid__cover--dragging{cursor:grabbing;}',
        '.kv-advent-grid__cover--opening{opacity:0;transform:translateY(-24px);}',
        '.kv-advent-grid__day--opened .kv-advent-grid__cover{display:none;}',
        '.kv-advent-grid__snow{position:absolute;inset:0;pointer-events:none;z-index:4;}',
        '.kv-advent-grid__snow span{position:absolute;top:-20px;width:4px;height:4px;border-radius:999px;background:rgba(255,255,255,0.85);opacity:0.6;filter:drop-shadow(0 2px 2px rgba(0,0,0,0.4));animation:kv-advent-snow linear infinite;}',
        '@keyframes kv-advent-snow{0%{transform:translateY(-10%);}100%{transform:translateY(110%);}}',
        '@media(max-width:767px){.kv-advent-grid__inner{padding:clamp(20px,7vw,42px);}.kv-advent-grid__days{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));}.kv-advent-grid__number{font-size:2.6rem;}.kv-advent-grid__wave{top:0;height:50px;}.kv-advent-grid__lights img,.kv-advent-grid__wave img{object-fit:cover;height:50px;}.kv-advent-grid__lights{top:15px;}}'
      ].join('');
      document.head.appendChild(style);
    }

    var wrapper = document.createElement('section');
    wrapper.setAttribute('data-kv-advent-grid', 'active');
    wrapper.className = 'kv-advent-grid kv-theme-' + (['classic','gingerbread','frost'].indexOf(decorVariant) !== -1 ? decorVariant : 'classic');
    wrapper.style.setProperty('--kv-snow-image', snowWaveUrl ? 'url(' + JSON.stringify(snowWaveUrl) + ')' : 'none');
    wrapper.style.setProperty('--kv-lights-image', lightsUrl ? 'url(' + JSON.stringify(lightsUrl) + ')' : 'none');

    var headerEl = document.createElement('header');
    headerEl.className = 'kv-advent-grid__header';
    var tag = document.createElement('p');
    tag.className = 'kv-advent-grid__tag';
    tag.textContent = cardLabel;
    headerEl.appendChild(tag);

    var heading = document.createElement('h2');
    heading.textContent = labels.gridTitle;
    headerEl.appendChild(heading);

    var subtitle = document.createElement('p');
    subtitle.className = 'kv-advent-grid__subtitle';
    subtitle.textContent = labels.gridSubtitle;
    headerEl.appendChild(subtitle);

    var countdownHost = document.createElement('div');
    countdownHost.className = 'kv-advent-grid__countdown';
    headerEl.appendChild(countdownHost);

    if (lightsUrl) {
      var gridLights = document.createElement('div');
      gridLights.className = 'kv-advent-grid__lights';
      var lightsImg = document.createElement('img');
      lightsImg.src = lightsUrl;
      lightsImg.alt = '';
      lightsImg.loading = 'lazy';
      gridLights.appendChild(lightsImg);
      wrapper.appendChild(gridLights);
    }

    if (snowWaveUrl) {
      var wave = document.createElement('div');
      wave.className = 'kv-advent-grid__wave';
      var waveImg = document.createElement('img');
      waveImg.src = snowWaveUrl;
      waveImg.alt = '';
      waveImg.loading = 'lazy';
      wave.appendChild(waveImg);
      wrapper.appendChild(wave);
    }

    var inner = document.createElement('div');
    inner.className = 'kv-advent-grid__inner';
    wrapper.appendChild(inner);

    inner.appendChild(headerEl);

    var daysGrid = document.createElement('div');
    daysGrid.className = 'kv-advent-grid__days';
    inner.appendChild(daysGrid);

    var sortedDays = days.slice().sort(function (a, b) {
      var aDay = Number(a && a.day);
      var bDay = Number(b && b.day);
      if (isFinite(aDay) && isFinite(bDay)) {
        return aDay - bDay;
      }
      var aStart = a && a.start_at ? new Date(a.start_at).getTime() : 0;
      var bStart = b && b.start_at ? new Date(b.start_at).getTime() : 0;
      return aStart - bStart;
    });

    sortedDays.forEach(function (day, index) {
      var card = createGridCard(day, index);
      if (card) {
        daysGrid.appendChild(card);
      }
    });

    var nextDay = findNextUnlock(sortedDays, now);
    if (Boolean(config.showCountdown) && nextDay) {
      mountGridCountdown(countdownHost, nextDay);
    } else if (Boolean(config.showCountdown)) {
      countdownHost.textContent = countdownComplete;
    }

    if (heroElement && heroElement.parentNode) {
      heroElement.parentNode.insertBefore(wrapper, heroElement.nextSibling);
    } else if (header && header.parentNode) {
      header.parentNode.insertBefore(wrapper, header.nextSibling);
    } else if (host) {
      host.insertBefore(wrapper, host.firstChild || null);
    } else {
      document.body.insertBefore(wrapper, document.body.firstChild || null);
    }

    attachCopyHandlers(wrapper);
    if (Boolean(config.enableSnowfall)) {
      mountSnow(wrapper);
    }
  }

  function createGridCard(day, index) {
    if (!day) { return null; }
    var card = document.createElement('article');
    card.className = 'kv-advent-grid\__day';
    var startDate = parseDate(day.start_at);
    var endDate = parseDate(day.end_at);
    var dayNumber = Number(day.day);
    if (!isFinite(dayNumber)) {
      dayNumber = index + 1;
    }
    card.setAttribute('data-day', dayNumber);

    var state = 'locked';
    if (!startDate || now >= startDate) {
      state = 'revealed';
      if (!endDate || now < endDate) {
        state = 'active';
      }
    }
    card.className += ' kv-advent-grid__day--' + state;
    if (state !== 'active') {
      card.classList.add('kv-advent-grid__day--opened');
    }

    var icon = document.createElement('div');
    icon.className = 'kv-advent-grid__icon';
    icon.setAttribute('aria-hidden', 'true');
    if (state === 'locked') {
      icon.innerHTML = svgIcons.lock;
    } else {
      icon.innerHTML = svgIcons.gift;
    }
    card.appendChild(icon);

    var chip = document.createElement('span');
    chip.className = 'kv-advent-grid__chip';
    chip.textContent = labels.windowLabel;
    card.appendChild(chip);

    var number = document.createElement('div');
    number.className = 'kv-advent-grid__number';
    number.textContent = String(dayNumber).padStart(2, '0');
    card.appendChild(number);

    var status = document.createElement('div');
    status.className = 'kv-advent-grid__status';
    if (state === 'active') {
      status.textContent = labels.openLabel;
    } else if (state === 'revealed') {
      status.textContent = labels.openedLabel;
    } else {
      status.classList.add('kv-advent-grid__status--muted');
      status.textContent = labels.lockedPrefix + ' ' + (startDate ? formatDateBadge(startDate) : '');
    }
    card.appendChild(status);

    var dateBadge = document.createElement('div');
    dateBadge.className = 'kv-advent-grid__date';
    if (labels.dateBadgeLabel) {
      var dateLabel = document.createElement('span');
      dateLabel.textContent = labels.dateBadgeLabel;
      dateBadge.appendChild(dateLabel);
    }
    var dateValue = document.createElement('strong');
    dateValue.textContent = startDate ? formatDateBadge(startDate) : (labels.dateBadgeFallback || '--');
    dateBadge.appendChild(dateValue);
    card.appendChild(dateBadge);

    var title = document.createElement('h3');
    title.className = 'kv-advent-grid__title';
    if (state === 'locked') {
      title.textContent = labels.defaultCardLabel + ' #' + String(dayNumber).padStart(2, '0');
    } else if (day.title) {
      title.textContent = day.title.toString();
    } else {
      title.textContent = labels.windowLabel + ' #' + dayNumber;
    }
    card.appendChild(title);

    var body = document.createElement('div');
    body.className = 'kv-advent-grid__body';
    if (state === 'locked') {
      body.textContent = labels.defaultBody;
    } else if (day.html) {
      body.innerHTML = decodeSnippetHtml(day.html);
    } else {
      body.innerHTML = '<p>' + labels.defaultBody + '</p>';
    }
    card.appendChild(body);

    var link = createLink(day.targets, state, 'kv-advent-grid__button');
    if (link) {
      if (state === 'locked') {
        link.textContent = labels.lockedButton || labels.linkLabel;
      } else {
        link.textContent = labels.linkLabel;
      }
      card.appendChild(link);
    } else {
      var fallback = document.createElement('span');
      fallback.className = 'kv-advent-grid__button';
      fallback.setAttribute('aria-disabled', 'true');
      fallback.textContent = state === 'locked' ? (labels.lockedButton || labels.linkLabel) : labels.openedLabel;
      card.appendChild(fallback);
    }

    if (state === 'active') {
      card.classList.remove('kv-advent-grid__day--opened');
      var cover = buildCover(card);
      card.appendChild(cover);
    }

    return card;
  }
  function buildCover(card) {
    var cover = document.createElement('button');
    cover.type = 'button';
    cover.className = 'kv-advent-grid__cover';
    cover.setAttribute('aria-label', labels.coverHint);
    cover.title = labels.coverHint;
    cover.style.setProperty('--kv-cover-progress', '0');

    var icon = document.createElement('span');
    icon.className = 'kv-advent-grid__cover-icon';
    icon.setAttribute('aria-hidden', 'true');
    cover.appendChild(icon);

    var label = document.createElement('span');
    label.className = 'kv-advent-grid__cover-text';
    label.textContent = labels.coverHint;
    cover.appendChild(label);

    var note = document.createElement('span');
    note.className = 'kv-advent-grid__cover-note';
    note.textContent = labels.openLabel;
    cover.appendChild(note);

    var opened = false;
    var startPoint = null;
    var threshold = 90;

    function reveal() {
      if (opened) { return; }
      opened = true;
      cover.style.setProperty('--kv-cover-progress', '1');
      cover.classList.add('kv-advent-grid__cover--opening');
      setTimeout(function () {
        card.classList.add('kv-advent-grid__day--opened');
        cover.remove();
      }, 480);
    }

    function updateProgress(distance) {
      if (opened) { return; }
      var ratio = Math.max(0, Math.min(1, distance / threshold));
      cover.style.setProperty('--kv-cover-progress', ratio.toFixed(3));
      if (ratio >= 1) {
        reveal();
      }
    }

    function endDrag(event) {
      if (!startPoint) { return; }
      startPoint = null;
      cover.classList.remove('kv-advent-grid__cover--dragging');
      if (!opened) {
        cover.style.setProperty('--kv-cover-progress', '0');
      }
      if (event && typeof event.pointerId === 'number') {
        try { cover.releasePointerCapture(event.pointerId); } catch (e) {}
      }
    }

    cover.addEventListener('click', function (event) {
      event.preventDefault();
      reveal();
    });

    cover.addEventListener('pointerdown', function (event) {
      if (event.button && event.button !== 0) { return; }
      startPoint = { x: event.clientX, y: event.clientY };
      cover.classList.add('kv-advent-grid__cover--dragging');
      try { cover.setPointerCapture(event.pointerId); } catch (e) {}
    });

    cover.addEventListener('pointermove', function (event) {
      if (!startPoint) { return; }
      var dx = event.clientX - startPoint.x;
      var dy = event.clientY - startPoint.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      updateProgress(distance);
      if (distance >= threshold) {
        reveal();
        endDrag(event);
      }
    });

    cover.addEventListener('pointerup', function (event) {
      endDrag(event);
    });

    cover.addEventListener('pointercancel', function (event) {
      endDrag(event);
    });

    return cover;
  }

  function createLink(targets, state, className) {
    if (!overviewShouldRender) { return null; }
    if (state !== 'active') { return null; }
    if (!Array.isArray(targets) || targets.length === 0) { return null; }
    var href = resolveTarget(targets[0]);
    if (!href) { return null; }
    var link = document.createElement('a');
    link.className = className;
    link.href = href;
    if (state === 'locked') {
      link.setAttribute('aria-disabled', 'true');
      link.addEventListener('click', function (event) { event.preventDefault(); });
    }
    return link;
  }

  function mountGridCountdown(container, nextDay) {
    if (!container || !nextDay || !nextDay.start) { return; }
    container.textContent = '';
    var pill = document.createElement('span');
    pill.setAttribute('aria-live', 'polite');
    var countdownIcon = document.createElement('span');
    countdownIcon.className = 'kv-advent-grid__countdown-icon';
    countdownIcon.setAttribute('aria-hidden', 'true');
    countdownIcon.innerHTML = svgIcons.clock;
    pill.appendChild(countdownIcon);
    var countdownText = document.createElement('span');
    pill.appendChild(countdownText);
    container.appendChild(pill);
    var target = nextDay.start.getTime();

    function format(diff) {
      var totalSeconds = Math.max(0, Math.floor(diff / 1000));
      var hours = Math.floor(totalSeconds / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;
      return hours.toString().padStart(2, '0') + 'h ' + minutes.toString().padStart(2, '0') + 'm ' + seconds.toString().padStart(2, '0') + 's';
    }

    function update() {
      var diff = target - Date.now();
      if (diff <= 0) {
        countdownText.textContent = countdownComplete;
        clearInterval(timer);
        return;
      }

      countdownText.textContent = countdownPrefix + ' ' + format(diff);
    }

    update();
    var timer = setInterval(update, 1000);
  }

  function parseDate(value) {
    if (!value) { return null; }
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function formatDateLocalized(date) {
    if (!date) { return ''; }
    try {
      return date.toLocaleDateString(labels.localeTag || localeCandidate || 'cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (error) {
      return date.getDate() + '. ' + (date.getMonth() + 1) + '. ' + date.getFullYear();
    }
  }

  function formatDateBadge(date) {
    if (!date) { return ''; }
    try {
      return date.toLocaleDateString(labels.localeTag || localeCandidate || 'cs-CZ', { day: '2-digit', month: '2-digit' });
    } catch (error) {
      var day = String(date.getDate()).padStart(2, '0');
      var month = String(date.getMonth() + 1).padStart(2, '0');
      return day + '. ' + month + '.';
    }
  }

  function findNextUnlock(days, reference) {
    var future = days
      .map(function (day) {
        var start = parseDate(day.start_at);
        return start && start > reference ? { label: day.title || (labels.windowLabel + ' ' + (day.day || '')), start: start } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) { return a.start - b.start; });

    return future.length ? future[0] : null;
  }

  function mountSnow(container) {
    if (!container || container.querySelector('.kv-advent-grid__snow')) { return; }
    var snow = document.createElement('div');
    snow.className = 'kv-advent-grid__snow';
    for (var i = 0; i < 26; i++) {
      var flake = document.createElement('span');
      flake.style.left = Math.random() * 100 + '%';
      flake.style.animationDuration = (6 + Math.random() * 6).toFixed(2) + 's';
      flake.style.animationDelay = (Math.random() * 4).toFixed(2) + 's';
      flake.style.opacity = (0.35 + Math.random() * 0.4).toFixed(2);
      flake.style.setProperty('--kv-snow-x', (Math.random() * 80 - 40).toFixed(1) + 'px');
      snow.appendChild(flake);
    }
    container.appendChild(snow);
  }
})();
JS;

    }

    public function publicBundle(Shop $shop, Request $request)
    {
        $bundle = $this->normalizeBundleKey($request->query('bundle'));

        $plugins = ShoptetPlugin::query()
            ->where('shop_id', $shop->id)
            ->with([
                'versions' => function ($query) use ($bundle) {
                    $query->where('bundle_key', $bundle)->orderByDesc('version')->limit(1);
                },
            ])
            ->orderBy('name')
            ->get();

        $chunks = [];

        foreach ($plugins as $plugin) {
            $version = $plugin->versions->first();

            if (! $version || ! $version->code) {
                continue;
            }

            $chunks[] = sprintf(
                "// Plugin: %s (verze #%s)\n%s\n// End plugin: %s",
                $plugin->name,
                $version->version,
                $version->code,
                $plugin->name
            );
        }

        if ($chunks === []) {
            $chunks[] = sprintf("// Žádné pluginy nejsou přiřazeny do bundle '%s'.", $bundle);
        }

        return response(implode("\n\n", $chunks), 200, [
            'Content-Type' => 'application/javascript; charset=UTF-8',
            'Cache-Control' => 'public, max-age=300',
        ]);
    }

    private function normalizeBundleKey(?string $value): string
    {
        $bundle = trim((string) $value);

        // Pokud je zadáno explicitně prázdné, vrať prázdný (bez /main suffixu).
        if ($value !== null && $bundle === '') {
            return '';
        }

        return $bundle !== '' ? $bundle : 'main';
    }

    public function publicCard(Shop $shop, Request $request)
    {
        $bundle = $this->normalizeBundleKey($request->query('bundle'));
        $version = $this->fetchLatestAdventVersion($shop->id, $bundle);

        if (! $version) {
            abort(404);
        }

        $config = data_get($version->metadata, 'advent_calendar');
        if (! is_array($config) || empty($config['days'])) {
            abort(404);
        }

        $timezone = $config['timezone'] ?? $shop->timezone ?? config('app.timezone');
        $now = CarbonImmutable::now($timezone);
        $current = $this->findDayForMoment($config['days'], $now);
        $state = 'active';

        if ($current === null) {
            $current = $this->findUpcomingDay($config['days'], $now);
            $state = $current ? 'upcoming' : 'finished';
            if ($current === null) {
                $current = $this->wrapDay(end($config['days']));
            }
        }

        $locale = $config['shop_locale'] ?? null;
        $labels = $this->resolveAdventLabels($locale);
        $lightsUrl = asset('plugins/advent/lights.svg');
        $snowUrl = asset('plugins/advent/snow-waves.svg');

        $html = $this->renderAdventCardPage($current, $state, $labels, $lightsUrl, $snowUrl, $locale);

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=UTF-8',
            'Cache-Control' => 'public, max-age=60',
        ]);
    }

    private function fetchLatestAdventVersion(int $shopId, string $bundle): ?ShoptetPluginVersion
    {
        return ShoptetPluginVersion::query()
            ->where('bundle_key', $bundle)
            ->where('metadata->plugin_type', 'advent_calendar_admin')
            ->whereHas('plugin', fn ($query) => $query->where('shop_id', $shopId))
            ->orderByDesc('version')
            ->first();
    }

    private function findDayForMoment(array $days, CarbonImmutable $moment): ?array
    {
        foreach ($days as $entry) {
            $start = isset($entry['start_at']) ? CarbonImmutable::parse($entry['start_at']) : null;
            $end = isset($entry['end_at']) ? CarbonImmutable::parse($entry['end_at']) : null;

            if ($start && $end && $moment >= $start && $moment < $end) {
                return $this->wrapDay($entry, $start, $end);
            }
        }

        return null;
    }

    private function findUpcomingDay(array $days, CarbonImmutable $moment): ?array
    {
        $future = array_filter(array_map(function ($entry) use ($moment) {
            $start = isset($entry['start_at']) ? CarbonImmutable::parse($entry['start_at']) : null;
            if ($start && $start > $moment) {
                $end = isset($entry['end_at']) ? CarbonImmutable::parse($entry['end_at']) : null;
                return $this->wrapDay($entry, $start, $end);
            }

            return null;
        }, $days));

        if ($future === []) {
            return null;
        }

        usort($future, fn ($a, $b) => $a['start'] <=> $b['start']);

        return $future[0];
    }

    private function wrapDay(?array $entry, ?CarbonImmutable $start = null, ?CarbonImmutable $end = null): ?array
    {
        if (! $entry) {
            return null;
        }

        return [
            'raw' => $entry,
            'start' => $start ?? (isset($entry['start_at']) ? CarbonImmutable::parse($entry['start_at']) : null),
            'end' => $end ?? (isset($entry['end_at']) ? CarbonImmutable::parse($entry['end_at']) : null),
        ];
    }

    private function renderAdventCardPage(array $day, string $state, array $labels, string $lightsUrl, string $snowUrl, ?string $locale): string
    {
        $raw = $day['raw'] ?? [];
        $number = str_pad((string) ($raw['day'] ?? ''), 2, '0', STR_PAD_LEFT);
        $start = $day['start'] ?? null;
        $dateLabel = $start ? $this->formatDateLabel($start, $locale) : '';
        $rawHtml = isset($raw['html']) && is_string($raw['html']) ? $raw['html'] : '';
        $decodedHtml = $this->decodeHtmlSnippet($rawHtml);
        $bodyTemplate = $decodedHtml !== '' ? $decodedHtml : '<p>'.$labels['default_body'].'</p>';
        $body = match ($state) {
            'active', 'finished' => $bodyTemplate,
            default => '<p>'.$labels['default_body'].'</p>',
        };
        $status = match ($state) {
            'active', 'finished' => $labels['opened_label'],
            'upcoming' => $start ? $labels['locked_prefix'].' '.$this->formatDateLabel($start, $locale) : $labels['locked_prefix'],
            default => $labels['locked_prefix'],
        };
        $title = htmlspecialchars($labels['card_label'], ENT_QUOTES, 'UTF-8');
        $windowLabel = htmlspecialchars($labels['window_label'], ENT_QUOTES, 'UTF-8');
        $status = htmlspecialchars($status, ENT_QUOTES, 'UTF-8');
        $dateEscaped = htmlspecialchars($dateLabel, ENT_QUOTES, 'UTF-8');
        $numberEscaped = htmlspecialchars($number, ENT_QUOTES, 'UTF-8');
        $lang = htmlspecialchars($locale ? str_replace('_', '-', $locale) : 'cs', ENT_QUOTES, 'UTF-8');
        $lightsEscaped = htmlspecialchars($lightsUrl, ENT_QUOTES, 'UTF-8');
        $snowEscaped = htmlspecialchars($snowUrl, ENT_QUOTES, 'UTF-8');
        $copySuccess = json_encode($labels['copy_success'] ?? 'Kód byl zkopírován!', JSON_UNESCAPED_UNICODE);
        $copyError = json_encode($labels['copy_error'] ?? 'Kód se nepodařilo zkopírovat.', JSON_UNESCAPED_UNICODE);

        return <<<HTML
<!doctype html>
<html lang="{$lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{$title}</title>
  <style>
    :root {
      color-scheme: dark;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(140deg,#8f041a,#2f0107);
      color: #fff9f0;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 40px 16px 60px;
    }
    .kv-app-shell {
      width: min(520px, 100%);
      position: relative;
    }
    .kv-app-lights,
    .kv-app-snow {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 110%;
      pointer-events: none;
    }
    .kv-app-lights { top: -18px; }
    .kv-app-snow { top: 12px; }
    .kv-app-card {
      position: relative;
      padding: 48px 32px;
      border-radius: 36px;
      background: linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02));
      border: 1px solid rgba(255,255,255,0.22);
      box-shadow: 0 40px 90px rgba(5,0,0,0.65);
      backdrop-filter: blur(12px);
    }
    .kv-app-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.45rem 1.6rem;
      border-radius: 999px;
      background: #f9cf68;
      color: #400208;
      font-weight: 700;
      letter-spacing: 0.28em;
      text-transform: uppercase;
      font-size: 0.72rem;
      margin-bottom: 1.5rem;
    }
    .kv-app-number {
      font-size: 3.6rem;
      font-weight: 700;
      font-family: "Playfair Display", serif;
      letter-spacing: 0.08em;
      margin: 0;
    }
    .kv-app-date {
      margin-top: 0.25rem;
      font-size: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.32em;
      color: rgba(255,255,255,0.8);
    }
    .kv-app-status {
      margin-top: 1rem;
      font-size: 0.8rem;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: #f9cf68;
    }
    .kv-app-body {
      margin-top: 1.5rem;
      font-size: 1rem;
      line-height: 1.7;
      color: rgba(255,255,255,0.92);
    }
    .kv-app-body ul {
      padding-left: 1.2rem;
    }
    .kv-app-body a {
      color: #f9cf68;
    }
    .kv-copy-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.35rem;
      margin-top: 1rem;
      padding: 0.5rem 1.4rem;
      border-radius: 999px;
      border: 1px solid rgba(249,207,104,0.55);
      background: rgba(0,0,0,0.25);
      color: #fff;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: transform 0.2s ease, background 0.2s ease;
      min-width: 160px;
    }
    .kv-copy-button:hover {
      transform: translateY(-2px);
      background: rgba(249,207,104,0.18);
    }
    .kv-copy-button--copied {
      background: #f9cf68;
      color: #2a0109;
    }
  </style>
</head>
<body>
  <div class="kv-app-shell">
    <article class="kv-app-card">
      <span class="kv-app-tag">{$title}</span>
      <h1 class="kv-app-number">{$numberEscaped}</h1>
      <div class="kv-app-date">{$dateEscaped}</div>
      <div class="kv-app-status">{$status}</div>
      <div class="kv-app-body">{$body}</div>
    </article>
  </div>
  <script>
    (function(){
      var shell = document.querySelector('.kv-app-shell');
      if (!shell) { return; }
      var successMessage = {$copySuccess};
      var errorMessage = {$copyError};
      shell.addEventListener('click', function (event) {
        var node = event.target;
        while (node && node !== shell) {
          if (node.nodeType === 1 && (node.hasAttribute('data-kv-copy') || node.hasAttribute('data-kv-copy-value'))) {
            break;
          }
          node = node.parentElement;
        }
        if (!node || node === shell) { return; }
        event.preventDefault();
        var value = resolveCopyValue(node);
        if (value === '') { return; }
        copyValue(value, function () {
          updateCopyLabel(node, successMessage, true);
        }, function () {
          updateCopyLabel(node, errorMessage, false);
        });
      });

      function copyValue(text, onSuccess, onError) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            if (onSuccess) { onSuccess(); }
          }).catch(function () {
            if (onError) { onError(); }
          });
          return;
        }
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          var ok = document.execCommand('copy');
          document.body.removeChild(textarea);
          if (ok) {
            if (onSuccess) { onSuccess(); }
          } else if (onError) {
            onError();
          }
        } catch (err) {
          document.body.removeChild(textarea);
          if (onError) { onError(); }
        }
      }

      function normalizeCopyValue(value) {
        if (!value) { return ''; }
        var temp = document.createElement('div');
        temp.innerHTML = value;
        var text = temp.textContent || temp.innerText || '';
        return text.trim();
      }

      function inferSiblingCopyValue(trigger) {
        if (!trigger) { return ''; }
        var nodes = [];
        if (trigger.previousElementSibling) {
          nodes.push(trigger.previousElementSibling);
        }
        if (trigger.parentElement) {
          var emNode = trigger.parentElement.querySelector('em:last-of-type');
          if (emNode) {
            nodes.push(emNode);
          }
        }
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (!node) { continue; }
          var tag = node.tagName ? node.tagName.toUpperCase() : '';
          if (tag !== 'EM' && tag !== 'STRONG' && tag !== 'CODE') { continue; }
          var text = (node.textContent || '').trim();
          if (text) {
            return text;
          }
        }
        return '';
      }

      function resolveCopyValue(trigger) {
        if (!trigger) { return ''; }
        var attr = (trigger.getAttribute('data-kv-copy') || trigger.getAttribute('data-kv-copy-value') || '').trim();
        var normalized = normalizeCopyValue(attr);
        if (normalized) {
          return normalized;
        }
        var fallback = normalizeCopyValue(inferSiblingCopyValue(trigger));
        if (fallback) {
          trigger.setAttribute('data-kv-copy', fallback);
          return fallback;
        }
        return '';
      }

      function updateCopyLabel(button, message, success) {
        if (!button) { return; }
        if (button.getAttribute('data-kv-copy-original') === null) {
          button.setAttribute('data-kv-copy-original', button.innerHTML);
        }
        clearTimeout(button.__kvCopyTimer);
        button.textContent = message;
        if (success) {
          button.classList.add('kv-copy-button--copied');
        } else {
          button.classList.remove('kv-copy-button--copied');
        }
        button.__kvCopyTimer = window.setTimeout(function () {
          var original = button.getAttribute('data-kv-copy-original');
          if (original !== null) {
            button.innerHTML = original;
          }
          button.classList.remove('kv-copy-button--copied');
        }, 2000);
      }
    })();
  </script>
</body>
</html>
HTML;
    }

    private function resolveAdventLabels(?string $locale): array
    {
        $candidate = $locale ? str_replace('_', '-', strtolower($locale)) : 'cs';
        $base = explode('-', $candidate)[0] ?? 'cs';

        return self::ADVENT_TRANSLATIONS[$base] ?? self::ADVENT_TRANSLATIONS['cs'];
    }

    private function decodeHtmlSnippet(string $value): string
    {
        return html_entity_decode($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }

    private function formatDateLabel(CarbonImmutable $date, ?string $locale): string
    {
        try {
            $fmtLocale = str_replace('_', '-', strtolower($locale ?? 'cs'));
            return $date->locale($fmtLocale)->isoFormat('DD. MM.');
        } catch (\Throwable) {
            return $date->format('d. m.');
        }
    }

    private function normalizeCategoryPath(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        if ($trimmed === '') {
            return null;
        }

        $normalized = $trimmed;

        if (! str_starts_with($normalized, '/')) {
            $normalized = '/'.ltrim($normalized, '/');
        }

        if (strlen($normalized) > 1) {
            $normalized = rtrim($normalized, '/');
        }

        return mb_strtolower($normalized, 'UTF-8');
    }

    private function resolvePlugin(?int $pluginId, Shop $shop, string $name): ShoptetPlugin
    {
        $trimmedName = trim($name) !== '' ? trim($name) : 'Plugin';

        if ($pluginId !== null) {
            /** @var ShoptetPlugin $plugin */
            $plugin = ShoptetPlugin::query()->lockForUpdate()->findOrFail($pluginId);
            if ($plugin->shop_id !== $shop->id) {
                throw ValidationException::withMessages([
                    'plugin_id' => 'Vybraný plugin patří jinému e-shopu.',
                ]);
            }

            if ($trimmedName !== '' && $plugin->name !== $trimmedName) {
                $plugin->update(['name' => $trimmedName]);
            }

            return $plugin;
        }

        $existing = ShoptetPlugin::query()
            ->lockForUpdate()
            ->where('shop_id', $shop->id)
            ->where('name', $trimmedName)
            ->first();

        if ($existing) {
            return $existing;
        }

        return ShoptetPlugin::create([
            'shop_id' => $shop->id,
            'name' => $trimmedName,
        ]);
    }
}
