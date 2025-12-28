<?php

namespace Modules\Core\Http\Requests;

use Cron\CronExpression;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Core\Enums\JobScheduleFrequency;
use Modules\Core\Models\JobSchedule;
use Modules\Core\Support\JobScheduleCatalog;

class UpdateJobScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'job_type' => ['prohibited'],
            'name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'shop_id' => ['sometimes', 'nullable', 'integer', 'exists:shops,id'],
            'options' => ['sometimes', 'nullable', 'array'],
            'frequency' => ['sometimes', Rule::enum(JobScheduleFrequency::class)],
            'cron_expression' => ['sometimes', 'nullable', 'string'],
            'timezone' => ['sometimes', 'nullable', 'timezone:all'],
            'enabled' => ['sometimes', 'boolean'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if (! $this->has('cron_expression')) {
                return;
            }

            $cron = $this->input('cron_expression');

            if ($cron !== null && $cron !== '' && ! CronExpression::isValidExpression($cron)) {
                $validator->errors()->add('cron_expression', 'Zadej platný cron výraz.');
            }

            $schedule = $this->route('schedule');
            if (! $schedule instanceof JobSchedule) {
                return;
            }

            if (! $this->has('options')) {
                return;
            }

            $options = $this->input('options');

            if ($options !== null && ! is_array($options)) {
                $validator->errors()->add('options', 'Nastavení musí být předáno jako objekt.');
                return;
            }

            foreach (JobScheduleCatalog::validateOptions($schedule->job_type, $options ?? []) as $field => $message) {
                $validator->errors()->add("options.{$field}", $message);
            }
        });
    }

    public function validated($key = null, $default = null)
    {
        $data = parent::validated($key, $default);

        /** @var JobSchedule|null $schedule */
        $schedule = $this->route('schedule');
        $jobType = $schedule?->job_type;

        if (array_key_exists('frequency', $data)) {
            $frequencyValue = $data['frequency'];
            $frequencyEnum = $frequencyValue instanceof JobScheduleFrequency
                ? $frequencyValue
                : JobScheduleFrequency::from($frequencyValue);

            $data['frequency'] = $frequencyEnum->value;

            if ((! array_key_exists('cron_expression', $data) || ! $data['cron_expression']) && $jobType && JobScheduleCatalog::contains($jobType)) {
                $definition = JobScheduleCatalog::definition($jobType);
                $data['cron_expression'] = $frequencyEnum->defaultCronExpression() ?? $definition['default_cron'];
            }
        }

        if (array_key_exists('enabled', $data)) {
            $data['enabled'] = (bool) $data['enabled'];
        }

        if (array_key_exists('timezone', $data) && (! $data['timezone']) && $jobType && JobScheduleCatalog::contains($jobType)) {
            $definition = JobScheduleCatalog::definition($jobType);
            $data['timezone'] = $definition['default_timezone'];
        }

        if (array_key_exists('options', $data)) {
            $data['options'] = $jobType
                ? JobScheduleCatalog::sanitizeOptions($jobType, $data['options'])
                : ($data['options'] ?? null);
        }

        return $data;
    }
}
