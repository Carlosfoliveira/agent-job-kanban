import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ColumnDef } from "@/lib/columns";
import { STAGE_STYLES } from "@/lib/stage";
import type { Job } from "@/lib/types";
import { cn } from "@/lib/utils";
import { JobCard } from "./job-card";

export function Column({ def, jobs }: { def: ColumnDef; jobs: Job[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: def.status });
  const stage = STAGE_STYLES[def.status];

  return (
    <section
      aria-label={`${def.label} column, ${jobs.length} jobs`}
      className={cn(
        "flex h-full w-72 shrink-0 flex-col overflow-hidden rounded-lg border border-line bg-panel",
        isOver && cn("ring-1 ring-inset", stage.ring),
      )}
    >
      <div className={cn("h-0.5 shrink-0", stage.rail)} />
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
        <h2 className="truncate font-mono text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
          {def.label}
        </h2>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold",
            stage.chip,
          )}
        >
          {jobs.length}
        </span>
      </header>
      <SortableContext
        items={jobs.map((j) => j.id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className="flex flex-1 flex-col gap-2 overflow-y-auto p-2"
        >
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
          {jobs.length === 0 && (
            <div className="flex h-20 items-center justify-center rounded-md border border-dashed border-line font-mono text-[10px] tracking-wider text-faint">
              empty
            </div>
          )}
        </div>
      </SortableContext>
    </section>
  );
}
