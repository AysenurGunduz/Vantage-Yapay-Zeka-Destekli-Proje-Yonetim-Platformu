import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading, profile, profileLoading } = useAuth();
  const location = useLocation();

  if (loading || (session && profileLoading && !profile)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Yükleniyor...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (profile && !profile.usage_purpose && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
}
