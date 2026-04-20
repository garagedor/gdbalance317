import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type Role } from "./AuthProvider";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow?: Role[];
}) {
  const { session, profile, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) {
    return <Navigate to={`/auth?redirect=${encodeURIComponent(loc.pathname)}`} replace />;
  }
  if (!profile) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Setting up your profile…
      </div>
    );
  }
  if (allow && !allow.includes(profile.role)) {
    const fallback = profile.role === "management" ? "/admin" : "/tech";
    return <Navigate to={fallback} replace />;
  }
  return <>{children}</>;
}
