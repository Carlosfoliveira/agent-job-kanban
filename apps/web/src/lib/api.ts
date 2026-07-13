import type {
  BannedCompany,
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
  /** Real archived count — the jobs list caps archived rows unless
   * requested with allArchived. */
  archivedTotal: number;
}

export interface JobResponse {
  job: Job;
}

export interface DeleteJobResponse {
  deleted: boolean;
}

export interface CreateJobResponse {
  duplicate: boolean;
  /** Id of the created (or existing, on duplicate) job. The full row is not
   * echoed back — fetch it via getJobs() if needed. */
  id: number;
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

export interface EmailResponse {
  email: Email;
}

export interface BannedCompaniesResponse {
  companies: BannedCompany[];
}

export interface BanCompanyResponse {
  banned: boolean;
  /** How many existing cards the server archived as part of the ban. */
  archived: number;
}

export interface UnbanCompanyResponse {
  deleted: boolean;
}

export interface SettingsResponse {
  screenOutThreshold: number;
}

export interface UpdateSettingsResponse {
  screenOutThreshold: number;
  /** Jobs the server re-filed while reconciling against the new threshold. */
  moved: {
    toScreenedOut: number;
    toInbox: number;
  };
}

export const api = {
  // Jobs
  getJobs(allArchived = false): Promise<JobsResponse> {
    return request<JobsResponse>(
      allArchived ? "/api/jobs?archived=all" : "/api/jobs",
    );
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

  updateJob(id: number, input: UpdateJobInput): Promise<JobResponse> {
    return request<JobResponse>(`/api/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  deleteJob(id: number): Promise<DeleteJobResponse> {
    return request<DeleteJobResponse>(`/api/jobs/${id}`, {
      method: "DELETE",
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

  updateEmail(id: number, input: UpdateEmailInput): Promise<EmailResponse> {
    return request<EmailResponse>(`/api/emails/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  dismissEmail(id: number): Promise<EmailResponse> {
    return request<EmailResponse>(`/api/emails/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ dismissed: true }),
    });
  },

  // Banned companies
  getBannedCompanies(): Promise<BannedCompaniesResponse> {
    return request<BannedCompaniesResponse>("/api/banned-companies");
  },

  banCompany(company: string): Promise<BanCompanyResponse> {
    return request<BanCompanyResponse>("/api/banned-companies", {
      method: "POST",
      body: JSON.stringify({ company }),
    });
  },

  unbanCompany(id: number): Promise<UnbanCompanyResponse> {
    return request<UnbanCompanyResponse>(`/api/banned-companies/${id}`, {
      method: "DELETE",
    });
  },

  // Settings
  getSettings(): Promise<SettingsResponse> {
    return request<SettingsResponse>("/api/settings");
  },

  updateSettings(input: {
    screenOutThreshold: number;
  }): Promise<UpdateSettingsResponse> {
    return request<UpdateSettingsResponse>("/api/settings", {
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
