<?php

namespace Modules\Pim\Models;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class TranslationTask extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'product_translation_id',
        'assigned_to',
        'due_at',
        'status',
        'notes',
    ];

    protected $casts = [
        'due_at' => 'datetime',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (TranslationTask $task) {
            if (! $task->id) {
                $task->id = (string) Str::uuid();
            }
        });
    }

    public function translation(): BelongsTo
    {
        return $this->belongsTo(ProductTranslation::class, 'product_translation_id');
    }

    public function assignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }
}
