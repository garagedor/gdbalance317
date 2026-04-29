import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Download, Check, Share, Plus } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIos() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIosDevice = /iphone|ipad|ipod/.test(ua);
  // iPad on iOS 13+ reports as Mac; detect via touch
  const isIpadOS =
    navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
  return isIosDevice || isIpadOS;
}

function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // @ts-ignore - iOS Safari
    window.navigator.standalone === true
  );
}

export function InstallAppButton({
  className,
  variant = "outline",
}: {
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(isStandalone());
  const [iosOpen, setIosOpen] = useState(false);
  const ios = isIos();

  useEffect(() => {
    const onBefore = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBefore);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBefore);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <Button
        variant="ghost"
        className={className}
        disabled
        type="button"
      >
        <Check className="mr-2 h-4 w-4" />
        App installed
      </Button>
    );
  }

  const handleClick = async () => {
    if (deferred) {
      try {
        await deferred.prompt();
        const choice = await deferred.userChoice;
        if (choice.outcome === "accepted") {
          setInstalled(true);
        }
        setDeferred(null);
      } catch {
        // ignore
      }
      return;
    }
    // Fallback: iOS or browsers without beforeinstallprompt
    setIosOpen(true);
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={handleClick}
      >
        <Download className="mr-2 h-4 w-4" />
        Install App
      </Button>

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install on {ios ? "iPhone / iPad" : "this device"}</DialogTitle>
            <DialogDescription>
              {ios
                ? "Add 317 Garage Door to your home screen for a full app experience."
                : "Your browser doesn't support one-tap install. Use your browser menu to add this app to your home screen."}
            </DialogDescription>
          </DialogHeader>

          {ios ? (
            <ol className="space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                  1
                </span>
                <span className="flex items-center gap-1">
                  Tap the <Share className="inline h-4 w-4" /> <strong>Share</strong> button in Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                  2
                </span>
                <span className="flex items-center gap-1">
                  Scroll and tap <Plus className="inline h-4 w-4" /> <strong>Add to Home Screen</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                  3
                </span>
                <span>
                  Tap <strong>Add</strong> in the top right corner.
                </span>
              </li>
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Look for "Install app" or "Add to Home screen" in your browser menu (⋮).
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default InstallAppButton;
