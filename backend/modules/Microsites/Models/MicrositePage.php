<?php

namespace Modules\Microsites\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class MicrositePage extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'microsite_id',
        'path',
        'title',
        'body_md',
        'layout',
        'published',
        'metadata',
    ];

    protected $casts = [
        'layout' => 'array',
        'metadata' => 'array',
        'published' => 'boolean',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (MicrositePage $page) {
            if (! $page->id) {
                $page->id = (string) Str::uuid();
            }

            if ($page->path) {
                $page->path = '/'.ltrim($page->path, '/');
            }
        });
    }

    public function microsite(): BelongsTo
    {
        return $this->belongsTo(Microsite::class);
    }
}
