import type {
  Email,
  Job,
  NewEmailInput,
  NewJobInput,
  UpdateEmailInput,
  UpdateJobInput,
} from "./types";

const BASE_URL = "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Request failed: ${init?.method ?? "GET"} ${path} (${res.status}) ${body}`,
    );
  }

  return res.json() as Promise<T>;
}

export interface JobsResponse {
  jobs: Job[];
}

export interface CreateJobResponse {
  duplicate: boolean;
  job: Job;
}

export interface ExistsResponse {
  exists: boolean;
}

export interface SearchJobsParams {
  company?: string;
  title?: string;
}

export interface EmailsResponse {
  emails: Email[];
}

export interface AttachEmailResponse {
  duplicate: boolean;
  email: Email;
}

export const api = {
  // Jobs
  getJobs(): Promise<JobsResponse> {
    return request<JobsResponse>("/api/jobs");
  },

  createJob(input: NewJobInput): Promise<CreateJobResponse> {
    return request<CreateJobResponse>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  jobExists(linkedinJobId: string): Promise<ExistsResponse> {
    const params = new URLSearchParams({ linkedinJobId });
    return request<ExistsResponse>(`/api/jobs/exists?${params.toString()}`);
  },

  updateJob(id: number, input: UpdateJobInput): Promise<Job> {
    return request<Job>(`/api/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  searchJobs(params: SearchJobsParams): Promise<JobsResponse> {
    const search = new URLSearchParams();
    if (params.company) search.set("company", params.company);
    if (params.title) search.set("title", params.title);
    return request<JobsResponse>(`/api/jobs/search?${search.toString()}`);
  },

  // Emails
  attachEmailToJob(
    jobId: number,
    input: NewEmailInput,
  ): Promise<AttachEmailResponse> {
    return request<AttachEmailResponse>(`/api/jobs/${jobId}/emails`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  createUnmatchedEmail(input: NewEmailInput): Promise<AttachEmailResponse> {
    return request<AttachEmailResponse>("/api/emails", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getUnmatchedEmails(): Promise<EmailsResponse> {
    return request<EmailsResponse>("/api/emails/unmatched");
  },

  updateEmail(id: number, input: UpdateEmailInput): Promise<Email> {
    return request<Email>(`/api/emails/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  // The server responds with the job's full email list (freshly marked
  // seen) — the only read of a job's emails the API exposes.
  markJobEmailsSeen(jobId: number): Promise<EmailsResponse> {
    return request<EmailsResponse>(`/api/jobs/${jobId}/emails/seen`, {
      method: "POST",
    });
  },
};
