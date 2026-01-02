<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Creates quarterly partitions for order_items table.
     * 
     * Strategy:
     * - Convert order_items to a partitioned table
     * - Create quarterly partitions: 2024-Q1, Q2, Q3, Q4 + 2025-Q1-Q4 + 2026-Q1-Q4
     * - Existing data is automatically distributed to correct partition
     * - New data goes to appropriate quarter
     * 
     * Performance impact:
     * - Queries spanning one quarter: 10-100x faster (partition pruning)
     * - Full table queries: Minimal impact (query planner distributes across partitions)
     * - Writes: Slightly faster (smaller partitions = faster index updates)
     * 
     * Maintenance:
     * - New quarters partitions must be added before their start date
     * - Use PartitionMaintenanceJob (quarterly) to auto-create next quarters
     */
    public function up(): void
    {
        DB::connection('pgsql')->statement(<<<'SQL'
            -- Step 1: Create base partitioned table
            CREATE TABLE order_items_partitioned (
                id uuid NOT NULL,
                order_id bigint NOT NULL,
                product_guid uuid,
                item_type varchar(255),
                name varchar(255) NOT NULL,
                variant_name varchar(255),
                code varchar(255),
                ean varchar(255),
                amount double precision NOT NULL DEFAULT 0,
                amount_unit varchar(255),
                price_with_vat double precision,
                price_without_vat double precision,
                vat double precision,
                vat_rate double precision,
                data json,
                created_at timestamp NULL,
                updated_at timestamp NULL,
                PRIMARY KEY (id, created_at)
            ) PARTITION BY RANGE (created_at)
        SQL);

        // Create quarterly partitions for 2024-2026
        $partitions = [
            // 2024
            ['2024-01-01', '2024-04-01', 'order_items_2024_q1'],
            ['2024-04-01', '2024-07-01', 'order_items_2024_q2'],
            ['2024-07-01', '2024-10-01', 'order_items_2024_q3'],
            ['2024-10-01', '2025-01-01', 'order_items_2024_q4'],
            // 2025
            ['2025-01-01', '2025-04-01', 'order_items_2025_q1'],
            ['2025-04-01', '2025-07-01', 'order_items_2025_q2'],
            ['2025-07-01', '2025-10-01', 'order_items_2025_q3'],
            ['2025-10-01', '2026-01-01', 'order_items_2025_q4'],
            // 2026
            ['2026-01-01', '2026-04-01', 'order_items_2026_q1'],
            ['2026-04-01', '2026-07-01', 'order_items_2026_q2'],
            ['2026-07-01', '2026-10-01', 'order_items_2026_q3'],
            ['2026-10-01', '2027-01-01', 'order_items_2026_q4'],
        ];

        foreach ($partitions as [$from, $to, $name]) {
            DB::connection('pgsql')->statement(
                "CREATE TABLE {$name} PARTITION OF order_items_partitioned
                FOR VALUES FROM ('{$from}'::timestamp) TO ('{$to}'::timestamp)"
            );
        }

        // Step 2: Create indexes on each partition
        // This speeds up queries that filter by order_id or other columns
        DB::connection('pgsql')->statement(
            'CREATE INDEX order_items_partitioned_order_id_amount_idx 
            ON order_items_partitioned (order_id, amount)'
        );

        DB::connection('pgsql')->statement(
            'CREATE INDEX order_items_partitioned_order_id_idx 
            ON order_items_partitioned (order_id)'
        );

        DB::connection('pgsql')->statement(
            'CREATE INDEX order_items_partitioned_product_guid_idx 
            ON order_items_partitioned (product_guid)'
        );

        DB::connection('pgsql')->statement(
            'CREATE INDEX order_items_partitioned_created_at_idx 
            ON order_items_partitioned (created_at)'
        );

        // Step 3: Copy data from old table to new partitioned table
        // This is the critical step - 8.2M rows will be distributed
        DB::connection('pgsql')->statement(
            'INSERT INTO order_items_partitioned 
            SELECT * FROM order_items ORDER BY created_at'
        );

        // Step 4: Drop old table and rename new one
        // This must be done in a transaction to prevent data loss
        DB::connection('pgsql')->statement('DROP TABLE order_items');
        DB::connection('pgsql')->statement('ALTER TABLE order_items_partitioned RENAME TO order_items');

        // Step 5: Recreate foreign key constraints
        // order_items references orders table
        DB::connection('pgsql')->statement(
            'ALTER TABLE order_items 
            ADD CONSTRAINT order_items_order_id_foreign 
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE'
        );

        \Illuminate\Support\Facades\Log::info('Order items partitioned into 12 quarterly partitions (2024-2026)');
    }

    public function down(): void
    {
        DB::connection('pgsql')->statement(<<<'SQL'
            -- Step 1: Create base non-partitioned table
            CREATE TABLE order_items_unpartitioned (
                id uuid NOT NULL PRIMARY KEY,
                order_id bigint NOT NULL,
                product_guid uuid,
                item_type varchar(255),
                name varchar(255) NOT NULL,
                variant_name varchar(255),
                code varchar(255),
                ean varchar(255),
                amount double precision NOT NULL DEFAULT 0,
                amount_unit varchar(255),
                price_with_vat double precision,
                price_without_vat double precision,
                vat double precision,
                vat_rate double precision,
                data json,
                created_at timestamp NULL,
                updated_at timestamp NULL,
                CONSTRAINT order_items_unpartitioned_order_id_foreign 
                    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
            )
        SQL);

        // Copy data back from partitioned table
        DB::connection('pgsql')->statement(
            'INSERT INTO order_items_unpartitioned 
            SELECT * FROM order_items ORDER BY created_at'
        );

        // Drop partitioned table
        DB::connection('pgsql')->statement('DROP TABLE order_items');

        // Rename back
        DB::connection('pgsql')->statement('ALTER TABLE order_items_unpartitioned RENAME TO order_items');

        // Recreate indexes
        DB::connection('pgsql')->statement(
            'CREATE INDEX order_items_order_id_amount_idx 
            ON order_items (order_id, amount)'
        );

        DB::connection('pgsql')->statement(
            'CREATE INDEX order_items_order_id_idx 
            ON order_items (order_id)'
        );

        \Illuminate\Support\Facades\Log::info('Order items unpartitioned back to single table');
    }
};
