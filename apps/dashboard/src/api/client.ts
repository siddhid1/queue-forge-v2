const BASE = "/api/v1/operations";

async function request<T>(path: string): Promise<T> {
  const token = localStorage.getItem("auth_token") || "dev-token";
  const response = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

async function mutate<T>(path: string, body: unknown): Promise<T> {
  const token = localStorage.getItem("auth_token") || "dev-token";
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Request failed" } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  getMetrics: (windowMinutes = 15) =>
    request<{ data: import("../types/api.js").MetricsSnapshot }>(`/metrics?windowMinutes=${windowMinutes}`),

  getQueues: () => request<{ data: import("../types/api.js").QueueSummary[] }>("/queues"),

  getQueue: (name: string) => request<{ data: import("../types/api.js").QueueSummary }>(`/queues/${name}`),

  pauseQueue: (name: string, reason: string) =>
    mutate<{ data: unknown }>(`/queues/${name}/pause`, { reason }),

  resumeQueue: (name: string, reason: string) =>
    mutate<{ data: unknown }>(`/queues/${name}/resume`, { reason }),

  listJobs: (params?: { status?: string; name?: string; limit?: number; cursor?: string }) => {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    if (params?.name) search.set("name", params.name);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return request<{ data: import("../types/api.js").CursorPage<import("../types/api.js").JobSummary> }>(
      `/jobs${qs ? `?${qs}` : ""}`,
    );
  },

  getJob: (id: string) => request<{ data: import("../types/api.js").JobDetail }>(`/jobs/${id}`),

  getJobExecutions: (id: string) =>
    request<{ data: import("../types/api.js").JobExecution[] }>(`/jobs/${id}/executions`),

  getJobEvents: (id: string) => request<{ data: import("../types/api.js").JobEvent[] }>(`/jobs/${id}/events`),

  retryJob: (id: string, reason: string) => mutate<{ data: unknown }>(`/jobs/${id}/retry`, { reason }),

  cancelJob: (id: string, reason: string) => mutate<{ data: unknown }>(`/jobs/${id}/cancel`, { reason }),

  listWorkers: (params?: { health?: string; limit?: number; cursor?: string }) => {
    const search = new URLSearchParams();
    if (params?.health) search.set("health", params.health);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return request<{ data: import("../types/api.js").CursorPage<import("../types/api.js").WorkerSummary> }>(
      `/workers${qs ? `?${qs}` : ""}`,
    );
  },

  getWorker: (id: string) => request<{ data: import("../types/api.js").WorkerSummary }>(`/workers/${id}`),

  listDeadLetters: (params?: { limit?: number; cursor?: string }) => {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return request<{ data: import("../types/api.js").CursorPage<import("../types/api.js").DeadLetterRecord> }>(
      `/dead-letter-jobs${qs ? `?${qs}` : ""}`,
    );
  },

  replayDeadLetter: (id: string, reason: string) =>
    mutate<{ data: unknown }>(`/dead-letter-jobs/${id}/replay`, { reason }),

  listAuditLogs: (params?: { action?: string; limit?: number; cursor?: string }) => {
    const search = new URLSearchParams();
    if (params?.action) search.set("action", params.action);
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.cursor) search.set("cursor", params.cursor);
    const qs = search.toString();
    return request<{ data: import("../types/api.js").CursorPage<import("../types/api.js").AuditRecord> }>(
      `/audit-logs${qs ? `?${qs}` : ""}`,
    );
  },
};
