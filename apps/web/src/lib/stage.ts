import { COLUMNS } from "./columns";
import type { JobStatus } from "./types";

/**
 * Per-stage visual voice. Full literal class strings so Tailwind can see
 * every utility at build time.
 */
export interface StageStyle {
  /** 2px signal rail across the top of a column. */
  rail: string;
  /** Tinted count / status chip. */
  chip: string;
  /** Ring shown on a column while a card hovers over it. */
  ring: string;
  /** Legend dot in the header wordmark. */
  dot: string;
}

export const STAGE_STYLES: Record<JobStatus, StageStyle> = {
  screened_out: {
    rail: "bg-stage-screened/40",
    chip: "bg-stage-screened/10 text-stage-screened",
    ring: "ring-stage-screened/50",
    dot: "bg-stage-screened",
  },
  inbox: {
    rail: "bg-stage-inbox/50",
    chip: "bg-stage-inbox/10 text-stage-inbox",
    ring: "ring-stage-inbox/50",
    dot: "bg-stage-inbox",
  },
  applied: {
    rail: "bg-stage-applied/50",
    chip: "bg-stage-applied/10 text-stage-applied",
    ring: "ring-stage-applied/50",
    dot: "bg-stage-applied",
  },
  action_needed: {
    rail: "bg-stage-action/50",
    chip: "bg-stage-action/10 text-stage-action",
    ring: "ring-stage-action/50",
    dot: "bg-stage-action",
  },
  waiting: {
    rail: "bg-stage-waiting/50",
    chip: "bg-stage-waiting/10 text-stage-waiting",
    ring: "ring-stage-waiting/50",
    dot: "bg-stage-waiting",
  },
  interview: {
    rail: "bg-stage-interview/50",
    chip: "bg-stage-interview/10 text-stage-interview",
    ring: "ring-stage-interview/50",
    dot: "bg-stage-interview",
  },
  offer: {
    rail: "bg-stage-offer/50",
    chip: "bg-stage-offer/10 text-stage-offer",
    ring: "ring-stage-offer/50",
    dot: "bg-stage-offer",
  },
  rejected: {
    rail: "bg-stage-rejected/50",
    chip: "bg-stage-rejected/10 text-stage-rejected",
    ring: "ring-stage-rejected/50",
    dot: "bg-stage-rejected",
  },
  archived: {
    rail: "bg-stage-archived/50",
    chip: "bg-stage-archived/10 text-stage-archived",
    ring: "ring-stage-archived/50",
    dot: "bg-stage-archived",
  },
};

/** "action_needed" -> "Action Needed", derived from the column defs. */
export const STATUS_LABELS: Record<JobStatus, string> = Object.fromEntries(
  COLUMNS.map((c) => [c.status, c.label]),
) as Record<JobStatus, string>;
