export const JOB_STATUSES = [
  "inbox",
  "applied",
  "action_needed",
  "waiting",
  "interview",
  "offer",
  "rejected",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const EMAIL_CLASSIFICATIONS = [
  "confirmation",
  "action_request",
  "interview",
  "rejection",
  "offer",
  "other",
] as const;

export type EmailClassification = (typeof EMAIL_CLASSIFICATIONS)[number];

export interface Job {
  id: number;
  linkedinJobId: string;
  title: string;
  company: string;
  location: string | null;
  workplaceType: string | null;
  description: string | null;
  url: string | null;
  postedAt: string | null;
  status: JobStatus;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
  emailCount: number;
  unseenCount: number;
}

export interface Email {
  id: number;
  jobId: number | null;
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string | null;
  sender: string | null;
  snippet: string | null;
  receivedAt: string | null;
  seen: number;
  classification: EmailClassification | null;
}

export interface NewJobInput {
  linkedinJobId: string;
  title: string;
  company: string;
  location?: string | null;
  workplaceType?: string | null;
  description?: string | null;
  url?: string | null;
  postedAt?: string | null;
  status?: JobStatus;
  sortOrder?: number;
}

export interface UpdateJobInput {
  status?: JobStatus;
  sortOrder?: number;
}

export interface NewEmailInput {
  gmailMessageId: string;
  gmailThreadId?: string | null;
  subject?: string | null;
  sender?: string | null;
  snippet?: string | null;
  receivedAt?: string | null;
  seen?: number;
  classification?: EmailClassification | null;
}

export interface UpdateEmailInput {
  jobId?: number | null;
  seen?: number;
}
