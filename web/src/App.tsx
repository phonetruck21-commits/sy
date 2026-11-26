import { lazy, Suspense, type ReactNode } from 'react';
import { HashRouter, BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import { AppLayout } from './components/Layout';
import { isDesktop } from './lib/desktop';
import Login from './pages/Login';

const TechConsole = lazy(() => import('./pages/TechConsole'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const Admin = lazy(() => import('./pages/Admin'));
const Reports = lazy(() => import('./pages/Reports'));
const Viewer = lazy(() => import('./pages/Viewer'));

function RequireAuth({ children, roles }: { children: ReactNode; roles?: string[] }) {
  const { me, loading } = useSession();
  if (loading) return <div className="p-8 text-center text-muted">טוען…</div>;
  if (!me) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(me.user.role)) return <Navigate to="/tech" replace />;
  return <>{children}</>;
}

const Fallback = <div className="p-8 text-center text-muted">טוען…</div>;

export default function App() {
  // Desktop app loads from local files -> hash routing; web uses clean URLs (/v/<token> for customers)
  const Router = isDesktop() ? HashRouter : BrowserRouter;
  return (
    <Router>
      <Suspense fallback={Fallback}>
        <Routes>
          <Route path="/v/:token" element={<Viewer />} />
          <Route
            path="/*"
            element={
              <SessionProvider>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
                    <Route path="/tech" element={<TechConsole />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/jobs/:id" element={<JobDetail />} />
                    <Route path="/admin" element={<RequireAuth roles={['owner', 'admin']}><Admin /></RequireAuth>} />
                    <Route path="/reports" element={<RequireAuth roles={['owner', 'admin']}><Reports /></RequireAuth>} />
                  </Route>
                  <Route path="*" element={<Navigate to="/tech" replace />} />
                </Routes>
              </SessionProvider>
            }
          />
        </Routes>
      </Suspense>
    </Router>
  );
}
