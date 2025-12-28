<?php

namespace Modules\Microsites\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Microsite extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'name',
        'slug',
        'status',
        'theme',
        'hero',
        'seo',
        'content_schema',
        'settings',
        'published_at',
        'locale',
        'currency',
        'brand',
        'primary_domain',
        'domains',
    ];

    protected $casts = [
        'hero' => 'array',
        'seo' => 'array',
        'content_schema' => 'array',
        'settings' => 'array',
        'published_at' => 'datetime',
        'brand' => 'array',
        'domains' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';
    protected $appends = [
        'public_url',
    ];

    protected static function booted(): void
    {
        static::creating(function (Microsite $microsite) {
            if (! $microsite->id) {
                $microsite->id = (string) Str::uuid();
            }

            if (! $microsite->slug) {
                $microsite->slug = Str::slug($microsite->name);
            }
        });
    }

    public function products(): HasMany
    {
        return $this->hasMany(MicrositeProduct::class)->orderBy('position');
    }

    public function publications(): HasMany
    {
        return $this->hasMany(MicrositePublication::class);
    }

    public function pages(): HasMany
    {
        return $this->hasMany(MicrositePage::class)->orderBy('path');
    }

    public function getPublicUrlAttribute(): ?string
    {
        if (! $this->slug) {
            return null;
        }

        return url(sprintf('/microshop/%s', Str::slug($this->slug)));
    }
}
