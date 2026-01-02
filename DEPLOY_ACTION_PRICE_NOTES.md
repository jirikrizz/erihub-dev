# Action Price Widget Deployment - Technical Notes

## What Changed

**File Modified:** `backend/modules/Pim/Resources/views/widgets/embed.blade.php`

**Change Type:** View template logic (rendering layer only)

### Specific Changes

1. **Option price extraction (line ~677)**
   - OLD: `$optionPriceInt = $extractInt($option['variant_price'] ?? $option['price'] ?? null);`
   - NEW: `$optionPriceInt = $extractInt($option['variant_action_price'] ?? $option['action_price'] ?? $option['variant_price'] ?? $option['price'] ?? null);`
   - Effect: Now prefers action_price when available

2. **Option original price extraction (line ~678)**
   - OLD: `$optionOriginalInt = $extractInt($option['variant_original_price'] ?? $option['original_price'] ?? null);`
   - NEW: `$optionOriginalInt = $extractInt($option['base_price'] ?? $option['variant_original_price'] ?? $option['original_price'] ?? null);`
   - Effect: Now prefers base_price when available

3. **Main price block (line ~623)**
   - OLD: `$priceCurrentInt = $extractInt($price['current'] ?? null);`
   - NEW: `$priceCurrentInt = $extractInt($price['action_price'] ?? $price['current'] ?? null);`
   - Effect: Prefers action_price from recommendation data

4. **Preselected variant pricing (lines ~801-828)**
   - Added logic to check for `variant_action_price` / `action_price` / `base_price`
   - Falls back to standard `variant_price` / `variant_original_price` if action prices unavailable

## Data Flow (Unchanged)

```
Database (product_variant_overlays.data)
  ↓
InventoryRecommendationWidgetController::resolveCzPricing()
  → Extracts: action_price, base_price, is_action_price_active
  ↓
buildItemPayload()
  → Returns: $price = ['action_price' => X, 'base_price' => Y, 'current' => Z, ...]
  ↓
buildVariantOptions()
  → Puts action_price, base_price in variant_options
  ↓
embed.blade.php (NOW USES THESE FIELDS)
  → New logic prefers action_price + base_price
  ↓
HTML/JavaScript Widget
```

## Database Impact

**NONE.** The changes are read-only from database perspective:
- ✓ No migrations needed
- ✓ No data structure changes
- ✓ No INSERT/UPDATE/DELETE operations
- ✓ Only changes how existing data is rendered

## How to Deploy

```bash
# From project root, make script executable:
chmod +x deploy-action-price.sh

# Run deployment:
./deploy-action-price.sh
```

The script:
1. Backs up original `embed.blade.php` with timestamp
2. Uploads new version via rsync (only this file)
3. Clears view cache (`php artisan view:clear`)
4. **Does NOT** touch database or run migrations

## Testing

After deployment:

1. **On Production:**
   ```bash
   # Check if file was deployed
   ssh deploy@168.119.157.199 'tail -20 admin-kv/backend/modules/Pim/Resources/views/widgets/embed.blade.php'
   
   # Verify view cache was cleared
   ssh deploy@168.119.157.199 'ls -la admin-kv/backend/storage/framework/views/' | head
   ```

2. **In Browser:**
   - Go to https://hub.krasnevune.cz
   - Open any product detail page
   - Look for "Mohlo by se vám líbit" / "Související produkty" widget
   - Verify prices show action prices (should be lower if promotion is active)
   - Check discount badge displays correctly

3. **Debugging (if needed):**
   ```bash
   # Check if action_price is in the payload:
   ssh deploy@168.119.157.199 'cd admin-kv && docker compose logs -f backend' | grep -i action
   
   # Or check page source in browser (F12) for data attributes:
   # Look for: data-default-price (should be action price if active)
   # vs data-default-original-price (should be base_price)
   ```

## Rollback

If there's any issue:

```bash
ssh deploy@168.119.157.199 <<EOF
  cd admin-kv
  # Restore from backup
  cp backend/modules/Pim/Resources/views/widgets/embed.blade.php.backup.* backend/modules/Pim/Resources/views/widgets/embed.blade.php
  # Clear cache
  docker compose exec -T backend php artisan view:clear
EOF
```

Or from Git:
```bash
ssh deploy@168.119.157.199 'cd admin-kv && git checkout backend/modules/Pim/Resources/views/widgets/embed.blade.php && docker compose exec -T backend php artisan view:clear'
```

## Notes

- Changes only affect **how data is displayed**, not what data is stored
- If action_price data is missing in database (overlay.data), fallback to current/standard prices still works
- No performance impact (no additional queries, just different preference order)
- Safe to deploy anytime without coordination with other deploys
