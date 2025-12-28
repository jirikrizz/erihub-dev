<?php

namespace Modules\Core\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;
use Modules\Core\Enums\JobScheduleFrequency;

/** @mixin \Modules\Core\Models\JobSchedule */
class JobScheduleResource extends JsonResource
{
    public function toArray($request): array
    {
        $frequency = $this->frequency instanceof JobScheduleFrequency
            ? $this->frequency
            : JobScheduleFrequency::tryFrom((string) $this->frequency) ?? JobScheduleFrequency::CUSTOM;

        return [
            'id' => $this->id,
            'name' => $this->name,
            'job_type' => $this->job_type,
            'shop_id' => $this->shop_id,
            'shop' => $this->whenLoaded('shop', function () {
                return [
                    'id' => $this->shop->id,
                    'name' => $this->shop->name,
                    'domain' => $this->shop->domain,
                ];
            }),
            'options' => $this->options,
            'frequency' => $frequency->value,
            'frequency_label' => $frequency->label(),
            'cron_expression' => $this->cron_expression,
            'timezone' => $this->timezone,
            'enabled' => (bool) $this->enabled,
            'last_run_at' => $this->last_run_at?->toIso8601String(),
            'last_run_ended_at' => $this->last_run_ended_at?->toIso8601String(),
            'last_run_status' => $this->last_run_status,
            'last_run_message' => $this->last_run_message,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
