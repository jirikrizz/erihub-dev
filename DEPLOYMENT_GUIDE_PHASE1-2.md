# 🎯 GIT COMMIT & DEPLOYMENT GUIDE

## Commit Message

```
feat(widgets): add multi-language currency mapping and simplify slider styling

## Changes

### Phase 1: Slider Simplification
- Remove box-shadow from navigation buttons (prev/next arrows)
- Simplify transition list (remove box-shadow animation)
- Result: cleaner visual appearance with negligible performance improvement

### Phase 2: Multi-Language Currency Mapping
- Create CurrencyMap constant (backend/app/Constants/CurrencyMap.php)
  * Maps locales to currency symbols: cs→Kč, sk→Sk, hu→Ft, ro→Lei, hr→kn
  * Provides getSymbol(), getCode(), getInfo() methods
  * Safe with fallback to 'Kč'

- Update ProductWidgetRenderer (backend/modules/Pim/Services/ProductWidgetRenderer.php)
  * Import CurrencyMap constant
  * Determine $currencySymbol from widget.locale
  * Pass $currencySymbol to Blade template

- Update embed.blade.php (backend/modules/Pim/Resources/views/widgets/embed.blade.php)
  * Add $currencySymbol to template docblock
  * Update $formatPrice() function signature to accept symbol parameter
  * Update 11 price formatting calls to pass $currencySymbol

## Pricing Integrity
- ✅ NO price conversion happens
- ✅ Each shop maintains its own currency prices
- ✅ Discounts remain accurate (same currency for both current and original)
- ✅ Display only: "1290 Sk" instead of "1290 Kč" for Slovak shops

## Testing
- [x] Syntax check: no PHP errors
- [ ] Unit tests: CurrencyMap::getSymbol() returns correct values
- [ ] Integration: Create widgets with different locales and verify display
- [ ] Manual: Czech (Kč), Slovak (Sk), Hungarian (Ft), Romanian (Lei), Croatian (kn)

## Files Modified
- backend/app/Constants/CurrencyMap.php (NEW)
- backend/modules/Pim/Services/ProductWidgetRenderer.php
- backend/modules/Pim/Resources/views/widgets/embed.blade.php

## Backward Compatibility
✅ Fully backward compatible - defaults to 'Kč' if locale not set

## Breaking Changes
None

## Closes
#<issue-number> (if applicable)
```

---

## Deployment Steps

### 1. Pre-Deployment Verification
```bash
# Check syntax
php artisan tinker
>>> App\Constants\CurrencyMap::getSymbol('sk')
=> "Sk"

# Check files
git status
git diff backend/modules/Pim/Resources/views/widgets/embed.blade.php | head -50
```

### 2. Local Testing
```bash
# Ensure fresh code is loaded
php artisan cache:clear
php artisan config:clear

# Create test widget with Slovak locale
sqlite> INSERT INTO product_widgets (id, locale, ...) 
        VALUES ('test-sk', 'sk', ...);

# Render and verify
php artisan tinker
>>> $widget = \Modules\Pim\Models\ProductWidget::find('test-sk');
>>> $renderer = app(\Modules\Pim\Services\ProductWidgetRenderer::class);
>>> $result = $renderer->render($widget);
>>> str_contains($result['html'], 'Sk')  # Should be true
```

### 3. Staging Deployment
```bash
# Create backup
./backup.sh

# Deploy
./deploy.sh staging

# Verify
curl https://staging.hub.krasnevune.cz/api/health

# Manual testing on staging
# 1. Create widget for CZ shop (locale='cs')
# 2. Check HTML has 'Kč' symbol
# 3. Create widget for SK shop (locale='sk')
# 4. Check HTML has 'Sk' symbol
# 5. Verify prices match Shoptet
```

### 4. Production Deployment
```bash
# Code review
git log --oneline -1
git show HEAD

# Backup production DB
ssh deploy@ "cd /home/deploy/admin-kv && docker compose exec -T postgres pg_dump -U admin_kv admin_kv | gzip > /home/deploy/backups/backup-$(date +%Y%m%d-%H%M%S).sql.gz"

# Deploy
./deploy.sh production

# Health checks
curl https://hub.krasnevune.cz/api/health
curl https://hub.krasnevune.cz/api/widgets/inventory/recommendations.js?widget_id=<test-id>&variant_code=TEST

# Verify on production
# 1. Test with real Czech widget
# 2. Test with real Slovak widget
# 3. Check logs for any errors
tail -f /home/deploy/admin-kv/backend/storage/logs/laravel.log
```

### 5. Rollback (if needed)
```bash
# Get previous commit
git log --oneline | head -5

# Revert
git revert <commit-hash>

# Deploy
./deploy.sh production

# Restore DB if needed
gunzip < /home/deploy/backups/backup-<timestamp>.sql.gz | docker compose exec -T postgres psql -U admin_kv admin_kv
```

---

## Monitoring After Deployment

### Check Logs
```bash
# Production logs
ssh deploy@ "tail -f /home/deploy/admin-kv/backend/storage/logs/laravel.log"

# Widget rendering logs
grep -i "currency\|widget\|render" /var/log/admin-kv/*.log
```

### Verify Functionality
```bash
# Test Czech widget
curl "https://hub.krasnevune.cz/api/widgets/inventory/recommendations.js?widget_id=<czech-widget>&variant_code=TEST" | grep -o "Kč"

# Test Slovak widget
curl "https://hub.krasnevune.cz/api/widgets/inventory/recommendations.js?widget_id=<slovak-widget>&variant_code=TEST" | grep -o "Sk"

# Check error rate
# (Monitor dashboard if available)
```

### Performance Check
```bash
# Response time should be unchanged (currency mapping is O(1))
time curl "https://hub.krasnevune.cz/api/widgets/inventory/recommendations.js?..." > /dev/null

# Memory usage should be unchanged (no additional queries)
```

---

## Troubleshooting

### Issue: Widget shows "Kč" for all locales
**Solution**: Check ProductWidget.locale is set correctly
```bash
sqlite> SELECT id, locale FROM product_widgets LIMIT 5;
```

### Issue: Currency symbol is missing
**Solution**: Verify CurrencyMap constant is loaded
```bash
php artisan tinker
>>> App\Constants\CurrencyMap::getSymbol('sk')
# Should return 'Sk', not error
```

### Issue: Some prices still show old currency
**Solution**: Clear view cache
```bash
php artisan view:clear
php artisan cache:clear
```

### Issue: Variant switching breaks currency
**Solution**: Verify JavaScript still receives correct symbol
```javascript
// In browser console
document.body.innerHTML.includes('Sk')  // Should be true for SK widget
```

---

## Success Criteria

✅ **Phase 1 Complete**:
- [x] Slider buttons have no shadow
- [x] Transitions simplified
- [x] Visual appearance cleaner

✅ **Phase 2 Complete**:
- [x] CurrencyMap constant exists
- [x] ProductWidgetRenderer passes currency symbol
- [x] Blade template uses dynamic symbol
- [x] All 11 price calls updated
- [ ] Staging tests passed (pending)
- [ ] Production deployment successful (pending)

---

## Timeline

| Phase | Status | Duration | Date |
|-------|--------|----------|------|
| Analysis | ✅ Done | 2 hours | Jan 2 |
| **Phase 1: Slider** | ✅ Done | 15 min | Jan 3 |
| **Phase 2: Currency** | ✅ Done | 1.5 hours | Jan 3 |
| Testing | ⏳ Pending | 1 hour | Jan 3 |
| Deployment | ⏳ Pending | 30 min | Jan 3 |
| **Phase 3: Widget Builder** | 📅 Planned | 3 hours | Jan 4 |

---

**Ready for**: `git add -A && git commit -m "feat(widgets): ..."`  
**Expected Deployment**: Jan 3, 2026 (after staging test)
