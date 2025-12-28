<?php

namespace Modules\Inventory\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Modules\Pim\Models\ProductVariant;

/**
 * @property int $id
 * @property int $purchase_order_id
 * @property string|null $product_variant_id
 * @property string $variant_code
 * @property float $quantity
 */
class InventoryPurchaseOrderItem extends Model
{
    protected $fillable = [
        'purchase_order_id',
        'product_variant_id',
        'variant_code',
        'quantity',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(InventoryPurchaseOrder::class, 'purchase_order_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
