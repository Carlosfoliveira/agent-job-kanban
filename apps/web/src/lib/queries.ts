import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { api, type EmailsResponse, type JobsResponse } from "./api";
import { useArchivedView } from "./archived-view";
import type { Job, NewEmailInput, UpdateEmailInput, UpdateJobInput } from "./types";

export const jobsQueryKey = ["jobs"] as const;
export const unmatchedEmailsQueryKey = ["emails", "unmatched"] as const;
export const settingsQueryKey = ["settings"] as const;
export const bannedCompaniesQueryKey = ["banned-companies"] as const;

export function useJobs() {
  const { allArchived } = useArchivedView();
  return useQuery({
    queryKey: [...jobsQueryKey, allArchived ? "all-archived" : "recent-archived"],
    queryFn: () => api.getJobs(allArchived),
    // Keep the truncated board on screen while the full archived set loads.
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
  });
}

interface UpdateJobVariables {
  id: number;
  input: UpdateJobInput;
}

// The jobs query exists under one key per archived view, so optimistic
// updates patch (and snapshots capture) every cache under the prefix.
type JobsCacheSnapshot = [QueryKey, JobsResponse | undefined][];

function snapshotJobsCaches(queryClient: QueryClient): JobsCacheSnapshot {
  return queryClient.getQueriesData<JobsResponse>({ queryKey: jobsQueryKey });
}

function restoreJobsCaches(
  queryClient: QueryClient,
  snapshot: JobsCacheSnapshot,
) {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

function patchJobsCaches(
  queryClient: QueryClient,
  update: (jobs: Job[]) => Job[],
) {
  queryClient.setQueriesData<JobsResponse>({ queryKey: jobsQueryKey }, (old) =>
    old ? { ...old, jobs: update(old.jobs) } : old,
  );
}

export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: UpdateJobVariables) =>
      api.updateJob(id, input),
    onMutate: async ({ id, input }: UpdateJobVariables) => {
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });

      const previousJobs = snapshotJobsCaches(queryClient);

      patchJobsCaches(queryClient, (jobs) =>
        jobs.map((job) => (job.id === id ? { ...job, ...input } : job)),
      );

      return { previousJobs };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousJobs) {
        restoreJobsCaches(queryClient, context.previousJobs);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });
}

/** Bulk-archive: one optimistic cache patch, one PATCH per job in flight. */
export function useArchiveJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => api.updateJob(id, { status: "archived" }))),
    onMutate: async (ids: number[]) => {
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });

      const previousJobs = snapshotJobsCaches(queryClient);

      const idSet = new Set(ids);
      patchJobsCaches(queryClient, (jobs) =>
        jobs.map((job): Job =>
          idSet.has(job.id) ? { ...job, status: "archived" } : job,
        ),
      );

      return { previousJobs };
    },
    onError: (_err, _ids, context) => {
      if (context?.previousJobs) {
        restoreJobsCaches(queryClient, context.previousJobs);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.deleteJob(id),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });

      const previousJobs = snapshotJobsCaches(queryClient);

      patchJobsCaches(queryClient, (jobs) =>
        jobs.filter((job) => job.id !== id),
      );

      return { previousJobs };
    },
    onError: (_err, _id, context) => {
      if (context?.previousJobs) {
        restoreJobsCaches(queryClient, context.previousJobs);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });
}

export function useSettings() {
  return useQuery({
    queryKey: settingsQueryKey,
    queryFn: api.getSettings,
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (screenOutThreshold: number) =>
      api.updateSettings({ screenOutThreshold }),
    // The server reconciles inbox <-> screened_out in the same request, so
    // both caches are stale the moment it responds.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });
}

export function useBannedCompanies() {
  return useQuery({
    queryKey: bannedCompaniesQueryKey,
    queryFn: api.getBannedCompanies,
  });
}

export function useBanCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (company: string) => api.banCompany(company),
    // Banning archives the company's cards server-side, so the jobs cache
    // is stale too.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: bannedCompaniesQueryKey });
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });
}

export function useUnbanCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.unbanCompany(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: bannedCompaniesQueryKey });
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });
}

export function useUnmatchedEmails() {
  return useQuery({
    queryKey: unmatchedEmailsQueryKey,
    queryFn: api.getUnmatchedEmails,
  });
}

export function useDismissEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => api.dismissEmail(id),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: unmatchedEmailsQueryKey });

      const previousEmails = queryClient.getQueryData<EmailsResponse>(
        unmatchedEmailsQueryKey,
      );

      queryClient.setQueryData<EmailsResponse>(
        unmatchedEmailsQueryKey,
        (old) => {
          if (!old) return old;
          return { emails: old.emails.filter((email) => email.id !== id) };
        },
      );

      return { previousEmails };
    },
    onError: (_err, _id, context) => {
      if (context?.previousEmails) {
        queryClient.setQueryData<EmailsResponse>(
          unmatchedEmailsQueryKey,
          context.previousEmails,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: unmatchedEmailsQueryKey });
    },
  });
}

interface AttachEmailVariables {
  jobId: number;
  input: NewEmailInput;
}

export function useAttachEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ jobId, input }: AttachEmailVariables) =>
      api.attachEmailToJob(jobId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      void queryClient.invalidateQueries({ queryKey: unmatchedEmailsQueryKey });
    },
  });
}

export function useMarkJobEmailsSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (jobId: number) => api.markJobEmailsSeen(jobId),
    onMutate: async (jobId: number) => {
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });

      const previousJobs = snapshotJobsCaches(queryClient);

      patchJobsCaches(queryClient, (jobs) =>
        jobs.map((job): Job =>
          job.id === jobId ? { ...job, unseenCount: 0 } : job,
        ),
      );

      return { previousJobs };
    },
    onError: (_err, _jobId, context) => {
      if (context?.previousJobs) {
        restoreJobsCaches(queryClient, context.previousJobs);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
    },
  });
}

interface PatchEmailVariables {
  id: number;
  input: UpdateEmailInput;
}

export function usePatchEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: PatchEmailVariables) =>
      api.updateEmail(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: jobsQueryKey });
      void queryClient.invalidateQueries({ queryKey: unmatchedEmailsQueryKey });
    },
  });
}
