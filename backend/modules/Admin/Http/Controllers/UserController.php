<?php

namespace Modules\Admin\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Modules\Admin\Http\Resources\AdminUserResource;
use Modules\Admin\Support\AdminSection;
use Spatie\Permission\Models\Role;

class UserController extends Controller
{
    public function index()
    {
        $users = User::query()
            ->with(['roles', 'permissions'])
            ->paginate(25);

        return AdminUserResource::collection($users);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6'],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['string'],
            'sections' => ['nullable', 'array'],
            'sections.*' => ['string', Rule::in(AdminSection::keys())],
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        if (! empty($data['roles'])) {
            $user->syncRoles($data['roles']);
        }

        $this->syncSections($user, $data['sections'] ?? []);

        return AdminUserResource::make($user->load(['roles', 'permissions']))
            ->response()
            ->setStatusCode(201);
    }

    public function syncRoles(Request $request, User $user)
    {
        $data = $request->validate([
            'roles' => ['required', 'array'],
            'roles.*' => ['string'],
        ]);

        $user->syncRoles($data['roles']);

        return AdminUserResource::make($user->load(['roles', 'permissions']));
    }

    public function roles()
    {
        $roles = Role::query()
            ->select(['id', 'name'])
            ->orderBy('name')
            ->get();

        return response()->json($roles);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['nullable', 'string', 'min:6'],
            'roles' => ['sometimes', 'array'],
            'roles.*' => ['string'],
            'sections' => ['sometimes', 'array'],
            'sections.*' => ['string', Rule::in(AdminSection::keys())],
        ]);

        $payload = [];

        if (array_key_exists('name', $data)) {
            $payload['name'] = $data['name'];
        }

        if (array_key_exists('email', $data)) {
            $payload['email'] = $data['email'];
        }

        if (! empty($data['password'])) {
            $payload['password'] = Hash::make($data['password']);
        }

        if ($payload !== []) {
            $user->fill($payload)->save();
        }

        if (array_key_exists('roles', $data)) {
            $user->syncRoles($data['roles'] ?? []);
        }

        if (array_key_exists('sections', $data)) {
            $this->syncSections($user, $data['sections'] ?? []);
        }

        return AdminUserResource::make($user->load(['roles', 'permissions']));
    }

    public function destroy(Request $request, User $user)
    {
        if ($request->user() && (int) $user->id === (int) $request->user()->id) {
            return response()->json([
                'message' => 'Nemůžeš odstranit vlastní účet.',
            ], 422);
        }

        $user->delete();

        return response()->noContent();
    }

    public function sections()
    {
        return response()->json(AdminSection::catalog());
    }

    private function syncSections(User $user, array $sections): void
    {
        AdminSection::ensurePermissionsExist();

        $sectionPermissions = AdminSection::permissionNames();
        $desiredPermissions = AdminSection::permissionNamesFor($sections);

        if ($sectionPermissions !== []) {
            $user->permissions()->whereIn('name', $sectionPermissions)->detach();
        }

        if ($desiredPermissions !== []) {
            $user->givePermissionTo($desiredPermissions);
        }

        $user->forgetCachedPermissions();
    }
}
