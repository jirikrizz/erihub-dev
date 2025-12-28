<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Modules\Admin\Support\AdminSection;
use Spatie\Permission\Models\Permission;

return new class extends Migration
{
    public function up(): void
    {
        AdminSection::ensurePermissionsExist();

        /** @var Permission|null $inventoryAi */
        $inventoryAi = Permission::where('name', 'section.settings.inventory-ai')->first();
        /** @var Permission|null $inventoryRecommendations */
        $inventoryRecommendations = Permission::where('name', 'section.settings.inventory-recommendations')->first();

        if (! $inventoryAi || ! $inventoryRecommendations) {
            return;
        }

        $roleIds = DB::table('role_has_permissions')
            ->where('permission_id', $inventoryAi->id)
            ->pluck('role_id')
            ->all();

        if ($roleIds !== []) {
            $rows = array_map(
                fn ($roleId) => ['role_id' => $roleId, 'permission_id' => $inventoryRecommendations->id],
                $roleIds
            );

            DB::table('role_has_permissions')->insertOrIgnore($rows);
        }

        $models = DB::table('model_has_permissions')
            ->where('permission_id', $inventoryAi->id)
            ->get(['model_type', 'model_id']);

        if ($models->isNotEmpty()) {
            $rows = $models->map(fn ($record) => [
                'model_type' => $record->model_type,
                'model_id' => $record->model_id,
                'permission_id' => $inventoryRecommendations->id,
            ])->all();

            DB::table('model_has_permissions')->insertOrIgnore($rows);
        }
    }

    public function down(): void
    {
        $inventoryRecommendations = Permission::where('name', 'section.settings.inventory-recommendations')->first();

        if (! $inventoryRecommendations) {
            return;
        }

        DB::table('role_has_permissions')
            ->where('permission_id', $inventoryRecommendations->id)
            ->delete();

        DB::table('model_has_permissions')
            ->where('permission_id', $inventoryRecommendations->id)
            ->delete();

        $inventoryRecommendations->delete();
    }
};
