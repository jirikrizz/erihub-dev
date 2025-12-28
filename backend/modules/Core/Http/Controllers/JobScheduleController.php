<?php

namespace Modules\Core\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Routing\Controller;
use Modules\Core\Http\Requests\StoreJobScheduleRequest;
use Modules\Core\Http\Requests\UpdateJobScheduleRequest;
use Modules\Core\Http\Resources\JobScheduleResource;
use Modules\Core\Models\JobSchedule;
use Modules\Core\Support\JobScheduleCatalog;

class JobScheduleController extends Controller
{
    public function index(): JsonResponse
    {
        $schedules = JobSchedule::with('shop')
            ->whereIn('job_type', JobScheduleCatalog::keys())
            ->orderBy('job_type')
            ->get()
            ->keyBy('job_type');

        $jobs = [];

        foreach (JobScheduleCatalog::catalog() as $definition) {
            $schedule = $schedules->get($definition['job_type']);

            $jobs[] = $definition + [
                'schedule' => $schedule
                    ? JobScheduleResource::make($schedule)->toArray(request())
                    : null,
            ];
        }

        return response()->json(['jobs' => $jobs]);
    }

    public function store(StoreJobScheduleRequest $request): JsonResponse
    {
        $data = $request->validated();

        $schedule = JobSchedule::updateOrCreate(
            [
                'job_type' => $data['job_type'],
                'shop_id' => $data['shop_id'] ?? null,
            ],
            $data
        );

        $schedule = $schedule->refresh()->load('shop');

        return (new JobScheduleResource($schedule))
            ->response()
            ->setStatusCode(201);
    }

    public function update(UpdateJobScheduleRequest $request, JobSchedule $schedule): JobScheduleResource
    {
        abort_unless(JobScheduleCatalog::contains($schedule->job_type), 404);

        $schedule->fill($request->validated());
        $schedule->save();

        return new JobScheduleResource($schedule->refresh()->load('shop'));
    }

    public function destroy(JobSchedule $schedule): JsonResponse
    {
        abort_unless(JobScheduleCatalog::contains($schedule->job_type), 404);

        $schedule->delete();

        return response()->json(['status' => 'deleted']);
    }
}
