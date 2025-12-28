<?php

namespace Modules\Customers\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerTag extends Model
{
    protected $table = 'customer_tags';

    protected $fillable = [
        'name',
        'color',
        'is_hidden',
    ];

    protected $casts = [
        'is_hidden' => 'boolean',
    ];
}
