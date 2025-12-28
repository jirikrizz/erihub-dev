<?php

namespace Modules\Pim\Services;

use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Shoptet\Models\Shop;

class ShopCategoryTreeService
{
    public function createNode(Shop $shop, array $attributes): ShopCategoryNode
    {
        return DB::transaction(function () use ($shop, $attributes) {
            $parent = $this->resolveParent($shop, Arr::get($attributes, 'parent_id'));

            $node = new ShopCategoryNode();
            $node->id = (string) Str::uuid();
            $node->shop_id = $shop->id;
            $node->remote_guid = Arr::get($attributes, 'remote_guid', (string) Str::uuid());
            $node->remote_id = Arr::get($attributes, 'remote_id');
            $node->name = Arr::get($attributes, 'name');
            $node->slug = Arr::get($attributes, 'slug');
            $node->position = (int) ($attributes['position'] ?? $this->nextPosition($shop, $parent));
            $node->parent_id = $parent?->id;
            $node->parent_guid = $parent?->remote_guid;
            $incomingData = Arr::get($attributes, 'data');
            $incomingData = is_array($incomingData) ? $incomingData : [];
            $existingData = is_array($node->data) ? $node->data : [];

            if (! isset($incomingData['widgets']) && isset($existingData['widgets'])) {
                $incomingData['widgets'] = $existingData['widgets'];
            }

            if (! isset($incomingData['_hub']) && isset($existingData['_hub'])) {
                $incomingData['_hub'] = $existingData['_hub'];
            }

            $node->data = array_replace_recursive($existingData, $incomingData);
            $node->visible = array_key_exists('visible', $attributes) ? (bool) $attributes['visible'] : true;
            $node->customer_visibility = Arr::get($attributes, 'customer_visibility');
            $node->product_ordering = Arr::get($attributes, 'product_ordering');
            $node->url = Arr::get($attributes, 'url');
            $node->index_name = Arr::get($attributes, 'index_name');
            $node->image = Arr::get($attributes, 'image');
            $node->menu_title = Arr::get($attributes, 'menu_title');
            $node->title = Arr::get($attributes, 'title');
            $node->meta_description = Arr::get($attributes, 'meta_description');
            $node->description = Arr::get($attributes, 'description');
            $node->second_description = Arr::get($attributes, 'second_description');
            $node->similar_category_guid = Arr::get($attributes, 'similar_category_guid');
            $node->related_category_guid = Arr::get($attributes, 'related_category_guid');
            $node->save();

            $this->recalculatePaths($node);

            return $node->fresh();
        });
    }

    public function updateNode(ShopCategoryNode $node, array $attributes): ShopCategoryNode
    {
        return DB::transaction(function () use ($node, $attributes) {
            $shop = $node->shop;

            if (array_key_exists('parent_id', $attributes)) {
                $parent = $this->resolveParent($shop, $attributes['parent_id'] ?? null);
                $this->assertNotDescendant($node, $parent);
                $node->parent_id = $parent?->id;
                $node->parent_guid = $parent?->remote_guid;
            }

            if (array_key_exists('name', $attributes)) {
                $node->name = Arr::get($attributes, 'name', $node->name);
            }

            if (array_key_exists('slug', $attributes)) {
                $node->slug = Arr::get($attributes, 'slug', $node->slug);
            }

            if (array_key_exists('position', $attributes)) {
                $node->position = (int) $attributes['position'];
            }

            if (array_key_exists('data', $attributes)) {
                $incomingData = Arr::get($attributes, 'data');
                $incomingData = is_array($incomingData) ? $incomingData : [];
                $existingData = is_array($node->data) ? $node->data : [];

                if (! isset($incomingData['widgets']) && isset($existingData['widgets'])) {
                    $incomingData['widgets'] = $existingData['widgets'];
                }

                if (! isset($incomingData['_hub']) && isset($existingData['_hub'])) {
                    $incomingData['_hub'] = $existingData['_hub'];
                }

                $node->data = array_replace_recursive($existingData, $incomingData);
            }

            if (array_key_exists('visible', $attributes)) {
                $node->visible = (bool) $attributes['visible'];
            }

            if (array_key_exists('customer_visibility', $attributes)) {
                $node->customer_visibility = Arr::get($attributes, 'customer_visibility');
            }

            if (array_key_exists('product_ordering', $attributes)) {
                $node->product_ordering = Arr::get($attributes, 'product_ordering');
            }

            if (array_key_exists('url', $attributes)) {
                $node->url = Arr::get($attributes, 'url');
            }

            if (array_key_exists('index_name', $attributes)) {
                $node->index_name = Arr::get($attributes, 'index_name');
            }

            if (array_key_exists('image', $attributes)) {
                $node->image = Arr::get($attributes, 'image');
            }

            if (array_key_exists('menu_title', $attributes)) {
                $node->menu_title = Arr::get($attributes, 'menu_title');
            }

            if (array_key_exists('title', $attributes)) {
                $node->title = Arr::get($attributes, 'title');
            }

            if (array_key_exists('meta_description', $attributes)) {
                $node->meta_description = Arr::get($attributes, 'meta_description');
            }

            if (array_key_exists('description', $attributes)) {
                $node->description = Arr::get($attributes, 'description');
            }

            if (array_key_exists('second_description', $attributes)) {
                $node->second_description = Arr::get($attributes, 'second_description');
            }

            if (array_key_exists('similar_category_guid', $attributes)) {
                $node->similar_category_guid = Arr::get($attributes, 'similar_category_guid');
            }

            if (array_key_exists('related_category_guid', $attributes)) {
                $node->related_category_guid = Arr::get($attributes, 'related_category_guid');
            }

            $node->save();

            $this->recalculatePaths($node);

            return $node->fresh();
        });
    }

    public function deleteNodeWithChildren(ShopCategoryNode $node): void
    {
        DB::transaction(function () use ($node) {
            $ids = $this->collectDescendantIds($node);
            $ids[] = $node->id;

            ShopCategoryNode::query()
                ->whereIn('id', $ids)
                ->delete();
        });
    }

    private function nextPosition(Shop $shop, ?ShopCategoryNode $parent): int
    {
        return (int) ShopCategoryNode::query()
            ->where('shop_id', $shop->id)
            ->where('parent_id', $parent?->id)
            ->max('position') + 1;
    }

    private function resolveParent(Shop $shop, ?string $parentId): ?ShopCategoryNode
    {
        if (! $parentId) {
            return null;
        }

        $parent = ShopCategoryNode::query()
            ->where('id', $parentId)
            ->where('shop_id', $shop->id)
            ->first();

        if (! $parent) {
            throw new \InvalidArgumentException('Parent category not found for this shop.');
        }

        return $parent;
    }

    private function recalculatePaths(ShopCategoryNode $node): void
    {
        $node->path = $this->buildPath($node);
        $node->save();

        $node->load('children');

        foreach ($node->children as $child) {
            $child->parent_guid = $node->remote_guid;
            $child->save();
            $this->recalculatePaths($child);
        }
    }

    private function buildPath(ShopCategoryNode $node): ?string
    {
        $names = [];
        $current = $node;
        $guard = 0;

        while ($current && $guard < 50) {
            $names[] = trim((string) $current->name);
            $current->loadMissing('parent');
            $current = $current->parent;
            $guard++;
        }

        $names = array_reverse(array_filter($names));

        return $names === [] ? null : implode(' > ', $names);
    }

    private function collectDescendantIds(ShopCategoryNode $node): array
    {
        $children = ShopCategoryNode::query()
            ->where('parent_id', $node->id)
            ->get();

        if ($children->isEmpty()) {
            return [];
        }

        return $children
            ->flatMap(function (ShopCategoryNode $child) {
                return [$child->id, ...$this->collectDescendantIds($child)];
            })
            ->values()
            ->all();
    }

    private function assertNotDescendant(ShopCategoryNode $node, ?ShopCategoryNode $parent): void
    {
        if (! $parent) {
            return;
        }

        $current = $parent;
        $guard = 0;

        while ($current && $guard < 50) {
            if ($current->id === $node->id) {
                throw new \InvalidArgumentException('Kategorie nemůže být přesunuta pod samu sebe.');
            }

            $current->loadMissing('parent');
            $current = $current->parent;
            $guard++;
        }
    }
}
