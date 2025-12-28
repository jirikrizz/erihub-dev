<?php

namespace Modules\Pim\Http\Controllers;

use Illuminate\Routing\Controller;

class ConfigController extends Controller
{
    public function locales()
    {
        return response()->json([
            'locales' => config('pim.locales'),
            'default' => config('pim.default_base_locale'),
        ]);
    }
}
