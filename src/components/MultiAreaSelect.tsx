import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AreaOption {
  id: string;
  name: string;
}

interface Props {
  areas: AreaOption[];
  value: string[];
  primaryId: string | null;
  onChange: (next: { areaIds: string[]; primaryId: string | null }) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Multi-area picker. Shows assigned areas as chips, lets management
 * tick areas on/off and pick which one is the "primary" (home) area.
 */
export function MultiAreaSelect({
  areas,
  value,
  primaryId,
  onChange,
  disabled,
  placeholder = "Assign locations",
}: Props) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string, checked: boolean) => {
    let next = checked ? Array.from(new Set([...value, id])) : value.filter((x) => x !== id);
    let nextPrimary = primaryId;
    if (!checked && primaryId === id) nextPrimary = next[0] ?? null;
    if (checked && !nextPrimary) nextPrimary = id;
    onChange({ areaIds: next, primaryId: nextPrimary });
  };

  const setPrimary = (id: string) => {
    if (!value.includes(id)) onChange({ areaIds: [...value, id], primaryId: id });
    else onChange({ areaIds: value, primaryId: id });
  };

  const selected = areas.filter((a) => value.includes(a.id));

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 truncate text-left">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {selected.length === 0 ? (
                <span className="text-muted-foreground">{placeholder}</span>
              ) : selected.length === 1 ? (
                selected[0].name
              ) : (
                `${selected.length} locations`
              )}
            </span>
            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="max-h-72 overflow-auto p-1">
            {areas.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No locations yet
              </div>
            ) : (
              areas.map((a) => {
                const checked = value.includes(a.id);
                const isPrimary = primaryId === a.id;
                return (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
                  >
                    <label className="flex flex-1 items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggle(a.id, !!v)}
                        disabled={disabled}
                      />
                      <span className="text-sm">{a.name}</span>
                    </label>
                    {checked && (
                      <button
                        type="button"
                        onClick={() => setPrimary(a.id)}
                        disabled={disabled}
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                          isPrimary
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted-foreground/20"
                        )}
                      >
                        {isPrimary ? "Primary" : "Set primary"}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((a) => (
            <Badge
              key={a.id}
              variant={primaryId === a.id ? "default" : "secondary"}
              className="text-[10px] font-medium"
            >
              {a.name}
              {primaryId === a.id && " ★"}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
