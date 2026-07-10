import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { Building2, ExternalLink, MapPin, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDeleteJob, useJobs, useMarkJobEmailsSeen } from "@/lib/queries";
import { STAGE_STYLES, STATUS_LABELS } from "@/lib/stage";
import { formatRelative } from "@/lib/time";
import type { Job, ScoreBreakdown } from "@/lib/types";
import { useNow } from "@/lib/use-now";
import { cn } from "@/lib/utils";
import { EmailList } from "./email-list";
import { scoreBandChip } from "./job-card";

const route = getRouteApi("/jobs/$jobId");

function SheetHeader({ job, onClose }: { job: Job; onClose: () => void }) {
  const now = useNow();
  const posted = formatRelative(job.postedAt, now);

  return (
    <header className="shrink-0 border-b border-line px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "rounded px-1.5 py-1 font-mono text-[10px] leading-none font-semibold tracking-[0.12em] uppercase",
            STAGE_STYLES[job.status].chip,
          )}
        >
          {STATUS_LABELS[job.status]}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="rounded p-1 text-faint transition-colors hover:bg-card-raised hover:text-bone"
        >
          <X size={16} />
        </button>
      </div>
      <h2 className="mt-2.5 text-lg leading-snug font-semibold text-bone">
        {job.title}
      </h2>
      <p className="mt-0.5 text-sm text-mist">{job.company}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-faint">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin size={11} />
            {job.location}
          </span>
        )}
        {job.workplaceType && (
          <span className="flex items-center gap-1">
            <Building2 size={11} />
            {job.workplaceType}
          </span>
        )}
        {posted && <span>posted {posted}</span>}
      </div>
      {job.url && (
        <a
          href={job.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-stage-applied/40 bg-stage-applied/10 px-2.5 py-1.5 text-xs font-medium text-stage-applied transition-colors hover:bg-stage-applied/20"
        >
          <ExternalLink size={12} />
          View posting on LinkedIn
        </a>
      )}
    </header>
  );
}

const BREAKDOWN_FIELDS = [
  ["cv", "CV"],
  ["northStar", "North star"],
  ["comp", "Comp"],
  ["cultural", "Culture"],
  ["redFlags", "Red flags"],
] as const satisfies readonly (readonly [keyof ScoreBreakdown, string])[];

function ScoreSection({ job }: { job: Job }) {
  const breakdown = job.scoreBreakdown;

  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint uppercase">
        Screening
      </h3>
      {job.score === null ? (
        <p className="mt-2 text-xs text-faint">
          Not scored yet — the scorer will pick this up.
        </p>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span
              className={cn(
                "rounded px-2 py-1 font-mono text-xl leading-none font-semibold",
                scoreBandChip(job.score),
              )}
            >
              {job.score.toFixed(1)}
            </span>
            <span className="font-mono text-[11px] text-faint">/ 5</span>
            {breakdown?.lowConfidence && (
              <span
                title="The scorer had limited information for this job"
                className="rounded bg-signal/10 px-1.5 py-0.5 font-mono text-[10px] leading-none font-medium text-signal"
              >
                low confidence
              </span>
            )}
          </div>
          {breakdown && (
            <>
              <dl className="mt-3 grid grid-cols-5 gap-2">
                {BREAKDOWN_FIELDS.map(([key, label]) => {
                  const value = breakdown[key];
                  return (
                    <div key={key} className="min-w-0">
                      <dt className="truncate font-mono text-[9px] tracking-wider text-faint uppercase">
                        {label}
                      </dt>
                      <dd className="mt-0.5 font-mono text-sm text-bone">
                        {typeof value === "number" ? value.toFixed(1) : "—"}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {breakdown.rationale && (
                <p className="mt-3 text-[13px] leading-relaxed text-mist">
                  {breakdown.rationale}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

function StackSection({ tags }: { tags: string[] }) {
  return (
    <section className="border-b border-line px-5 py-4">
      <h3 className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint uppercase">
        Stack · {tags.length}
      </h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded border border-line bg-ink/40 px-2 py-1 font-mono text-[11px] leading-none text-mist"
          >
            {tag}
          </span>
        ))}
      </div>
    </section>
  );
}

/**
 * Two-step inline confirm: first click arms it ("Confirm delete?"),
 * a second click within 3s deletes; otherwise it quietly disarms.
 */
function DeleteJobButton({ jobId }: { jobId: number }) {
  const navigate = useNavigate();
  const deleteJob = useDeleteJob();
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const handleClick = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    deleteJob.mutate(jobId);
    void navigate({ to: "/" });
  };

  return (
    <button
      onClick={handleClick}
      disabled={deleteJob.isPending}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50",
        confirming
          ? "border-stage-rejected/50 bg-stage-rejected/10 font-medium text-stage-rejected hover:bg-stage-rejected/20"
          : "border-line text-faint hover:border-stage-rejected/40 hover:text-stage-rejected",
      )}
    >
      <Trash2 size={12} />
      {confirming ? "Confirm delete?" : "Delete card"}
    </button>
  );
}

export function JobDetailSheet() {
  const { jobId } = route.useParams();
  const id = Number(jobId);
  const navigate = useNavigate();
  const { data } = useJobs();
  const markSeen = useMarkJobEmailsSeen();
  const { mutate: markSeenMutate } = markSeen;

  // Opening the sheet marks the job's mail seen; the response doubles as
  // the email list (the API's only read of a job's emails).
  useEffect(() => {
    if (Number.isInteger(id)) markSeenMutate(id);
  }, [id, markSeenMutate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void navigate({ to: "/" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const close = () => void navigate({ to: "/" });

  const job = data?.jobs.find((j) => j.id === id);
  const emails = [...(markSeen.data?.emails ?? [])].sort((a, b) =>
    (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""),
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/70 backdrop-blur-[2px]"
        onClick={close}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={job ? `${job.title} at ${job.company}` : "Job detail"}
        className="relative flex h-full w-full max-w-xl flex-col border-l border-line bg-panel shadow-2xl shadow-black/60"
      >
        {!job ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <p className="font-mono text-xs text-faint">
              {data ? "This job is no longer on the board." : "Loading…"}
            </p>
            {data && (
              <button
                onClick={close}
                className="rounded-md border border-line px-3 py-1.5 text-xs text-mist transition-colors hover:border-mist/40 hover:text-bone"
              >
                Back to board
              </button>
            )}
          </div>
        ) : (
          <>
            <SheetHeader job={job} onClose={close} />
            <div className="flex-1 overflow-y-auto">
              <ScoreSection job={job} />
              {job.techTags && job.techTags.length > 0 && (
                <StackSection tags={job.techTags} />
              )}
              <section className="border-b border-line px-5 py-4">
                <h3 className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint uppercase">
                  Mail{emails.length > 0 ? ` · ${emails.length}` : ""}
                </h3>
                <EmailList emails={emails} pending={markSeen.isPending} />
              </section>
              <section className="px-5 py-4">
                <h3 className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint uppercase">
                  Description
                </h3>
                {job.description ? (
                  <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-line text-mist">
                    {job.description}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-faint">
                    No description captured for this job.
                  </p>
                )}
              </section>
            </div>
            <footer className="flex shrink-0 justify-end border-t border-line px-5 py-3">
              <DeleteJobButton jobId={job.id} />
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
