import { ArrowUpRight } from "lucide-react";
import { gmailMessageUrl } from "@/lib/columns";
import { formatDateTime } from "@/lib/time";
import type { Email } from "@/lib/types";
import { ClassificationIcon } from "./classification-icon";

export function EmailList({
  emails,
  pending,
}: {
  emails: Email[];
  pending: boolean;
}) {
  if (emails.length === 0) {
    return (
      <p className="mt-2 text-xs text-faint">
        {pending ? "Loading mail…" : "No mail linked to this job yet."}
      </p>
    );
  }

  return (
    <ul className="mt-1">
      {emails.map((email) => (
        <li
          key={email.id}
          className="flex items-start gap-2.5 border-b border-line/50 py-2.5 last:border-b-0"
        >
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
            {email.snippet && (
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-mist">
                {email.snippet}
              </p>
            )}
            <p className="mt-1 truncate font-mono text-[10px] text-faint">
              {email.sender ?? "unknown sender"}
              {email.receivedAt
                ? ` · ${formatDateTime(email.receivedAt) ?? ""}`
                : ""}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
