import { lazy, Suspense, useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Nav from './components/Nav';
import NotFound from './components/NotFound';

const Index = lazy(() => import('./pages/Index'));
const Auth = lazy(() => import('./pages/Auth'));
const Discover = lazy(() => import('./pages/Discover'));
const Write = lazy(() => import('./pages/Write'));
const Settings = lazy(() => import('./pages/Settings'));
const PostPage = lazy(() => import('./pages/Post'));
const ProfilePage = lazy(() => import('./pages/Profile'));

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
