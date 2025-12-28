<?php

namespace Modules\Core\Http\Requests;

use Cron\CronExpression;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Modules\Core\Enums\JobScheduleFrequency;
use Modules\Core\Support\JobScheduleCatalog;

class StoreJobScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'job_type' => ['required', 'string', Rule::in(JobScheduleCatalog::keys())],
            'name' => ['nullable', 'string', 'max:255'],
            'shop_id' => ['nullable', 'integer', 'exists:shops,id'],
            'options' => ['nullable', 'array'],
            'frequency' => ['nullable', Rule::enum(JobScheduleFrequency::class)],
            'cron_expression' => ['nullable', 'string'],
            'timezone' => ['nullable', 'timezone:all'],
            'enabled' => ['nullable', 'boolean'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            $cron = $this->input('cron_expression');

            if ($cron !== null && $cron !== '' && ! CronExpression::isValidExpression($cron)) {
                $validator->errors()->add('cron_expression', 'Zadej platný cron výraz.');
            }

            $jobType = $this->input('job_type');
            if (! is_string($jobType)) {
                return;
            }

            $options = $this->input('options');
            if ($options !== null && ! is_array($options)) {
                $validator->errors()->add('options', 'Nastavení musí být předáno jako objekt.');
                return;
            }

            foreach (JobScheduleCatalog::validateOptions($jobType, $options) as $field => $message) {
                $validator->errors()->add("options.{$field}", $message);
            }
        });
    }

    public function validated($key = null, $default = null)
    {
        $data = parent::validated($key, $default);

        $definition = JobScheduleCatalog::definition($data['job_type']);

        $frequencyValue = $data['frequency'] ?? $definition['default_frequency']->value;
        $frequencyEnum = $frequencyValue instanceof JobScheduleFrequency
            ? $frequencyValue
            : JobScheduleFrequency::from($frequencyValue);

        $data['frequency'] = $frequencyEnum->value;

        $cron = $data['cron_expression'] ?? null;
        if (! $cron) {
            $cron = $frequencyEnum->defaultCronExpression() ?? $definition['default_cron'];
        }
        $data['cron_expression'] = $cron;

        $data['timezone'] = $data['timezone'] ?? $definition['default_timezone'];
        $data['name'] = $data['name'] ?? $definition['label'];
        $data['enabled'] = array_key_exists('enabled', $data) ? (bool) $data['enabled'] : true;
        $data['options'] = JobScheduleCatalog::sanitizeOptions($data['job_type'], $data['options'] ?? null);
        $data['shop_id'] = $data['shop_id'] ?? null;

        return $data;
    }
}
