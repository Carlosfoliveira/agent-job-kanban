import type { JobStatus } from "./types";

export interface ColumnDef {
  status: JobStatus;
  label: string;
}

export const COLUMNS: ColumnDef[] = [
  { status: "inbox", label: "Inbox" },
  { status: "applied", label: "Applied" },
  { status: "action_needed", label: "Action Needed" },
  { status: "waiting", label: "Waiting" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" },
  { status: "rejected", label: "Rejected" },
];

export function gmailMessageUrl(id: string): string {
  return `https://mail.google.com/mail/u/0/#all/${id}`;
}
