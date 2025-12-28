<?php

namespace Modules\Customers\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class CustomerTagRule extends Model
{
    use HasFactory;

    protected $table = 'customer_tag_rules';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'tag_key',
        'label',
        'color',
        'is_active',
        'priority',
        'match_type',
        'conditions',
        'set_vip',
        'description',
        'metadata',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'priority' => 'int',
        'set_vip' => 'boolean',
        'conditions' => 'array',
        'metadata' => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(function (CustomerTagRule $rule): void {
            if (! $rule->getKey()) {
                $rule->setAttribute($rule->getKeyName(), (string) Str::uuid());
            }

            if ($rule->match_type === null) {
                $rule->match_type = 'all';
            }

            if ($rule->conditions === null) {
                $rule->conditions = [];
            }
        });
    }
}
