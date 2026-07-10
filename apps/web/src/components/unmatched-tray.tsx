import {
  ArrowUpRight,
  MailQuestionMark,
  Paperclip,
  Search,
  X,
} from "lucide-react";
import { useState } from "react";
import { gmailMessageUrl } from "@/lib/columns";
import { useJobs, usePatchEmail, useUnmatchedEmails } from "@/lib/queries";
import { STAGE_STYLES, STATUS_LABELS } from "@/lib/stage";
import { formatDateTime } from "@/lib/time";
import type { Email } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ClassificationIcon } from "./classification-icon";

function JobPicker({
  emailId,
  onDone,
}: {
  emailId: number;
  onDone: () => void;
}) {
  const [query, setQuery] = useState("");
  const { data } = useJobs();
  const patchEmail = usePatchEmail();

  const jobs = data?.jobs ?? [];
  const q = query.trim().toLowerCase();
  const matches = (
    q
      ? jobs.filter(
          (j) =>
            j.title.toLowerCase().includes(q) ||
            j.company.toLowerCase().includes(q),
        )
      : jobs
  ).slice(0, 6);

  return (
    <div className="mt-2 rounded-md border border-line bg-ink/60 p-2">
      <div className="flex items-center gap-1.5 rounded border border-line bg-ink px-2">
        <Search size={12} className="shrink-0 text-faint" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title or company"
          className="h-7 w-full bg-transparent text-xs text-bone placeholder:text-faint focus:outline-none"
        />
      </div>
      <ul className="mt-1.5 max-h-44 overflow-y-auto">
        {matches.length === 0 ? (
          <li className="px-2 py-1.5 text-[11px] text-faint">
            No job matches "{query}".
          </li>
        ) : (
          matches.map((job) => (
            <li key={job.id}>
              <button
                disabled={patchEmail.isPending}
                onClick={() => {
                  patchEmail.mutate(
                    { id: emailId, input: { jobId: job.id } },
                    { onSuccess: onDone },
                  );
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-card-raised disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs text-bone">
                    {job.title}
                  </span>
                  <span className="block truncate text-[10px] text-mist">
                    {job.company}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] leading-none font-semibold uppercase",
                    STAGE_STYLES[job.status].chip,
                  )}
                >
                  {STATUS_LABELS[job.status]}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <button
        onClick={onDone}
        className="mt-1.5 w-full rounded px-2 py-1 text-center font-mono text-[10px] text-faint transition-colors hover:bg-card-raised hover:text-mist"
      >
        Leave unmatched
      </button>
    </div>
  );
}

function UnmatchedRow({ email }: { email: Email }) {
  const [picking, setPicking] = useState(false);

  return (
    <li className="border-b border-line/60 px-3 py-2.5 last:border-b-0">
      <div className="flex items-start gap-2.5">
        <ClassificationIcon
          classification={email.classification}
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <a
            href={gmailMessageUrl(email.gmailMessageId)}
            target="_blank"
            rel="noreferrer"
            className="group flex max-w-full items-baseline gap-1 text-[13px] font-medium text-bone transition-colors hover:text-signal"
          >
            <span className="truncate group-hover:underline">
              {email.subject ?? "(no subject)"}
            </span>
            <ArrowUpRight
              size={11}
              className="shrink-0 text-faint group-hover:text-signal"
            />
          </a>
          <p className="mt-0.5 truncate font-mono text-[10px] text-faint">
            {email.sender ?? "unknown sender"}
            {email.receivedAt
              ? ` · ${formatDateTime(email.receivedAt) ?? ""}`
              : ""}
          </p>
        </div>
        <button
          onClick={() => setPicking((p) => !p)}
          title={picking ? "Cancel" : "Attach to a job"}
          className={cn(
            "shrink-0 rounded border border-line p-1.5 text-mist transition-colors hover:border-mist/40 hover:text-bone",
            picking && "border-signal/40 text-signal",
          )}
        >
          {picking ? <X size={13} /> : <Paperclip size={13} />}
        </button>
      </div>
      {picking && (
        <JobPicker emailId={email.id} onDone={() => setPicking(false)} />
      )}
    </li>
  );
}

export function UnmatchedTray() {
  const [open, setOpen] = useState(false);
  const { data } = useUnmatchedEmails();
  const emails = data?.emails ?? [];
  const count = emails.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 transition-colors",
          count > 0
            ? "border-signal/30 bg-signal/10 text-signal hover:bg-signal/20"
            : "border-line text-faint hover:border-mist/40 hover:text-mist",
        )}
      >
        <MailQuestionMark size={14} />
        <span className="font-mono text-[11px]">Unmatched</span>
        {count > 0 && (
          <span className="rounded-full bg-signal/20 px-1.5 font-mono text-[10px] leading-4 font-semibold">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Close unmatched mail"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full right-0 z-40 mt-2 flex max-h-[70vh] w-[26rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-line bg-card shadow-2xl shadow-black/60">
            <header className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
              <h2 className="font-mono text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                Unmatched mail
              </h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-0.5 text-faint transition-colors hover:text-bone"
              >
                <X size={14} />
              </button>
            </header>
            {count === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-faint">
                No stray mail — everything is matched to a job.
              </p>
            ) : (
              <ul className="overflow-y-auto">
                {emails.map((email) => (
                  <UnmatchedRow key={email.id} email={email} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
