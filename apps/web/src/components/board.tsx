import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState } from "react";
import { COLUMNS } from "@/lib/columns";
import { useJobs, useUpdateJob } from "@/lib/queries";
import { STAGE_STYLES } from "@/lib/stage";
import { JOB_STATUSES, type Job, type JobStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Column } from "./column";
import { JobCardGhost } from "./job-card";
import { UnmatchedTray } from "./unmatched-tray";

/** Prefer whatever is directly under the pointer; fall back for edges. */
const collisionDetection: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCorners(args);
};

/** While a card is dragged across columns, it previews at this position. */
interface DragPreview {
  jobId: number;
  status: JobStatus;
  index: number;
}

function buildColumns(
  jobs: Job[],
  preview: DragPreview | null,
): Record<JobStatus, Job[]> {
  const groups = {} as Record<JobStatus, Job[]>;
  for (const status of JOB_STATUSES) groups[status] = [];

  const sorted = [...jobs].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
  );

  let dragged: Job | null = null;
  for (const job of sorted) {
    if (preview && job.id === preview.jobId) {
      dragged = job;
      continue;
    }
    groups[job.status].push(job);
  }
  if (preview && dragged) {
    const list = groups[preview.status];
    list.splice(Math.min(preview.index, list.length), 0, dragged);
  }
  return groups;
}

/**
 * Fractional midpoint between neighbours, or null when the gap has
 * collapsed and the column needs renumbering.
 */
function midpointSortOrder(
  before: Job | undefined,
  after: Job | undefined,
): number | null {
  if (before === undefined) {
    return after === undefined ? 1 : after.sortOrder - 1;
  }
  if (after === undefined) return before.sortOrder + 1;
  const mid = (before.sortOrder + after.sortOrder) / 2;
  return mid > before.sortOrder && mid < after.sortOrder ? mid : null;
}

export function Board() {
  const { data, isPending, isError, refetch } = useJobs();
  const updateJob = useUpdateJob();
  const [activeJob, setActiveJob] = useState<Job | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const jobs = data?.jobs ?? [];
  const columns = buildColumns(jobs, preview);

  const findColumnOf = (id: number): JobStatus | null => {
    for (const status of JOB_STATUSES) {
      if (columns[status].some((j) => j.id === id)) return status;
    }
    return null;
  };

  const resolveOverColumn = (overId: string | number): JobStatus | null => {
    if (typeof overId === "string") {
      return (JOB_STATUSES as readonly string[]).includes(overId)
        ? (overId as JobStatus)
        : null;
    }
    return findColumnOf(overId);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as number;
    setActiveJob(jobs.find((j) => j.id === id) ?? null);
    setPreview(null);
  };

  // Cross-column moves only: within a column dnd-kit's sortable transforms
  // already animate everything without state changes.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as number;
    const fromStatus = findColumnOf(activeId);
    const toStatus = resolveOverColumn(over.id);
    if (!fromStatus || !toStatus || fromStatus === toStatus) return;

    const target = columns[toStatus];
    let index = target.length;
    if (typeof over.id === "number") {
      const overIndex = target.findIndex((j) => j.id === over.id);
      if (overIndex !== -1) {
        const activeRect = active.rect.current.translated;
        const isBelow =
          activeRect !== null &&
          activeRect.top > over.rect.top + over.rect.height / 2;
        index = overIndex + (isBelow ? 1 : 0);
      }
    }
    setPreview((prev) =>
      prev &&
      prev.jobId === activeId &&
      prev.status === toStatus &&
      prev.index === index
        ? prev
        : { jobId: activeId, status: toStatus, index },
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = active.id as number;
    setActiveJob(null);
    setPreview(null);

    if (!over || !activeJob) return;
    const status = findColumnOf(activeId);
    if (!status) return;

    const list = columns[status];
    const from = list.findIndex((j) => j.id === activeId);
    if (from === -1) return;

    let to = from;
    if (typeof over.id === "number" && over.id !== activeId) {
      const overIndex = list.findIndex((j) => j.id === over.id);
      if (overIndex !== -1) to = overIndex;
    } else if (typeof over.id === "string") {
      to = list.length - 1;
    }

    const statusChanged = status !== activeJob.status;
    if (!statusChanged && from === to) return;

    const finalList = arrayMove(list, from, to);
    const index = finalList.findIndex((j) => j.id === activeId);
    const sortOrder = midpointSortOrder(
      finalList[index - 1],
      finalList[index + 1],
    );

    if (sortOrder !== null) {
      updateJob.mutate({ id: activeId, input: { status, sortOrder } });
      return;
    }

    // Neighbouring sort orders collided — renumber the whole column.
    finalList.forEach((job, i) => {
      const order = i + 1;
      if (job.id === activeId) {
        updateJob.mutate({ id: job.id, input: { status, sortOrder: order } });
      } else if (job.sortOrder !== order) {
        updateJob.mutate({ id: job.id, input: { sortOrder: order } });
      }
    });
  };

  const handleDragCancel = () => {
    setActiveJob(null);
    setPreview(null);
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex items-center gap-1" aria-hidden="true">
            {COLUMNS.map((c) => (
              <span
                key={c.status}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  STAGE_STYLES[c.status].dot,
                )}
              />
            ))}
          </span>
          <h1 className="font-mono text-xs font-semibold tracking-[0.22em] text-bone uppercase">
            Pipeline
          </h1>
          {data && (
            <span className="hidden font-mono text-[11px] text-faint sm:inline">
              {jobs.length} tracked
            </span>
          )}
        </div>
        <UnmatchedTray />
      </header>

      <main className="flex flex-1 gap-3 overflow-x-auto overflow-y-hidden p-3">
        {isPending ? (
          COLUMNS.map((def) => (
            <div
              key={def.status}
              className="h-full w-72 shrink-0 animate-pulse rounded-lg border border-line bg-panel"
            />
          ))
        ) : isError ? (
          <div className="m-auto text-center">
            <p className="font-mono text-sm text-stage-rejected">
              Can't reach the server on localhost:3001.
            </p>
            <button
              onClick={() => void refetch()}
              className="mt-3 rounded-md border border-line px-3 py-1.5 text-xs text-mist transition-colors hover:border-mist/40 hover:text-bone"
            >
              Retry
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {COLUMNS.map((def) => (
              <Column key={def.status} def={def} jobs={columns[def.status]} />
            ))}
            <DragOverlay>
              {activeJob ? <JobCardGhost job={activeJob} /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </main>
    </div>
  );
}
