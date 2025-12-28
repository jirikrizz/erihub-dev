<?php

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Modules\Pim\Models\ProductVariant;
use App\Models\User;

/**
 * @property int $id
 * @property int|null $user_id
 * @property string $original_filename
 * @property string $storage_path
 * @property \Illuminate\Support\Carbon $ordered_at
 * @property \Illuminate\Support\Carbon|null $expected_arrival_at
 * @property int|null $arrival_days
 * @property int $items_count
 * @property int $variant_codes_count
 * @property float $total_quantity
 */
class InventoryPurchaseOrder extends Model
{
    protected $fillable = [
        'user_id',
        'original_filename',
        'storage_path',
        'ordered_at',
        'expected_arrival_at',
        'arrival_days',
        'items_count',
        'variant_codes_count',
        'total_quantity',
    ];

    protected $casts = [
        'ordered_at' => 'date',
        'expected_arrival_at' => 'date',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(InventoryPurchaseOrderItem::class, 'purchase_order_id');
    }
}
