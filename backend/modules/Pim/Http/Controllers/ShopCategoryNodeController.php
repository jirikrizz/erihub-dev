<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Modules\Pim\Models\ShopCategoryNode;
use Modules\Pim\Services\AiCategoryContentService;
use Modules\Pim\Services\AiCategoryTranslationService;
use Modules\Pim\Services\CategoryDownloadService;
use Modules\Pim\Services\ShopCategoryTreeService;
use Modules\Shoptet\Contracts\ShoptetClient;
use Modules\Shoptet\Models\Shop;
use Throwable;

class ShopCategoryNodeController extends Controller
{
    public function __construct(
        private readonly CategoryDownloadService $downloadService,
        private readonly ShopCategoryTreeService $treeService,
        private readonly AiCategoryContentService $aiCategoryContent,
        private readonly AiCategoryTranslationService $aiCategoryTranslation,
        private readonly ShoptetClient $shoptetClient
    ) {
    }

    public function sync(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        $this->downloadService->downloadAndSync($shop);

        $syncedAt = now()->toIso8601String();

        return response()->json([
            'message' => 'Kategorie byly úspěšně synchronizovány.',
            'synced_at' => $syncedAt,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'parent_id' => ['nullable', 'uuid', 'exists:shop_category_nodes,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => ['nullable', 'string', 'max:255'],
            'position' => ['nullable', 'integer', 'min:0'],
            'visible' => ['sometimes', 'boolean'],
            'customer_visibility' => ['nullable', Rule::in(['all', 'registered', 'unregistered'])],
            'product_ordering' => ['nullable', 'string', 'max:64'],
            'url' => ['nullable', 'string', 'max:2048'],
            'index_name' => ['nullable', 'string', 'max:255'],
            'image' => ['nullable', 'string', 'max:2048'],
            'menu_title' => ['nullable', 'string', 'max:255'],
            'title' => ['nullable', 'string', 'max:255'],
            'meta_description' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'second_description' => ['nullable', 'string'],
            'similar_category_guid' => ['nullable', 'string', 'max:255'],
            'related_category_guid' => ['nullable', 'string', 'max:255'],
            'data' => ['sometimes', 'array'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        try {
            $node = $this->treeService->createNode($shop, $validated);
        } catch (\InvalidArgumentException $exception) {
            throw ValidationException::withMessages([
                'parent_id' => $exception->getMessage(),
            ]);
        }

        return response()->json($this->serializeNode($node), 201);
    }

    public function update(Request $request, ShopCategoryNode $node): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'parent_id' => ['nullable', 'uuid', 'exists:shop_category_nodes,id'],
            'name' => ['sometimes', 'string', 'max:255'],
            'slug' => ['sometimes', 'nullable', 'string', 'max:255'],
            'position' => ['sometimes', 'integer', 'min:0'],
            'visible' => ['sometimes', 'boolean'],
            'customer_visibility' => ['sometimes', 'nullable', Rule::in(['all', 'registered', 'unregistered'])],
            'product_ordering' => ['sometimes', 'nullable', 'string', 'max:64'],
            'url' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'index_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'image' => ['sometimes', 'nullable', 'string', 'max:2048'],
            'menu_title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'meta_description' => ['sometimes', 'nullable', 'string'],
            'description' => ['sometimes', 'nullable', 'string'],
            'second_description' => ['sometimes', 'nullable', 'string'],
            'similar_category_guid' => ['sometimes', 'nullable', 'string', 'max:255'],
            'related_category_guid' => ['sometimes', 'nullable', 'string', 'max:255'],
            'data' => ['sometimes', 'array'],
        ]);

        if ($node->shop_id !== (int) $validated['shop_id']) {
            abort(403, 'Nemáš oprávnění upravovat tuto kategorii.');
        }

        try {
            $updated = $this->treeService->updateNode($node, $validated);
        } catch (\InvalidArgumentException $exception) {
            throw ValidationException::withMessages([
                'parent_id' => $exception->getMessage(),
            ]);
        }

        return response()->json($this->serializeNode($updated));
    }

    public function destroy(Request $request, ShopCategoryNode $node): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
        ]);

        if ($node->shop_id !== (int) $validated['shop_id']) {
            abort(403, 'Nemáš oprávnění mazat tuto kategorii.');
        }

        $this->treeService->deleteNodeWithChildren($node);

        return response()->json(['message' => 'Kategorie byla odstraněna.']);
    }

    public function generateAiContent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'category_id' => ['nullable', 'uuid', 'exists:shop_category_nodes,id'],
            'parent_id' => ['nullable', 'uuid', 'exists:shop_category_nodes,id'],
            'name' => ['nullable', 'string', 'max:255'],
            'path' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'second_description' => ['nullable', 'string'],
            'meta_description' => ['nullable', 'string'],
            'menu_title' => ['nullable', 'string', 'max:255'],
            'title' => ['nullable', 'string', 'max:255'],
            'context_notes' => ['nullable', 'string'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        $node = null;
        if (! empty($validated['category_id'])) {
            $node = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->findOrFail($validated['category_id']);
        }

        $categoryName = $validated['name'] ?? $node?->name ?? '';
        $categoryPath = $validated['path'] ?? $node?->path ?? $categoryName;
        if (! $categoryPath && $node) {
            $categoryPath = $this->buildPathFromAncestors($node);
        }

        $category = [
            'name' => $categoryName,
            'path' => $categoryPath,
            'description' => $validated['description'] ?? $node?->description,
            'second_description' => $validated['second_description'] ?? $node?->second_description,
            'meta_description' => $validated['meta_description'] ?? $node?->meta_description,
            'menu_title' => $validated['menu_title'] ?? $node?->menu_title,
            'title' => $validated['title'] ?? $node?->title,
        ];

        $siblings = [];
        $children = [];

        if ($node) {
            $siblings = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->where('parent_id', $node->parent_id)
                ->where('id', '!=', $node->id)
                ->limit(10)
                ->pluck('name')
                ->filter()
                ->values()
                ->all();

            $children = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->where('parent_id', $node->id)
                ->limit(10)
                ->pluck('name')
                ->filter()
                ->values()
                ->all();
        } elseif (! empty($validated['parent_id'])) {
            $parent = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->findOrFail($validated['parent_id']);

            $siblings = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->where('parent_id', $parent->id)
                ->limit(10)
                ->pluck('name')
                ->filter()
                ->values()
                ->all();
        }

        $topCategories = ShopCategoryNode::query()
            ->where('shop_id', $shop->id)
            ->whereNull('parent_id')
            ->limit(15)
            ->pluck('name')
            ->filter()
            ->values()
            ->all();

        $context = [
            'siblings' => $siblings,
            'children' => $children,
            'top_categories' => $topCategories,
            'custom_notes' => $validated['context_notes'] ?? null,
        ];

        $result = $this->aiCategoryContent->generate($shop, $category, $context);

        return response()->json($result);
    }

    public function translateAiContent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'category_id' => ['nullable', 'uuid', 'exists:shop_category_nodes,id'],
            'source_locale' => ['nullable', 'string', 'max:8'],
            'target_locale' => ['required', 'string', 'max:8'],
            'fields' => ['required', 'array', 'min:1'],
            'fields.*' => ['nullable', 'string'],
            'context_notes' => ['nullable', 'string'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        $node = null;
        if (! empty($validated['category_id'])) {
            $node = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->findOrFail($validated['category_id']);
        }

        $category = [
            'name' => $node?->name,
            'path' => $node?->path ?? ($node ? $this->buildPathFromAncestors($node) : null),
            'description' => $node?->description,
            'second_description' => $node?->second_description,
            'meta_description' => $node?->meta_description,
            'menu_title' => $node?->menu_title,
            'title' => $node?->title,
        ];

        $fields = array_filter(
            $validated['fields'],
            static fn ($value) => $value !== null && $value !== ''
        );

        if (empty($fields)) {
            throw ValidationException::withMessages([
                'fields' => 'Zadej prosím alespoň jedno pole k překladu.',
            ]);
        }

        $context = [
            'custom_notes' => $validated['context_notes'] ?? null,
        ];

        if ($node) {
            $context['siblings'] = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->where('parent_id', $node->parent_id)
                ->where('id', '!=', $node->id)
                ->limit(10)
                ->pluck('name')
                ->filter()
                ->values()
                ->all();

            $context['children'] = ShopCategoryNode::query()
                ->where('shop_id', $shop->id)
                ->where('parent_id', $node->id)
                ->limit(10)
                ->pluck('name')
                ->filter()
                ->values()
                ->all();
        }

        try {
            $result = $this->aiCategoryTranslation->translate(
                $shop,
                $fields,
                $validated['target_locale'],
                $validated['source_locale'] ?? null,
                $category,
                $context
            );
        } catch (\RuntimeException $exception) {
            throw ValidationException::withMessages([
                'fields' => $exception->getMessage(),
            ]);
        } catch (\Throwable $throwable) {
            report($throwable);
            abort(500, 'AI překladač je dočasně nedostupný. Zkus to prosím znovu.');
        }

        return response()->json($result);
    }

    public function push(Request $request, ShopCategoryNode $node): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'description' => ['nullable', 'string'],
            'second_description' => ['nullable', 'string'],
        ]);

        if ($node->shop_id !== (int) $validated['shop_id']) {
            abort(403, 'Nemáš oprávnění upravovat tuto kategorii.');
        }

        if (! $node->remote_guid) {
            abort(422, 'Kategorie zatím nemá přiřazené GUID ze Shoptetu.');
        }

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        $description = $this->normalizeDescription($validated['description'] ?? null);
        $secondDescription = $this->normalizeDescription($validated['second_description'] ?? null);

        try {
            $shoptetResponse = $this->shoptetClient->updateCategory($shop, $node->remote_guid, [
                'description' => $description,
                'secondDescription' => $secondDescription,
            ]);
        } catch (Throwable $throwable) {
            report($throwable);

            abort(502, 'Nepodařilo se odeslat kategorii do Shoptetu. Zkus to prosím znovu.');
        }

        $updatedNode = $this->treeService->updateNode($node, [
            'description' => $description,
            'second_description' => $secondDescription,
        ]);

        return response()->json([
            'message' => 'Kategorie byla odeslána do Shoptetu.',
            'category' => $this->serializeNode($updatedNode),
            'shoptet' => $shoptetResponse,
        ]);
    }

    private function normalizeDescription(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return $trimmed === '' ? null : $trimmed;
    }

    private function buildPathFromAncestors(ShopCategoryNode $node): string
    {
        $segments = [];
        $current = $node;
        $guard = 0;

        while ($current && $guard < 50) {
            $segments[] = trim((string) $current->name);
            $current->loadMissing('parent');
            $current = $current->parent;
            $guard++;
        }

        $segments = array_reverse(array_filter($segments));

        return $segments === [] ? $node->name : implode(' > ', $segments);
    }

    private function serializeNode(ShopCategoryNode $node): array
    {
        return [
            'id' => $node->id,
            'shop_id' => $node->shop_id,
            'parent_id' => $node->parent_id,
            'remote_guid' => $node->remote_guid,
            'remote_id' => $node->remote_id,
            'parent_guid' => $node->parent_guid,
            'name' => $node->name,
            'slug' => $node->slug,
            'position' => $node->position,
            'path' => $node->path,
            'data' => $node->data,
            'visible' => $node->visible,
            'customer_visibility' => $node->customer_visibility,
            'product_ordering' => $node->product_ordering,
            'url' => $node->url,
            'index_name' => $node->index_name,
            'image' => $node->image,
            'menu_title' => $node->menu_title,
            'title' => $node->title,
            'meta_description' => $node->meta_description,
            'description' => $node->description,
            'second_description' => $node->second_description,
            'similar_category_guid' => $node->similar_category_guid,
            'related_category_guid' => $node->related_category_guid,
            'created_at' => $node->created_at?->toIso8601String(),
            'updated_at' => $node->updated_at?->toIso8601String(),
        ];
    }
}
