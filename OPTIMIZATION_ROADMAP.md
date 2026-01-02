# OPTIMIZATION & DEVELOPMENT ROADMAP

**Strategický dokument pro dlouhodobý rozvoj projektu**

---

## 📊 CURRENT STATE ASSESSMENT

### 🟢 What's Working Well
1. **Modular architecture** - 12 well-separated modules
2. **Queue system** - 6 specialized queues, proper isolation
3. **OAuth2 integration** - Shoptet API integration solid
4. **Multi-shop support** - Core architecture supports it
5. **React + Mantine UI** - Modern, responsive frontend
6. **Webhook system** - Asynchronous data processing

### 🟡 What Needs Improvement (Performance)
1. **order_items table** - 8.2M rows, 10 GB, NO partitioning → CRITICAL
2. **Settings cache** - Every read = DB query
3. **Snapshot progress tracking** - User can't see % complete
4. **Paginaton memory usage** - fetchPaginatedCollection() loads ALL pages
5. **Job scheduling** - No locking → duplicates possible
6. **Token refresh** - Race condition possible
7. **AI rate limiting** - No cost control
8. **Notification cleanup** - Table grows indefinitely
9. **Frontend pagination** - Must be server-side for large datasets
10. **Database indexes** - Need audit for missing indexes

### 🔴 What's Broken or Risky
1. **No retry mechanism for failed snapshots** - Data loss risk
2. **No DB integrity checks** - Could silently corrupt data
3. **No production monitoring dashboard** - Blind to issues
4. **Snapshots without progress** - Can appear hung
5. **Migration testing** - No automated dry-run before deploy
6. **Order archiving** - 8.2M rows is unmaintainable long-term

---

## 🎯 OPTIMIZATION ROADMAP

### PHASE 1: CRITICAL STABILITY (Weeks 1-2)

**Goal**: Reduce production risk, prevent data loss

#### 1.1 Snapshot Retry Mechanism ⭐⭐⭐
```
Priority: CRITICAL
Risk if not done: Data loss
Effort: 4-6 hours

What:
- Add retry logic to ProcessShoptetSnapshot
- Store failed snapshots for later retry
- Add UI to manually retry failed snapshots

How:
1. Add retry_count column to shoptet_webhook_jobs
2. Implement retry() method in DownloadShoptetSnapshot
3. Create RetryFailedSnapshotsCommand (cron job)
4. Add frontend page: Settings → Webhook Jobs → Retry Failed

Benefits:
- No more lost snapshots if processing fails
- Manual recovery option
- Visibility into failures
```

#### 1.2 Job Locking System ⭐⭐⭐
```
Priority: CRITICAL
Risk if not done: Duplicate processing
Effort: 3-4 hours

What:
- Add cache locking to all queue jobs
- Prevent simultaneous execution

How:
1. Create JobLockingTrait
2. Apply to: FetchNewOrdersJob, RecalculateCustomerMetricsJob, etc.
3. Add lock timeout (job must finish in time)

Example:
public function handle() {
    $lock = Cache::lock("job:{$this->jobId}", 600);
    if (!$lock->get()) {
        Log::info("Job already running");
        return;
    }
    
    try {
        // ... existing code ...
    } finally {
        $lock->release();
    }
}

Benefits:
- No duplicate processing
- Safe retries
- Better resource usage
```

#### 1.3 Database Backup Automation ⭐⭐⭐
```
Priority: CRITICAL
Risk if not done: No recovery option
Effort: 2-3 hours

What:
- Automated daily backups
- Retention policy (30 days)
- Point-in-time recovery setup

How:
1. Add cron job: daily backup at 2 AM
2. Compress backups (gzip)
3. Cleanup old backups after 30 days
4. Store checksums for verification

Script (docker/postgres/backup.sh):
#!/bin/bash
BACKUP_DIR="/home/deploy/backups"
DATE=$(date +%Y%m%d)
docker compose exec -T postgres pg_dump -U admin_kv admin_kv | \
  gzip > $BACKUP_DIR/db-$DATE.sql.gz

Benefits:
- Automatic safety net
- Can restore any point in last 30 days
- Peace of mind
```

#### 1.4 Settings Cache Layer ⭐⭐
```
Priority: HIGH
Risk if not done: Slow API responses
Effort: 2 hours

What:
- Cache settings in memory (1 hour TTL)
- Reduce 1000s of DB reads per day

How:
class SettingsService {
    public function get(string $key, $default = null) {
        return Cache::remember("settings.$key", 3600, function() use ($key, $default) {
            return AppSetting::where('key', $key)->value('value') ?? $default;
        });
    }
}

Benefits:
- 100x faster setting reads
- Reduce database load
```

### PHASE 2: PERFORMANCE (Weeks 3-4)

**Goal**: Handle production scale efficiently

#### 2.1 Order Items Partitioning ⭐⭐⭐
```
Priority: CRITICAL (for long-term)
Risk if not done: 8.2M rows become unmaintainable
Effort: 8-12 hours (complex!)

What:
- Partition order_items by date range
- Quarterly partitions (Q1, Q2, Q3, Q4)
- Old partitions can be archived

Why:
- Current: SELECT * FROM order_items = 8.2M scans
- With partitions: SELECT * FROM order_items WHERE date >= X = ~2M scans
- 4x faster queries!

How (PostgreSQL):
1. Create partitioned table:
   CREATE TABLE order_items_partitioned (
       id BIGSERIAL,
       order_id INTEGER,
       created_at TIMESTAMP,
       ...
   ) PARTITION BY RANGE (EXTRACT(QUARTER FROM created_at), EXTRACT(YEAR FROM created_at));

2. Create partitions:
   CREATE TABLE oi_2025_q1 PARTITION OF order_items_partitioned
       FOR VALUES FROM (1, 2025) TO (2, 2025);

3. Copy data:
   INSERT INTO order_items_partitioned SELECT * FROM order_items;

4. Swap tables:
   ALTER TABLE order_items RENAME TO order_items_old;
   ALTER TABLE order_items_partitioned RENAME TO order_items;

5. Verify + cleanup:
   DELETE FROM order_items_old;

Benefits:
- 4x faster queries on orders
- Can archive old quarters
- Better query planning
```

#### 2.2 Missing Database Indexes ⭐⭐
```
Priority: HIGH
Risk if not done: Slow queries
Effort: 3-4 hours

Analysis needed:
1. Find slow queries (> 1 sec):
   SELECT * FROM pg_stat_statements
   WHERE mean_exec_time > 1000
   ORDER BY mean_exec_time DESC;

2. Check explain plans:
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT * FROM orders WHERE shop_id = 1 AND created_at > NOW() - '30 days'::interval;

Likely missing indexes:
- order_items(order_id) - for JOIN operations
- orders(shop_id, created_at) - for filtering
- customers(shop_id, email) - for lookups
- products(shop_id, status) - for filtering
- product_translations(product_id, locale) - for lookups

How:
CREATE INDEX CONCURRENTLY idx_orders_shop_created 
    ON orders(shop_id, created_at DESC);

Benefits:
- 10-100x faster queries
- Minimal overhead (slight INSERT slowdown)
```

#### 2.3 Pagination Optimization ⭐⭐
```
Priority: HIGH
Risk if not done: Memory exhaustion on API calls
Effort: 4-6 hours

Current issue:
- fetchPaginatedCollection() loads ALL pages into memory
- 1000 pages × 200 items = 200,000 items in RAM
- MEMORY EXHAUSTION!

Solution 1: Generator pattern (lazy loading)
private function fetchPaginatedCollectionGenerator(...) {
    $page = 1;
    do {
        $response = $this->request(...);
        $items = Arr::get($response, $dataPath, []);
        foreach ($items as $item) {
            yield $item;  // ← Key: yield, not collect!
        }
        $page++;
    } while (count($items) > 0);
}

// Usage:
foreach ($this->fetchPaginatedCollectionGenerator(...) as $item) {
    // Process one item at a time - memory efficient!
}

Solution 2: Frontend cursor pagination
// Instead of limit/offset (bad for 8M rows):
SELECT * FROM order_items LIMIT 100 OFFSET 5000000;  // SLOW!

// Use cursor pagination (good):
SELECT * FROM order_items 
WHERE id > :last_id 
ORDER BY id 
LIMIT 100;  // FAST!

Benefits:
- No memory exhaustion
- Scalable to billions of rows
```

#### 2.4 Frontend Virtual Scrolling for Orders ⭐⭐
```
Priority: HIGH
Risk if not done: UI lag for large lists
Effort: 3-4 hours

Current: DataTable with virtualization (good!)
Issue: Still renders all rows in state

Optimization:
- Server-side pagination (100 rows per page)
- Cursor-based navigation
- Virtual scroll within page

Example:
// OrdersPage.tsx
const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ['orders'],
    queryFn: ({ pageParam = null }) => 
        api.getOrders({ cursor: pageParam }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
});

Benefits:
- Smooth scrolling
- No memory issues
- Responsive UI
```

### PHASE 3: FEATURES & STABILITY (Weeks 5-6)

**Goal**: Add new capabilities, improve reliability

#### 3.1 Snapshot Progress Tracking ⭐⭐
```
Priority: MEDIUM
Risk if not done: Users think system is hung
Effort: 3-4 hours

What:
- Show % progress while snapshot is processing
- Real-time updates in frontend

How:
1. Add progress fields to shoptet_webhook_jobs:
   - processed_count
   - total_count
   - progress_percentage

2. Update in ProcessShoptetSnapshot every 100 rows:
   if ($processed % 100 === 0) {
       $this->webhookJob->update([
           'processed_count' => $processed,
           'progress_percentage' => ($processed / $total) * 100,
       ]);
   }

3. Frontend polls /api/webhook-jobs/{id}:
   const { data: job } = useQuery({
       queryKey: ['webhook-job', jobId],
       queryFn: () => api.getWebhookJob(jobId),
       refetchInterval: 2000,  // Poll every 2 sec
   });

   return <ProgressBar value={job.progress_percentage} />;

Benefits:
- User knows system is working
- Can estimate time
```

#### 3.2 Production Monitoring Dashboard ⭐⭐
```
Priority: MEDIUM
Risk if not done: Blind to problems
Effort: 8-10 hours

What:
- Real-time status of all critical systems
- Queue health
- Database health
- Recent errors

Components:
1. Queue Status Widget
   - Job counts by queue
   - Failed jobs
   - Failed jobs timeline

2. Database Health Widget
   - Connection count
   - Slow query log
   - Table sizes

3. Recent Errors Widget
   - Last 10 errors
   - Error frequency
   - Most common errors

4. Performance Metrics
   - API response times
   - Queue processing times
   - Database query times

Implementation:
- Create AdminController with /api/admin/monitoring
- Frontend page: Admin → Monitoring
- Auto-refresh every 30 seconds

Benefits:
- Early problem detection
- Performance visibility
- Data-driven decisions
```

#### 3.3 Order Data Archiving ⭐⭐
```
Priority: MEDIUM (for future)
Risk if not done: Database unbounded growth
Effort: 6-8 hours

What:
- Move orders > 2 years old to archive
- Keep hot data (last 2 years) in main DB
- Archive = separate table or database

How:
1. Create archive table:
   CREATE TABLE orders_archive (
       LIKE orders INCLUDING ALL
   );

2. Move old orders:
   INSERT INTO orders_archive 
   SELECT * FROM orders WHERE created_at < NOW() - '2 years'::interval;

3. Add cleanup:
   DELETE FROM orders WHERE created_at < NOW() - '2 years'::interval;

4. Create archive queries:
   SELECT * FROM orders WHERE created_at > NOW() - '2 years'::interval
   UNION ALL
   SELECT * FROM orders_archive WHERE created_at <= NOW() - '2 years'::interval;

Benefits:
- Main table stays manageable (1M rows vs 5M+)
- Queries much faster
- Compliance (keep data 2-3 years then delete)

Timeline:
- Year 1: Just monitor
- Year 2: Archive oldest 6 months
- Year 3+: Rotate quarterly
```

### PHASE 4: FEATURES (Weeks 7-8)

**Goal**: New capabilities, competitive advantage

#### 4.1 AI-Powered Inventory Management ⭐⭐⭐
```
Priority: HIGH (strategic)
Risk if not done: Competitors will have this
Effort: 12-16 hours

Current state: Basic forecasting exists
Enhancement: Improve with ML

What to add:
1. Advanced forecasting
   - Seasonality detection
   - Holiday adjustments
   - Weather correlation
   - Supplier lead time optimization

2. Smart purchasing
   - Optimal order quantity (EOQ)
   - Bulk discount optimization
   - Multi-supplier optimization
   - Risk management (alternatives)

3. Anomaly detection
   - Detect unusual sales patterns
   - Alert on anomalies
   - Investigate root cause

Implementation:
- Use existing InventoryVariantMetrics
- Add seasonal decomposition
- Add supplier constraints
- Generate better recommendations

Benefits:
- Less overstock / understock
- Cost savings (better purchasing)
- Competitive advantage
```

#### 4.2 Advanced Customer Analytics ⭐⭐
```
Priority: MEDIUM (strategic)
Risk if not done: Limited customer insights
Effort: 10-12 hours

Current state: Basic metrics exist
Enhancement: Predictive + segmentation

What to add:
1. Churn prediction
   - Identify customers likely to leave
   - Pro-active retention campaigns
   - Churn risk score

2. Next purchase prediction
   - When will customer buy again?
   - What product will they buy?
   - Price sensitivity

3. Advanced segmentation
   - Behavioral clusters (RFM)
   - Lifetime value prediction
   - Profitability analysis

4. Recommendations
   - Product recommendations for customer
   - Cross-sell / upsell opportunities
   - Bundle suggestions

Implementation:
- Use existing CustomerMetrics
- Add predictive models
- Add segmentation engine
- Create customer intelligence endpoints

Benefits:
- Better marketing decisions
- Increased revenue
- Competitive advantage
```

#### 4.3 Multi-Channel Support ⭐⭐
```
Priority: MEDIUM
Risk if not done: Limited to Shoptet
Effort: 14-18 hours

Current: Shoptet + WooCommerce (basic)
Enhancement: Add more channels

Channels to add:
1. Marketplace APIs
   - Idealo
   - Heureka
   - Zboží.cz
   - Facebook Marketplace
   - Instagram Shopping

2. Custom integrations
   - B2B ordering system
   - Reseller API
   - POS systems

3. Catalog sync
   - Push products to marketplaces
   - Pull inventory from marketplaces
   - Unified order management

Benefits:
- Reach more customers
- Unified inventory
- Centralized management
```

### PHASE 5: SCALE (Weeks 9-10)

**Goal**: Handle 10x growth

#### 5.1 Caching Layer (Redis) ⭐⭐⭐
```
Priority: HIGH
Risk if not done: Can't handle 10x traffic
Effort: 10-12 hours

Current: Redis for queue only
Enhancement: Cache everything

What to cache:
1. Settings (already in Phase 1)
2. Shops (rarely changes)
3. Product lists (with TTL)
4. Customer segments (daily)
5. Translation keys (static)
6. Recent order summaries

Implementation:
- Centralized CacheFacade
- Cache tags for smart invalidation
- TTL by type (static vs dynamic)
- Cache warming for critical data

Example:
class ProductCache {
    public function getByShop($shopId) {
        return Cache::tags(['products', "shop:$shopId"])
            ->remember("products:$shopId", 3600, function() {
                return Product::where('shop_id', $shopId)
                    ->with('translations')
                    ->get();
            });
    }
    
    public function invalidateShop($shopId) {
        Cache::tags(['products', "shop:$shopId"])->flush();
    }
}

Benefits:
- 10-100x faster responses
- Reduce database load
- Handle spike traffic
```

#### 5.2 Async Processing Expansion ⭐⭐
```
Priority: HIGH
Risk if not done: Can't handle peak loads
Effort: 8-10 hours

Current: 6 queues
Enhancement: Add more for new workloads

New queues:
- `notifications` - Send notifications async
- `exports` - Generate CSV/PDF exports
- `reports` - Generate reports
- `indexing` - Search indexing
- `webhooks` - Outbound webhooks

Benefits:
- Instant API responses
- Background processing
- Better user experience
```

#### 5.3 Search & Analytics (ElasticSearch) ⭐⭐
```
Priority: MEDIUM
Risk if not done: Search is slow on 8.2M rows
Effort: 16-20 hours

Current: Database queries
Enhancement: Full-text search

Use cases:
1. Product search (by name, description, SKU)
2. Order search (by order ID, email, address)
3. Customer search (by name, email, phone)
4. Custom reports

Implementation:
- Add ElasticSearch container to docker-compose
- Index products, orders, customers
- Create search endpoints
- Update frontend search UI

Benefits:
- Sub-100ms full-text search
- Complex faceted search
- Analytics ready
```

---

## 📈 QUARTERLY PLAN

### Q1 2026 (Jan-Mar)
```
Week 1-2:   Phase 1 - Critical Stability
Week 3-4:   Phase 2 - Performance (order_items, indexes)
Week 5-6:   Phase 2 - Pagination Optimization
Week 7-8:   Phase 3 - Monitoring, Snapshot Progress
Week 9-10:  Phase 3 - Order Archiving Design
Week 11-12: Testing, Documentation, Release v1.2
```

### Q2 2026 (Apr-Jun)
```
Week 1-4:   Phase 4 - Advanced Inventory AI
Week 5-8:   Phase 4 - Customer Analytics
Week 9-12:  Phase 5 - Redis Caching
Testing, Refinement, Release v1.3
```

### Q3 2026 (Jul-Sep)
```
Week 1-4:   Phase 4 - Multi-Channel Support
Week 5-8:   Phase 5 - Async Processing Expansion
Week 9-12:  Phase 5 - ElasticSearch Integration
Testing, Refinement, Release v1.4
```

### Q4 2026 (Oct-Dec)
```
Week 1-4:   Advanced Features (TBD)
Week 5-8:   Integration Testing
Week 9-12:  Performance Tuning, Release v1.5
```

---

## 💰 EFFORT & ROI ESTIMATE

| Phase | Effort | Value | ROI | Timeline |
|-------|--------|-------|-----|----------|
| Phase 1 (Stability) | 12-15h | Critical | 10/10 | Week 1-2 |
| Phase 2 (Performance) | 20-25h | High | 9/10 | Week 3-4 |
| Phase 3 (Features) | 15-20h | Medium | 7/10 | Week 5-6 |
| Phase 4 (Strategic) | 40-50h | High | 8/10 | Week 7-12 |
| Phase 5 (Scale) | 35-45h | Medium | 6/10 | Week 9-12+ |

**Total**: 122-155 hours = ~3-4 person-months for full roadmap

---

## 🎯 SUCCESS METRICS

### Stability (Phase 1)
- ✅ Zero snapshot losses (retry mechanism)
- ✅ No duplicate job processing
- ✅ Daily backups automated

### Performance (Phase 2)
- ✅ API response time: < 200ms (p95)
- ✅ Order queries: < 1s even for large results
- ✅ Settings cache hit rate: > 95%

### Features (Phases 3-5)
- ✅ Monitoring dashboard deployed
- ✅ Snapshot progress visible
- ✅ Advanced inventory forecasting
- ✅ Customer analytics dashboard
- ✅ Multi-channel support

### Scale (Phase 5)
- ✅ Handle 10x traffic without slowdown
- ✅ Search sub-100ms responses
- ✅ Async processing 100% reliable

---

## 📋 NEXT STEPS

**Immediate (This Week)**
1. ✅ Complete code analysis (this document)
2. ✅ Define development workflow
3. ⏳ Get stakeholder approval on roadmap
4. ⏳ Allocate resources

**Week 1-2**
1. Start Phase 1 (Snapshot retry + Job locking)
2. Setup automated backups
3. Add settings cache

**Week 3-4**
1. Order items partitioning (complex!)
2. Missing indexes audit
3. Pagination optimization

**Week 5-6**
1. Monitoring dashboard
2. Snapshot progress tracking
3. Order archiving design

**Ongoing**
- Monitor production
- Implement learnings
- Iterate based on feedback
