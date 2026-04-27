import { useAuth } from "@/auth/AuthProvider";
import { Navigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

export default function PendingApproval() {
  const { profile, loading, signOut } = useAuth();

  if (loading) return null;
  if (!profile) return <Navigate to="/auth" replace />;
  // If admin already approved them, send them to their portal.
  if (!profile.pending_approval && profile.is_active) {
    const target =
      profile.role === "management"
        ? "/admin"
        : profile.role === "area_manager"
        ? "/manager"
        : profile.role === "office_staff"
        ? "/office"
        : "/tech";
    return <Navigate to={target} replace />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md text-center shadow-lg">
        <CardHeader>
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Clock className="h-6 w-6" />
          </div>
          <CardTitle className="font-display text-2xl">Waiting for approval</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Hi <span className="font-medium text-foreground">{profile.full_name}</span> — your
            technician account was created. An admin needs to review and assign your area, commission
            rate, and area manager before you can submit reports.
          </p>
          <p className="text-xs text-muted-foreground">
            You will get access automatically once approved. You can close this tab.
          </p>
          <Button variant="outline" className="w-full" onClick={signOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
