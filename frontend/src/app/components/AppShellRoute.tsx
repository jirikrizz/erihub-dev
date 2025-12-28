import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { AppLayout } from '../../components/layout/AppLayout';
import { RouteFallback } from './RouteFallback';

export const AppShellRoute = () => (
  <AppLayout>
    <Suspense fallback={<RouteFallback />}>
      <Outlet />
    </Suspense>
  </AppLayout>
);
