<?php

namespace Modules\Shoptet\Models;

use Database\Factories\ShoptetPluginTemplateFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ShoptetPluginTemplate extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'plugin_type',
        'language',
        'description',
        'goal',
        'shoptet_surface',
        'data_sources',
        'additional_notes',
        'brand_primary_color',
        'brand_secondary_color',
        'brand_font_family',
        'metadata',
        'is_system',
    ];

    protected $casts = [
        'metadata' => 'array',
        'is_system' => 'boolean',
    ];

    protected static function newFactory(): ShoptetPluginTemplateFactory
    {
        return ShoptetPluginTemplateFactory::new();
    }
}
