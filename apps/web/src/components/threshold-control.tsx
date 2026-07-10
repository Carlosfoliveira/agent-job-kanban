import { Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useSettings, useUpdateSettings } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Panel body, mounted only once the current threshold is known so the
 * slider can start from it.
 */
function ThresholdPanel({ current }: { current: number }) {
  const [value, setValue] = useState(current);
  const updateSettings = useUpdateSettings();
  const { isSuccess, reset } = updateSettings;

  // The reconciliation summary shows briefly, then clears.
  useEffect(() => {
    if (!isSuccess) return;
    const timer = setTimeout(reset, 4000);
    return () => clearTimeout(timer);
  }, [isSuccess, reset]);

  const moved = updateSettings.data?.moved;
  const movedSummary = moved
    ? [
        moved.toScreenedOut > 0 && `${moved.toScreenedOut} screened out`,
        moved.toInbox > 0 && `${moved.toInbox} back to inbox`,
      ]
        .filter(Boolean)
        .join(" · ") || "no cards moved"
    : null;

  return (
    <div className="p-3">
      <p className="text-[11px] leading-relaxed text-mist">
        Scored inbox jobs below this line move to Screened Out. Raising it
        screens more; lowering it brings cards back.
      </p>
      <div className="mt-3 flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={5}
          step={0.1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          aria-label="Screen-out threshold, 1 to 5"
          className="h-1 w-full accent-signal"
        />
        <span className="w-8 shrink-0 text-right font-mono text-sm font-semibold text-bone">
          {value.toFixed(1)}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          aria-live="polite"
          className="min-w-0 truncate font-mono text-[10px] text-faint"
        >
          {updateSettings.isPending
            ? "Saving…"
            : updateSettings.isError
              ? "Save failed — try again."
              : (movedSummary ?? "")}
        </span>
        <button
          onClick={() => updateSettings.mutate(value)}
          disabled={updateSettings.isPending || value === current}
          className="shrink-0 rounded-md border border-signal/40 bg-signal/10 px-2.5 py-1.5 text-xs font-medium text-signal transition-colors hover:bg-signal/20 disabled:cursor-default disabled:border-line disabled:bg-transparent disabled:text-faint"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** Header gear: shows the live screen-out threshold, opens the tuner. */
export function ThresholdControl() {
  const [open, setOpen] = useState(false);
  const { data } = useSettings();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Screen-out threshold"
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors",
          open
            ? "border-mist/40 text-mist"
            : "border-line text-faint hover:border-mist/40 hover:text-mist",
        )}
      >
        <Settings size={14} />
        {data && (
          <span className="font-mono text-[11px]">
            {`< ${data.screenOutThreshold.toFixed(1)}`}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Close threshold settings"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-card shadow-2xl shadow-black/60">
            <header className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
              <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                Screen-out threshold
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-0.5 text-faint transition-colors hover:text-bone"
              >
                <X size={14} />
              </button>
            </header>
            {data ? (
              <ThresholdPanel current={data.screenOutThreshold} />
            ) : (
              <p className="px-3 py-6 text-center text-xs text-faint">
                Loading settings…
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
