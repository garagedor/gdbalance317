import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Stethoscope } from "lucide-react";
import { toast } from "sonner";

interface DebugResult {
  input_phone: string;
  normalized_digits: string;
  digits10: string;
  profile_found: boolean;
  user_id: string | null;
  full_name: string | null;
  role: string | null;
  is_active: boolean | null;
  pending_approval: boolean | null;
  archived: boolean | null;
  can_login: boolean | null;
  area_assigned: boolean | null;
  last_login_at: string | null;
  last_login_succeeded: boolean | null;
}

function YesNo({ value }: { value: boolean | null | undefined }) {
  if (value === null || value === undefined) return <Badge variant="outline">—</Badge>;
  return value ? (
    <Badge className="bg-emerald-600 hover:bg-emerald-600">Yes</Badge>
  ) : (
    <Badge variant="destructive">No</Badge>
  );
}

export function PhoneLoginDebug() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DebugResult | null>(null);

  const run = async () => {
    if (!phone.trim()) {
      toast.error("Enter a phone number to test.");
      return;
    }
    setBusy(true);
    setResult(null);
    const { data, error } = await supabase.rpc("debug_phone_login", { _phone: phone });
    setBusy(false);
    if (error) {
      console.error("[phone-debug]", error);
      toast.error("Lookup failed.");
      return;
    }
    const row = Array.isArray(data) ? (data[0] as DebugResult | undefined) : (data as DebugResult | undefined);
    setResult(row ?? null);
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Stethoscope className="h-4 w-4" /> Phone login diagnostic
        </div>
        <p className="text-xs text-muted-foreground">
          Type a phone number exactly as the technician would, in any format
          (with +1, dashes, spaces, etc). This shows how it normalizes and
          whether login should succeed.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="e.g. +1 347-542-9403"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
            }}
          />
          <Button onClick={run} disabled={busy} className="gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Check
          </Button>
        </div>

        {result && (
          <div className="grid grid-cols-1 gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-2">
            <Field label="Input">{result.input_phone || "—"}</Field>
            <Field label="Normalized digits">{result.normalized_digits || "—"}</Field>
            <Field label="Match key (last 10)">
              <span className="font-mono">{result.digits10 || "—"}</span>
            </Field>
            <Field label="Profile exists">
              <YesNo value={result.profile_found} />
            </Field>
            <Field label="Name">{result.full_name ?? "—"}</Field>
            <Field label="Role">{result.role ?? "—"}</Field>
            <Field label="Active">
              <YesNo value={result.is_active} />
            </Field>
            <Field label="Pending approval">
              <YesNo value={result.pending_approval} />
            </Field>
            <Field label="Archived / deleted">
              <YesNo value={result.archived} />
            </Field>
            <Field label="Can login">
              <YesNo value={result.can_login} />
            </Field>
          </div>
        )}
        {result && !result.profile_found && (
          <p className="text-xs text-destructive">
            No profile matches this phone. Technician must sign up, or check that
            the stored phone number includes the same 10 digits.
          </p>
        )}
        {result?.profile_found && result.archived && (
          <p className="text-xs text-destructive">
            This account is archived. Restore the user before they can log in.
          </p>
        )}
        {result?.profile_found && result.pending_approval && !result.archived && (
          <p className="text-xs text-amber-600">
            User is pending — they will see the “Waiting for admin approval” screen
            until you approve them above.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1 last:border-0 sm:border-0 sm:pb-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
