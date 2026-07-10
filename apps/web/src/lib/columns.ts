import type { JobStatus } from "./types";

export interface ColumnDef {
  status: JobStatus;
  label: string;
  /**
   * Hand-ordered columns support drag-to-reorder (sortOrder). Non-sortable
   * columns are machine-ordered by score instead.
   */
  sortable: boolean;
}

export const COLUMNS: ColumnDef[] = [
  { status: "screened_out", label: "Screened Out", sortable: false },
  { status: "inbox", label: "Inbox", sortable: false },
  { status: "applied", label: "Applied", sortable: true },
  { status: "action_needed", label: "Action Needed", sortable: true },
  { status: "waiting", label: "Waiting", sortable: true },
  { status: "interview", label: "Interview", sortable: true },
  { status: "offer", label: "Offer", sortable: true },
  { status: "rejected", label: "Rejected", sortable: true },
  { status: "archived", label: "Archived", sortable: true },
];

/** Columns whose card order is derived from scores, not sortOrder. */
export const SCORE_SORTED_STATUSES: ReadonlySet<JobStatus> = new Set(
  COLUMNS.filter((c) => !c.sortable).map((c) => c.status),
);

export function gmailMessageUrl(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${id}`;
}
