import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Global refresh affordance available in every role's header.
 * - Tap (quick click): invalidate all React Query caches → refetch active queries.
 * - Long-press (>=600ms): hard reload the page (window.location.reload).
 */
export function RefreshButton() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const longPressed = useRef(false);
  const timer = useRef<number | null>(null);

  const refetch = async () => {
    setBusy(true);
    try {
      await qc.invalidateQueries();
      toast.success("Refreshed");
    } catch {
      toast.error("Refresh failed");
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    longPressed.current = false;
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      window.location.reload();
    }, 600);
  };
  const cancel = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Refresh (long-press to hard reload)"
      title="Tap to refresh • Hold to hard reload"
      disabled={busy}
      onPointerDown={start}
      onPointerUp={(e) => {
        cancel();
        if (!longPressed.current) {
          e.preventDefault();
          void refetch();
        }
      }}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
    </Button>
  );
}
