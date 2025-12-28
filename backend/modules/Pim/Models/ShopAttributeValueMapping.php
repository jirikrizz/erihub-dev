<?php

namespace Modules\Pim\Models;

use Illuminate\Database\Eloquent\Model;

class ShopAttributeValueMapping extends Model
{
    protected $guarded = [];

    protected $casts = [
        'meta' => 'array',
    ];
}
