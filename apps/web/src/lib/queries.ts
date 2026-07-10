import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, type JobsResponse } from "./api";
import type { Job, NewEmailInput, UpdateEmailInput, UpdateJobInput } from "./types";

export const jobsQueryKey = ["jobs"] as const;
export const unmatchedEmailsQueryKey = ["emails", "unmatched"] as const;

export function useJobs() {
  return useQuery({
    queryKey: jobsQueryKey,
    queryFn: api.getJobs,
    refetchOnWindowFocus: true,
  });
}

interface UpdateJobVariables {
  id: number;
  input: UpdateJobInput;
}

function patchJobInCache(
  queryClient: QueryClient,
  id: number,
  input: UpdateJobInput,
) {
  queryClient.setQueryData<JobsResponse>(jobsQueryKey, (old) => {
    if (!old) return old;
    return {
      jobs: old.jobs.map((job) =>
        job.id === id ? { ...job, ...input } : job,
      ),
    };
  });
}

export function useUpdateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: UpdateJobVariables) =>
      api.updateJob(id, input),
    onMutate: async ({ id, input }: UpdateJobVariables) => {
      await queryClient.cancelQueries({ queryKey: jobsQueryKey });

      const previousJobs = queryClient.getQueryData<JobsResponse>(
        jobsQueryKey,
      );

      patchJobInCache(queryClient, id, input);

      return { previousJobs };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousJobs) {
        queryClient.setQueryData<JobsResponse>(
          jobsQueryKey,
          context.previousJobs,
        );
      }
    },
    onSettled: () => {
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

      const previousJobs = queryClient.getQueryData<JobsResponse>(
        jobsQueryKey,
      );

      queryClient.setQueryData<JobsResponse>(jobsQueryKey, (old) => {
        if (!old) return old;
        return {
          jobs: old.jobs.map((job): Job =>
            job.id === jobId ? { ...job, unseenCount: 0 } : job,
          ),
        };
      });

      return { previousJobs };
    },
    onError: (_err, _jobId, context) => {
      if (context?.previousJobs) {
        queryClient.setQueryData<JobsResponse>(
          jobsQueryKey,
          context.previousJobs,
        );
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
