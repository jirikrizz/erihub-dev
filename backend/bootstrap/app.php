<?php

use Illuminate\Auth\AuthenticationException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->redirectGuestsTo(fn () => null);

        // Trust reverse proxy headers (Caddy/Nginx)
        $middleware->trustProxies(
            at: ['*'],
            headers: \Illuminate\Http\Middleware\TrustProxies::HEADERS_X_FORWARDED_ALL
        );

        $middleware->alias([
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
            'permission' => \Spatie\Permission\Middleware\PermissionMiddleware::class,
            'role_or_permission' => \Spatie\Permission\Middleware\RoleOrPermissionMiddleware::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (AuthenticationException $exception, $request) {
            \Log::warning('AuthenticationException caught', [
                'path' => $request->path(),
                'url' => $request->url(),
                'expects_json' => $request->expectsJson(),
                'is_api' => $request->is('api/*'),
                'message' => $exception->getMessage(),
            ]);
            
            if ($request->expectsJson() || $request->is('api/*')) {
                return response()->json(['message' => $exception->getMessage()], 401);
            }

            return redirect()->guest('/');
        });
    })->create();
