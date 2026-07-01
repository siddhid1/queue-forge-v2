import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client.js";

export function useMetrics(windowMinutes = 15) {
  return useQuery({
    queryKey: ["metrics", windowMinutes],
    queryFn: () => api.getMetrics(windowMinutes),
  });
}

export function useQueues() {
  return useQuery({
    queryKey: ["queues"],
    queryFn: () => api.getQueues(),
  });
}

export function useQueue(name: string) {
  return useQuery({
    queryKey: ["queues", name],
    queryFn: () => api.getQueue(name),
    enabled: !!name,
  });
}

export function useJobs(params?: { status?: string; name?: string; limit?: number }) {
  return useQuery({
    queryKey: ["jobs", params],
    queryFn: () => api.listJobs(params),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: ["jobs", id],
    queryFn: () => api.getJob(id),
    enabled: !!id,
  });
}

export function useJobExecutions(id: string) {
  return useQuery({
    queryKey: ["jobs", id, "executions"],
    queryFn: () => api.getJobExecutions(id),
    enabled: !!id,
  });
}

export function useJobEvents(id: string) {
  return useQuery({
    queryKey: ["jobs", id, "events"],
    queryFn: () => api.getJobEvents(id),
    enabled: !!id,
  });
}

export function useWorkers(params?: { health?: string; limit?: number }) {
  return useQuery({
    queryKey: ["workers", params],
    queryFn: () => api.listWorkers(params),
  });
}

export function useWorker(id: string) {
  return useQuery({
    queryKey: ["workers", id],
    queryFn: () => api.getWorker(id),
    enabled: !!id,
  });
}

export function useDeadLetters(params?: { limit?: number }) {
  return useQuery({
    queryKey: ["dead-letters", params],
    queryFn: () => api.listDeadLetters(params),
  });
}

export function useAuditLogs(params?: { action?: string; limit?: number }) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => api.listAuditLogs(params),
  });
}

export function usePauseQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) => api.pauseQueue(name, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queues"] }),
  });
}

export function useResumeQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, reason }: { name: string; reason: string }) => api.resumeQueue(name, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["queues"] }),
  });
}

export function useRetryJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.retryJob(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["dead-letters"] });
    },
  });
}

export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.cancelJob(id, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useReplayDeadLetter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.replayDeadLetter(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dead-letters"] });
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
