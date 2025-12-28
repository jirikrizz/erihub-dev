<?php

use Illuminate\Database\Migrations\Migration;
use Modules\Core\Models\UserPreference;
use Modules\Core\Support\NotificationPreferenceNormalizer;

return new class extends Migration {
    public function up(): void
    {
        UserPreference::query()
            ->where('key', 'notifications.events')
            ->orderBy('id')
            ->chunkById(100, function ($preferences): void {
                foreach ($preferences as $preference) {
                    $normalized = NotificationPreferenceNormalizer::normalize(
                        $preference->value,
                        strict: false
                    );

                    if ($normalized === null) {
                        $preference->delete();
                        continue;
                    }

                    $preference->value = $normalized;
                    $preference->save();
                }
            });
    }

    public function down(): void
    {
        // Není potřeba nic dělat – starou strukturu nelze bezpečně obnovit.
    }
};
