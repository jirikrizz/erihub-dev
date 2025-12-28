<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Modules\Admin\Support\AdminSection;
use Spatie\Permission\Models\Role;
use Database\Seeders\ShoptetPluginTemplateSeeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        AdminSection::ensurePermissionsExist();

        $roles = collect(['admin', 'translator', 'viewer'])->mapWithKeys(fn ($role) => [
            $role => Role::firstOrCreate(['name' => $role]),
        ]);

        $roles['admin']->syncPermissions(AdminSection::permissionNames());

        $roles['translator']->syncPermissions([
            AdminSection::permissionFor('dashboard'),
            AdminSection::permissionFor('notifications'),
            AdminSection::permissionFor('products'),
            AdminSection::permissionFor('tasks'),
        ]);

        $roles['viewer']->syncPermissions([
            AdminSection::permissionFor('dashboard'),
            AdminSection::permissionFor('notifications'),
            AdminSection::permissionFor('analytics'),
            AdminSection::permissionFor('inventory'),
            AdminSection::permissionFor('orders'),
            AdminSection::permissionFor('customers'),
            AdminSection::permissionFor('products'),
        ]);

        $admin = User::firstOrCreate(
            ['email' => 'admin@example.com'],
            [
                'name' => 'Admin User',
                'password' => Hash::make('secret'),
            ]
        );

        $admin->assignRole($roles['admin']);

        $this->call(ShoptetPluginTemplateSeeder::class);
    }
}
