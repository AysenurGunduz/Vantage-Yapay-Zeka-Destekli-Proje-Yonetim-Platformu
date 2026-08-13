import { Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { GuestRoute } from "./components/auth/GuestRoute";
import { useTheme } from "./lib/ThemeContext";

const Landing = lazy(() => import("./pages/Landing"));
const Home = lazy(() => import("./pages/Home"));
const Workspace = lazy(() => import("./pages/Workspace"));
const Overview = lazy(() => import("./pages/Overview"));
const Activity = lazy(() => import("./pages/Activity"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const TeamMembers = lazy(() => import("./pages/TeamMembers"));

function RouteLoadingFallback() {
  const { theme } = useTheme();
  return <div className={`${theme}-theme min-h-screen bg-[var(--bg-base)]`} />;
}

function App() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/workspace"
        element={
          <ProtectedRoute>
            <Workspace />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/overview"
        element={
          <ProtectedRoute>
            <Overview />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/activity"
        element={
          <ProtectedRoute>
            <Activity />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/organizations/:orgId/team"
        element={
          <ProtectedRoute>
            <TeamMembers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invite/:token"
        element={
          <ProtectedRoute>
            <InviteAccept />
          </ProtectedRoute>
        }
      />
      <Route
        path="/login"
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestRoute>
            <Signup />
          </GuestRoute>
        }
      />
      </Routes>
    </Suspense>
  );
}

export default App;
