<?php

namespace Modules\Admin\Support;

use App\Models\User;
use Illuminate\Support\Collection;
use InvalidArgumentException;
use Spatie\Permission\Models\Permission;

class AdminSection
{
    /**
     * @var array<string, array{label: string, description: string, permission: string}>
     */
    private const SECTIONS = [
        'dashboard' => [
            'label' => 'Dashboard',
            'description' => 'Přehled klíčových ukazatelů a systémových notifikací.',
            'permission' => 'section.dashboard',
        ],
        'notifications' => [
            'label' => 'Notifikace',
            'description' => 'Centrum systémových upozornění a auditních logů.',
            'permission' => 'section.notifications',
        ],
        'inventory' => [
            'label' => 'Inventář',
            'description' => 'Správa skladových zásob a jejich synchronizace.',
            'permission' => 'section.inventory',
        ],
        'orders' => [
            'label' => 'Objednávky',
            'description' => 'Přístup k objednávkám a jejich detailům.',
            'permission' => 'section.orders',
        ],
        'products' => [
            'label' => 'Produkty',
            'description' => 'Produktový katalog, překlady a řazení v kategoriích.',
            'permission' => 'section.products',
        ],
        'microsites' => [
            'label' => 'Microshopy',
            'description' => 'Návrh a publikace kurátorovaných mini e-shopů.',
            'permission' => 'section.microsites',
        ],
        'categories.mapping' => [
            'label' => 'Mapování kategorií',
            'description' => 'Propojení master kategorií s kategoriemi jednotlivých shopů.',
            'permission' => 'section.categories.mapping',
        ],
        'categories.tree' => [
            'label' => 'Kategorický strom',
            'description' => 'Správa stromu kategorií jednotlivých shopů.',
            'permission' => 'section.categories',
        ],
        'tasks' => [
            'label' => 'Úkoly',
            'description' => 'Interní úkoly a procesní checklisty.',
            'permission' => 'section.tasks',
        ],
        'analytics' => [
            'label' => 'Analytika',
            'description' => 'Reporty a metriky Commerce HUBu.',
            'permission' => 'section.analytics',
        ],
        'customers' => [
            'label' => 'Zákazníci',
            'description' => 'Zákaznická báze a jejich aktivity.',
            'permission' => 'section.customers',
        ],
        'users' => [
            'label' => 'Uživatelé',
            'description' => 'Správa interních uživatelských účtů a jejich práv.',
            'permission' => 'section.users',
        ],
        'settings.automation' => [
            'label' => 'Automatizace',
            'description' => 'Plánování procesů a automatizací.',
            'permission' => 'section.settings.automation',
        ],
        'settings.shops' => [
            'label' => 'Shoptet',
            'description' => 'Napojení na Shoptet, správa shopů a webhooků.',
            'permission' => 'section.settings.shops',
        ],
        'settings.api' => [
            'label' => 'API',
            'description' => 'Integrace pro OpenAI, Slack a další služby.',
            'permission' => 'section.settings.api',
        ],
        'settings.plugins' => [
            'label' => 'AI pluginy',
            'description' => 'Generování widgetů pro Shoptet pomocí AI.',
            'permission' => 'section.settings.plugins',
        ],
        'settings.orders' => [
            'label' => 'Stavy objednávek',
            'description' => 'Mapování stavů a jejich dopady na metriky.',
            'permission' => 'section.settings.orders',
        ],
        'settings.customers' => [
            'label' => 'Zákazníci',
            'description' => 'Automatické zakládání a registrace zákazníků z objednávek.',
            'permission' => 'section.settings.customers',
        ],
        'settings.roles' => [
            'label' => 'Role & práva',
            'description' => 'Konfigurace rolí a přiřazení oprávnění.',
            'permission' => 'section.settings.roles',
        ],
        'settings.analytics' => [
            'label' => 'Analytika',
            'description' => 'Výběr metrik a RFM parametrů pro reporty.',
            'permission' => 'section.settings.analytics',
        ],
        'settings.inventory-notifications' => [
            'label' => 'Alerty zásob',
            'description' => 'Pravidla pro nízké zásoby a hlídané varianty.',
            'permission' => 'section.settings.inventory-notifications',
        ],
        'settings.inventory-ai' => [
            'label' => 'AI zásoby',
            'description' => 'Obchodní kontext pro AI odhady výdrže zásob.',
            'permission' => 'section.settings.inventory-ai',
        ],
        'settings.inventory-recommendations' => [
            'label' => 'Doporučení produktů',
            'description' => 'Váhy a pravidla pro výběr doporučených produktů.',
            'permission' => 'section.settings.inventory-recommendations',
        ],
        'settings.exports' => [
            'label' => 'Export a feedy',
            'description' => 'Konfigurace exportů zákazníků, objednávek a produktů.',
            'permission' => 'section.settings.exports',
        ],
        'ai.content' => [
            'label' => 'Tvorba AI obsahu',
            'description' => 'Generování textů a vizuálů pomocí OpenAI.',
            'permission' => 'section.ai.content',
        ],
    ];

    /**
     * @return list<array{key: string, label: string, description: string, permission: string}>
     */
    public static function catalog(): array
    {
        return collect(self::SECTIONS)
            ->map(fn (array $meta, string $key) => ['key' => $key] + $meta)
            ->values()
            ->all();
    }

    /**
     * @return list<string>
     */
    public static function keys(): array
    {
        return array_keys(self::SECTIONS);
    }

    public static function permissionFor(string $section): string
    {
        if (! isset(self::SECTIONS[$section])) {
            throw new InvalidArgumentException("Unknown admin section [{$section}]");
        }

        return self::SECTIONS[$section]['permission'];
    }

    /**
     * @return list<string>
     */
    public static function permissionNames(): array
    {
        return array_column(self::SECTIONS, 'permission');
    }

    public static function ensurePermissionsExist(): void
    {
        foreach (self::SECTIONS as $meta) {
            Permission::firstOrCreate(
                ['name' => $meta['permission'], 'guard_name' => 'web'],
                ['name' => $meta['permission'], 'guard_name' => 'web']
            );
        }
    }

    /**
     * @param  iterable<string>  $permissionNames
     * @return list<string>
     */
    public static function fromPermissionNames(iterable $permissionNames): array
    {
        $map = collect(self::SECTIONS)
            ->mapWithKeys(fn (array $meta, string $key) => [$meta['permission'] => $key]);

        return collect($permissionNames)
            ->filter(fn ($permission) => $map->has($permission))
            ->map(fn ($permission) => $map->get($permission))
            ->unique()
            ->values()
            ->all();
    }

    /**
     * @return list<string>
     */
    public static function forUser(User $user): array
    {
        $permissions = $user->getAllPermissions()->pluck('name');

        return self::fromPermissionNames($permissions);
    }

    /**
     * @param  array<string>|Collection<int, string>  $sections
     * @return list<string>
     */
    public static function permissionNamesFor(array|Collection $sections): array
    {
        return collect($sections)
            ->unique()
            ->filter(fn ($section) => isset(self::SECTIONS[$section]))
            ->map(fn ($section) => self::permissionFor($section))
            ->values()
            ->all();
    }
}
