import { useDraggable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { Archive, Mail } from "lucide-react";
import { useUpdateJob } from "@/lib/queries";
import { formatRelative } from "@/lib/time";
import type { Job } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/**
 * Hover-revealed control that files a card away into the Archived column.
 * Sits in-flow beside the score badge; reuses the status PATCH and stops
 * pointer/click from starting a drag or opening the detail sheet. Hidden
 * on cards that are already archived.
 */
function ArchiveButton({ job }: { job: Job }) {
  const updateJob = useUpdateJob();
  if (job.status === "archived") return null;

  return (
    <button
      type="button"
      title="Archive"
      aria-label={`Archive ${job.title}`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        updateJob.mutate({ id: job.id, input: { status: "archived" } });
      }}
      className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-opacity hover:bg-ink/70 hover:text-bone focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Archive size={13} strokeWidth={2} />
    </button>
  );
}

/** Mail pill always shows the total count; the amber glow only burns while
 * there is unseen mail, dimming to quiet grey once caught up. */
function MailIndicator({ job }: { job: Job }) {
  if (job.emailCount === 0) return null;

  const unseen = job.unseenCount > 0;

  return (
    <span
      title={
        unseen
          ? `${job.unseenCount} unseen of ${job.emailCount} ${job.emailCount === 1 ? "email" : "emails"}`
          : `${job.emailCount} ${job.emailCount === 1 ? "email" : "emails"}, all seen`
      }
      className={cn(
        "flex items-center gap-1 rounded-full px-1.5 py-0.5",
        unseen
          ? "bg-signal/15 text-signal shadow-[0_0_10px_rgba(240,181,74,0.25)]"
          : "bg-ink/50 text-faint",
      )}
    >
      <Mail size={12} strokeWidth={2.25} />
      <span className="font-mono text-[10px] leading-none font-semibold">
        {job.emailCount}
      </span>
    </span>
  );
}

/** Chip classes for a score band: strong fit, middling, below the bar. */
export function scoreBandChip(score: number): string {
  if (score >= 4) return "bg-stage-offer/10 text-stage-offer";
  if (score >= 3) return "bg-stage-inbox/10 text-stage-inbox";
  return "bg-stage-rejected/10 text-stage-rejected";
}

function ScoreBadge({ job }: { job: Job }) {
  if (job.score === null) {
    // Only the score-driven columns advertise "score on the way".
    if (job.status !== "inbox" && job.status !== "screened_out") return null;
    return (
      <span
        title="Score pending"
        className="shrink-0 rounded border border-line bg-ink/50 px-1.5 py-0.5 font-mono text-[10px] leading-none text-faint"
      >
        …
      </span>
    );
  }

  return (
    <span
      title={`Fit score ${job.score.toFixed(1)} / 5`}
      className={cn(
        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] leading-none font-semibold",
        scoreBandChip(job.score),
      )}
    >
      {job.score.toFixed(1)}
    </span>
  );
}

const MAX_CARD_TAGS = 3;

function TagRow({ tags }: { tags: string[] }) {
  const shown = tags.slice(0, MAX_CARD_TAGS);
  const extra = tags.length - shown.length;

  return (
    <div className="mt-1.5 flex items-center gap-1">
      {shown.map((tag) => (
        <span
          key={tag}
          className="max-w-24 truncate rounded-sm border border-line/80 bg-ink/40 px-1 py-px font-mono text-[9px] leading-4 text-mist"
        >
          {tag}
        </span>
      ))}
      {extra > 0 && (
        <span
          title={tags.slice(MAX_CARD_TAGS).join(", ")}
          className="shrink-0 font-mono text-[9px] leading-4 text-faint"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function CardInner({ job }: { job: Job }) {
  const now = useNow();
  const posted = formatRelative(job.postedAt, now);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-[13px] leading-snug font-semibold text-bone">
          {job.title}
        </h3>
        <span className="flex shrink-0 items-center gap-1">
          <ScoreBadge job={job} />
          <ArchiveButton job={job} />
        </span>
      </div>
      <p className="mt-0.5 truncate text-xs text-mist">{job.company}</p>
      {job.techTags && job.techTags.length > 0 && (
        <TagRow tags={job.techTags} />
      )}
      <div className="mt-2 flex min-h-4 items-center justify-between gap-2">
        <span className="truncate font-mono text-[10px] text-faint">
          {posted ?? ""}
        </span>
        <MailIndicator job={job} />
      </div>
    </>
  );
}

const CARD_CLASS =
  "group cursor-grab rounded-md border border-line bg-card px-3 py-2.5 transition-colors select-none hover:border-mist/40 hover:bg-card-raised active:cursor-grabbing";

export function JobCard({ job }: { job: Job }) {
  const navigate = useNavigate();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: job.id });

  const openDetail = () => {
    void navigate({ to: "/jobs/$jobId", params: { jobId: String(job.id) } });
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter") openDetail();
      }}
      className={cn(CARD_CLASS, isDragging && "opacity-30")}
    >
      <CardInner job={job} />
    </div>
  );
}

/**
 * Card for score-ordered columns: draggable out, but never reorderable in
 * place — the column's order belongs to the scores, so only the DragOverlay
 * ghost moves. (Separate component because hooks can't be conditional.)
 */
export function ScoreOrderedJobCard({ job }: { job: Job }) {
  const navigate = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
  });

  const openDetail = () => {
    void navigate({ to: "/jobs/$jobId", params: { jobId: String(job.id) } });
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter") openDetail();
      }}
      className={cn(CARD_CLASS, isDragging && "opacity-30")}
    >
      <CardInner job={job} />
    </div>
  );
}

/** Static twin rendered inside DragOverlay — lifted, slightly tilted. */
export function JobCardGhost({ job }: { job: Job }) {
  return (
    <div className="rotate-2 cursor-grabbing rounded-md border border-mist/30 bg-card-raised px-3 py-2.5 shadow-2xl shadow-black/60">
      <CardInner job={job} />
    </div>
  );
}
