<?php

namespace Modules\Microsites\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MicrositePublication extends Model
{
    use HasFactory;

    protected $fillable = [
        'microsite_id',
        'type',
        'status',
        'meta',
        'error_message',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function microsite(): BelongsTo
    {
        return $this->belongsTo(Microsite::class);
    }
}
