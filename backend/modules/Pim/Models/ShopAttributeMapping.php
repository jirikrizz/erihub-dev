<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShopAttributeMapping extends Model
{
    protected $guarded = [];

    protected $casts = [
        'meta' => 'array',
    ];

    public function values(): HasMany
    {
        return $this->hasMany(ShopAttributeValueMapping::class, 'mapping_id');
    }
}
