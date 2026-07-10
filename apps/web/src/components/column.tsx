import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Archive } from "lucide-react";
import type { ColumnDef } from "@/lib/columns";
import { useArchiveJobs, useSettings } from "@/lib/queries";
import { STAGE_STYLES } from "@/lib/stage";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { JobCard, ScoreOrderedJobCard } from "./job-card";

export function Column({ def, jobs }: { def: ColumnDef; jobs: Job[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: def.status });
  const { data: settings } = useSettings();
  const archiveJobs = useArchiveJobs();
  const stage = STAGE_STYLES[def.status];

  const list = (
    <div
      ref={setNodeRef}
      className="flex flex-1 flex-col gap-2 overflow-y-auto p-2"
    >
      {jobs.map((job) =>
        def.sortable ? (
          <JobCard key={job.id} job={job} />
        ) : (
          <ScoreOrderedJobCard key={job.id} job={job} />
        ),
      )}
      {jobs.length === 0 && (
        <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-line font-mono text-[10px] tracking-wider text-faint">
          empty
        </div>
      )}
    </div>
  );

  return (
    <section
      aria-label={`${def.label} column, ${jobs.length} jobs`}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-panel",
        isOver && cn("ring-1 ring-inset", stage.ring),
      )}
    >
      <div className={cn("h-0.5 shrink-0", stage.rail)} />
      <header className="flex shrink-0 items-center gap-2 border-b border-line/60 px-3 py-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
          {def.label}
        </h2>
        {def.status === "screened_out" && settings && (
          <span
            title={`Scored jobs below ${settings.screenOutThreshold.toFixed(1)} land here`}
            className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] leading-none text-faint"
          >
            {`< ${settings.screenOutThreshold.toFixed(1)}`}
          </span>
        )}
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold",
            stage.chip,
          )}
        >
          {jobs.length}
        </span>
        {def.status !== "archived" && jobs.length > 0 && (
          <button
            type="button"
            title={`Archive all ${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} in ${def.label}`}
            aria-label={`Archive all jobs in ${def.label}`}
            disabled={archiveJobs.isPending}
            onClick={() => archiveJobs.mutate(jobs.map((j) => j.id))}
            className="rounded p-0.5 text-faint transition-colors hover:bg-ink/70 hover:text-bone disabled:opacity-50"
          >
            <Archive size={13} strokeWidth={2} />
          </button>
        )}
      </header>
      {def.sortable ? (
        <SortableContext
          items={jobs.map((j) => j.id)}
          strategy={verticalListSortingStrategy}
        >
          {list}
        </SortableContext>
      ) : (
        list
      )}
    </section>
  );
}
