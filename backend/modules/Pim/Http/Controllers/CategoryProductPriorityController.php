<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Validation\Rule;
use Modules\Pim\Services\CategoryProductPriorityAiService;
use Modules\Pim\Services\CategoryProductPriorityService;
use Modules\Shoptet\Models\Shop;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Arr;
use Throwable;
use RuntimeException;

class CategoryProductPriorityController extends Controller
{
    public function __construct(
        private readonly CategoryProductPriorityService $service,
        private readonly CategoryProductPriorityAiService $aiService
    )
    {
    }

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'category_guid' => ['required', 'string', 'max:255'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);
        $page = (int) ($validated['page'] ?? 1);
        $perPage = (int) ($validated['per_page'] ?? 20);

        try {
            $result = $this->service->fetch($shop, $validated['category_guid'], $page, $perPage);

            return response()->json($result);
        } catch (RequestException $exception) {
            $response = $exception->response;
            $status = $response?->status() ?? 502;
            $body = $response?->json();
            $errors = is_array($body) ? (Arr::get($body, 'errors', []) ?? []) : [];
            $message = $errors[0]['message'] ?? $exception->getMessage() ?? 'Shoptet vrátil chybu.';

            return response()->json([
                'message' => $message,
                'errors' => $errors,
            ], $status);
        } catch (Throwable $throwable) {
            report($throwable);
            abort(502, 'Nepodařilo se načíst prioritizaci produktů ze Shoptetu. Zkus to prosím znovu.');
        }
    }

    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'category_guid' => ['required', 'string', 'max:255'],
            'updates' => ['required', 'array', 'min:1'],
            'updates.*.product_guid' => ['required', 'string', 'max:255'],
            'updates.*.priority' => ['nullable', 'integer'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);

        try {
            $result = $this->service->update($shop, $validated['category_guid'], $validated['updates']);

            return response()->json($result);
        } catch (RequestException $exception) {
            $response = $exception->response;
            $status = $response?->status() ?? 502;
            $body = $response?->json();
            $errors = is_array($body) ? (Arr::get($body, 'errors', []) ?? []) : [];
            $message = $errors[0]['message'] ?? $exception->getMessage() ?? 'Shoptet vrátil chybu.';

            return response()->json([
                'message' => $message,
                'errors' => $errors,
            ], $status);
        } catch (Throwable $throwable) {
            report($throwable);
            abort(502, 'Nepodařilo se uložit priority v Shoptetu. Zkus to prosím znovu.');
        }
    }

    public function evaluateAi(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'shop_id' => ['required', 'integer', Rule::exists('shops', 'id')],
            'category_guid' => ['required', 'string', 'max:255'],
            'pages' => ['sometimes', 'integer', 'min:1', 'max:5'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:50'],
        ]);

        /** @var Shop $shop */
        $shop = Shop::query()->findOrFail((int) $validated['shop_id']);
        $pages = isset($validated['pages']) ? (int) $validated['pages'] : 2;
        $perPage = isset($validated['per_page']) ? (int) $validated['per_page'] : 20;

        try {
            $result = $this->aiService->evaluate($shop, $validated['category_guid'], $pages, $perPage);

            return response()->json($result);
        } catch (RuntimeException $exception) {
            $message = $exception->getMessage();

            if ($message === 'OpenAI API key is not configured.') {
                $message = 'OpenAI API klíč není uložen. Přidej ho v Nastavení → Překládání.';
            }

            return response()->json(['message' => $message], 422);
        } catch (Throwable $throwable) {
            report($throwable);

            abort(502, 'Nepodařilo se získat AI doporučení priorit. Zkus to prosím znovu.');
        }
    }
}
