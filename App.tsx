import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Nav from './Nav';
import NotFound from './NotFound';

const Index = lazy(() => import('./Index'));
const Auth = lazy(() => import('./Auth'));
const Discover = lazy(() => import('./Discover'));
const Write = lazy(() => import('./Write'));
const Settings = lazy(() => import('./Settings'));
const PostPage = lazy(() => import('./Post'));
const ProfilePage = lazy(() => import('./Profile'));

export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<div className="page-loading" role="status">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/write" element={<Write />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/post/:id" element={<PostPage />} />
            <Route path="/profile/:username" element={<ProfilePage />} />
            <Route path="/:handle" element={<ProfilePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </>
  );
}
