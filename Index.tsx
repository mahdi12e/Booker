import { lazy, Suspense } from 'react';
import { useAuth } from '../auth';

const Landing = lazy(() => import('./Landing'));
const Home = lazy(() => import('./Home'));

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-loading" role="status">Loading…</div>;
  return (
    <Suspense fallback={<div className="page-loading" role="status">Loading…</div>}>
      {user ? <Home /> : <Landing />}
    </Suspense>
  );
}
