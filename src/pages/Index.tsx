import { Navigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthProvider";
import { Loader2 } from "lucide-react";

/** Routes the signed-in user to the right home, or to /auth otherwise. */
export default function Index() {
  const { loading, session, profile } = useAuth();
  if (loading) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;
  if (!profile) return <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">Setting up your profile…</div>;
  const dest =
    profile.role === "management" ? "/admin"
    : profile.role === "area_manager" ? "/manager"
    : "/tech";
  return <Navigate to={dest} replace />;
}
