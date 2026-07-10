import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useNavigate } from "@tanstack/react-router";
import { Mail } from "lucide-react";
import { formatRelative } from "@/lib/time";
import type { Job } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";

/** Amber indicator lamp while there is unseen mail; quiet when caught up. */
function MailIndicator({ job }: { job: Job }) {
  if (job.emailCount === 0) return null;

  if (job.unseenCount > 0) {
    return (
      <span
        title={`${job.unseenCount} unseen ${job.unseenCount === 1 ? "email" : "emails"}`}
        className="flex items-center gap-1 rounded-full bg-signal/15 px-1.5 py-0.5 text-signal shadow-[0_0_10px_rgba(240,181,74,0.25)]"
      >
        <Mail size={12} strokeWidth={2.25} />
        <span className="font-mono text-[10px] leading-none font-semibold">
          {job.unseenCount}
        </span>
      </span>
    );
  }

  return (
    <Mail
      size={12}
      className="text-faint"
      aria-label={`${job.emailCount} ${job.emailCount === 1 ? "email" : "emails"}, all seen`}
    />
  );
}

function CardInner({ job }: { job: Job }) {
  const now = useNow();
  const posted = formatRelative(job.postedAt, now);

  return (
    <>
      <h3 className="line-clamp-2 text-[13px] leading-snug font-semibold text-bone">
        {job.title}
      </h3>
      <p className="mt-0.5 truncate text-xs text-mist">{job.company}</p>
      <div className="mt-2 flex min-h-4 items-center justify-between gap-2">
        <span className="truncate font-mono text-[10px] text-faint">
          {posted ?? ""}
        </span>
        <MailIndicator job={job} />
      </div>
    </>
  );
}

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
      className={cn(
        "cursor-grab rounded-md border border-line bg-card px-3 py-2.5 transition-colors select-none hover:border-mist/40 hover:bg-card-raised active:cursor-grabbing",
        isDragging && "opacity-30",
      )}
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
