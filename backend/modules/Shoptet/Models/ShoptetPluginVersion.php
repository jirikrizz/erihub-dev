<?php

namespace Modules\Shoptet\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShoptetPluginVersion extends Model
{
    use HasFactory;

    protected $fillable = [
        'plugin_id',
        'version',
        'filename',
        'bundle_key',
        'summary',
        'description',
        'code',
        'installation_steps',
        'testing_checklist',
        'dependencies',
        'warnings',
        'metadata',
    ];

    protected $casts = [
        'installation_steps' => 'array',
        'testing_checklist' => 'array',
        'dependencies' => 'array',
        'warnings' => 'array',
        'metadata' => 'array',
    ];

    public function plugin(): BelongsTo
    {
        return $this->belongsTo(ShoptetPlugin::class, 'plugin_id');
    }
}
