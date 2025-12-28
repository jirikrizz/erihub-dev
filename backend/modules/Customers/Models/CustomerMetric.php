<?php

namespace Modules\Customers\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerMetric extends Model
{
    protected $table = 'customer_metrics';

    protected $primaryKey = 'customer_guid';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'customer_guid',
        'orders_count',
        'total_spent',
        'total_spent_base',
        'average_order_value',
        'average_order_value_base',
        'first_order_at',
        'last_order_at',
    ];

    protected $casts = [
        'orders_count' => 'int',
        'total_spent' => 'float',
        'total_spent_base' => 'float',
        'average_order_value' => 'float',
        'average_order_value_base' => 'float',
        'first_order_at' => 'datetime',
        'last_order_at' => 'datetime',
    ];
}
