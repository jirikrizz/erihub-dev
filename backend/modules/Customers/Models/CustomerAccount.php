<?php

namespace Modules\Customers\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class CustomerAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'id',
        'customer_id',
        'account_guid',
        'email',
        'phone',
        'main_account',
        'authorized',
        'email_verified',
        'data',
    ];

    protected $casts = [
        'main_account' => 'boolean',
        'authorized' => 'boolean',
        'email_verified' => 'boolean',
        'data' => 'array',
    ];

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        static::creating(function (CustomerAccount $account) {
            if (! $account->id) {
                $account->id = (string) Str::uuid();
            }
        });
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
