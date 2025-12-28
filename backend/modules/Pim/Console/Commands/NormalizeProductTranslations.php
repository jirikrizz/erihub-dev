<?php

namespace Modules\Pim\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Facades\DB;
use Modules\Pim\Models\ProductTranslation;

class NormalizeProductTranslations extends Command
{
    protected $signature = 'pim:translations:normalize
        {--product-id= : Limit normalization to a specific product}
        {--locale= : Limit normalization to a specific locale}
        {--dry-run : Only report what would change}';

    protected $description = 'Assign shop IDs to legacy product translations and merge duplicate records.';

    private int $updated = 0;
    private int $merged = 0;
    private int $deleted = 0;

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $query = ProductTranslation::query()
            ->with(['product.shop'])
            ->orderBy('product_id');

        if ($productId = $this->option('product-id')) {
            $query->where('product_id', $productId);
        }

        if ($locale = $this->option('locale')) {
            $query->where('locale', $locale);
        }

        $query->chunkById(100, function (EloquentCollection $translations) use ($dryRun) {
            $translations->each(function (ProductTranslation $translation) use ($dryRun) {
                $product = $translation->product;
                $shop = $product?->shop;

                if (! $product || ! $shop) {
                    return;
                }

                $targetShopId = $translation->shop_id ?? $shop->id;

                if ($targetShopId === null) {
                    return;
                }

                if ($translation->shop_id === null) {
                    $this->assignShopId($translation, $targetShopId, $shop->is_master, $product->base_locale, $dryRun);

                    return;
                }

                if ($shop->is_master && $translation->locale === $product->base_locale) {
                    $this->ensureMasterSynced($translation, $dryRun);

                    return;
                }

                if (! $shop->is_master && $translation->status === 'synced') {
                    $this->setStatus($translation, 'draft', $dryRun);
                }
            });
        });

        $this->info(sprintf(
            'Done. updated=%d, merged=%d, removed=%d%s',
            $this->updated,
            $this->merged,
            $this->deleted,
            $dryRun ? ' (dry-run)' : ''
        ));

        return self::SUCCESS;
    }

    private function assignShopId(
        ProductTranslation $translation,
        int $shopId,
        bool $isMasterShop,
        ?string $baseLocale,
        bool $dryRun
    ): void
    {
        $existing = ProductTranslation::query()
            ->where('product_id', $translation->product_id)
            ->where('shop_id', $shopId)
            ->where('locale', $translation->locale)
            ->where('id', '!=', $translation->id)
            ->first();

        if ($existing) {
            $this->mergeTranslations($existing, $translation, $isMasterShop, $baseLocale, $dryRun);

            return;
        }

        if ($dryRun) {
            $this->line(sprintf(
                '[assign] product=%s locale=%s set shop_id=%d (was null)',
                $translation->product_id,
                $translation->locale,
                $shopId
            ));
            $this->updated++;

            return;
        }

        DB::transaction(function () use ($translation, $shopId, $isMasterShop, $baseLocale) {
            $translation->shop_id = $shopId;

            if (! $isMasterShop && $translation->status === 'synced') {
                $translation->status = 'draft';
            }

            if ($isMasterShop && $baseLocale && $translation->locale === $baseLocale) {
                $translation->status = 'synced';
            }

            $translation->save();
        });

        $this->updated++;
    }

    private function mergeTranslations(
        ProductTranslation $target,
        ProductTranslation $duplicate,
        bool $isMasterShop,
        ?string $baseLocale,
        bool $dryRun
    ): void {
        if ($dryRun) {
            $this->line(sprintf(
                '[merge] product=%s locale=%s target=%s duplicate=%s',
                $target->product_id,
                $target->locale,
                $target->id,
                $duplicate->id
            ));
            $this->merged++;
            $this->deleted++;

            return;
        }

        DB::transaction(function () use ($target, $duplicate, $isMasterShop, $baseLocale) {
            foreach (['name', 'short_description', 'description'] as $attribute) {
                if (! $target->{$attribute} && $duplicate->{$attribute}) {
                    $target->{$attribute} = $duplicate->{$attribute};
                }
            }

            foreach (['parameters', 'seo'] as $jsonAttribute) {
                if (empty($target->{$jsonAttribute}) && ! empty($duplicate->{$jsonAttribute})) {
                    $target->{$jsonAttribute} = $duplicate->{$jsonAttribute};
                }
            }

            if (! $isMasterShop && $target->status === 'synced') {
                $target->status = 'draft';
            }

            if ($isMasterShop && $baseLocale && $target->locale === $baseLocale) {
                $target->status = 'synced';
            }

            $target->touch();
            $target->save();

            $duplicate->delete();
        });

        $this->merged++;
        $this->deleted++;
    }

    private function ensureMasterSynced(ProductTranslation $translation, bool $dryRun): void
    {
        if ($translation->status === 'synced') {
            return;
        }

        if ($dryRun) {
            $this->line(sprintf(
                '[status] product=%s locale=%s status %s -> synced',
                $translation->product_id,
                $translation->locale,
                $translation->status
            ));
            $this->updated++;

            return;
        }

        DB::transaction(function () use ($translation) {
            $translation->status = 'synced';
            $translation->save();
        });

        $this->updated++;
    }

    private function setStatus(ProductTranslation $translation, string $status, bool $dryRun): void
    {
        if ($translation->status === $status) {
            return;
        }

        if ($dryRun) {
            $this->line(sprintf(
                '[status] product=%s locale=%s status %s -> %s',
                $translation->product_id,
                $translation->locale,
                $translation->status,
                $status
            ));
            $this->updated++;

            return;
        }

        DB::transaction(function () use ($translation, $status) {
            $translation->status = $status;
            $translation->save();
        });

        $this->updated++;
    }
}
