<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Collection;
use Modules\Pim\Models\CategoryNode;
use Modules\Pim\Models\ShopCategoryNode;

class CategorySyncResult
{
    /**
     * @param Collection<int, array<string, mixed>> $categories
     * @param array<int, CategoryNode> $canonicalNodes
     * @param array<int, ShopCategoryNode> $shopNodes
     */
    public function __construct(
        public readonly Collection $categories,
        public readonly array $canonicalNodes,
        public readonly array $shopNodes
    ) {
    }
}
