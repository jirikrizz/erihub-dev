<?php

use Illuminate\Database\Migrations\Migration;
use Modules\Admin\Support\AdminSection;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

return new class extends Migration
{
    public function up(): void
    {
        AdminSection::ensurePermissionsExist();

        /** @var Permission|null $permission */
        $permission = Permission::where('name', 'section.settings.automation')->first();

        if (! $permission) {
            return;
        }

        Role::query()
            ->whereIn('name', ['admin'])
            ->get()
            ->each(function (Role $role) use ($permission) {
                if (! $role->hasPermissionTo($permission)) {
                    $role->givePermissionTo($permission);
                }
            });
    }

    public function down(): void
    {
        // We keep the permission to avoid breaking existing role assignments in rollbacks.
    }
};
