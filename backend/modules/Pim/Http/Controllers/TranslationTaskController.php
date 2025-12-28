<?php

namespace Modules\Pim\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Modules\Pim\Models\TranslationTask;

class TranslationTaskController extends Controller
{
    public function index(Request $request)
    {
        $query = TranslationTask::query()->with(['translation.product']);

        if ($status = $request->query('status')) {
            $query->where('status', $status);
        }

        if ($assignee = $request->query('assigned_to')) {
            $query->where('assigned_to', $assignee);
        }

        $tasks = $query->paginate($request->integer('per_page', 25));

        return response()->json($tasks);
    }

    public function assign(Request $request, TranslationTask $task)
    {
        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
        ]);

        $task->assigned_to = $data['user_id'];
        $task->status = 'in_progress';
        $task->save();

        return response()->json($task->load('assignee'));
    }

    public function complete(TranslationTask $task)
    {
        $task->status = 'done';
        $task->save();

        return response()->json($task);
    }
}
