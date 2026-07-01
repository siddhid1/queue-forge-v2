import { useState } from "react";
import { useJobs, useRetryJob, useCancelJob } from "../api/hooks.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function Jobs() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const { data, isLoading } = useJobs({ status: statusFilter, limit: 50 });
  const retryMutation = useRetryJob();
  const cancelMutation = useCancelJob();
  const [actionTarget, setActionTarget] = useState<{ id: string; action: "retry" | "cancel" } | null>(null);
  const [reason, setReason] = useState("");

  if (isLoading) return <div>Loading jobs...</div>;

  const jobs = data?.data?.items ?? [];

  const handleAction = async () => {
    if (!actionTarget || !reason.trim()) return;
    if (actionTarget.action === "retry") {
      await retryMutation.mutateAsync({ id: actionTarget.id, reason });
    } else {
      await cancelMutation.mutateAsync({ id: actionTarget.id, reason });
    }
    setActionTarget(null);
    setReason("");
  };

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Job Explorer</h1>

      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label>Status:</label>
        <select
          value={statusFilter ?? ""}
          onChange={(e) => setStatusFilter(e.target.value || undefined)}
          style={{ padding: "0.3rem 0.5rem", borderRadius: 4, border: "1px solid #ccc" }}
        >
          <option value="">All</option>
          <option value="PENDING">PENDING</option>
          <option value="RUNNING">RUNNING</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="FAILED">FAILED</option>
          <option value="RETRYING">RETRYING</option>
          <option value="CANCELED">CANCELED</option>
          <option value="DEAD_LETTER">DEAD_LETTER</option>
        </select>
      </div>

      <div style={{ backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #eee", backgroundColor: "#fafafa" }}>
              <th style={{ padding: "0.75rem" }}>Name</th>
              <th style={{ padding: "0.75rem" }}>Status</th>
              <th style={{ padding: "0.75rem" }}>Priority</th>
              <th style={{ padding: "0.75rem" }}>Attempts</th>
              <th style={{ padding: "0.75rem" }}>Created</th>
              <th style={{ padding: "0.75rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.75rem", fontWeight: 600 }}>{j.name}</td>
                <td style={{ padding: "0.75rem" }}><StatusBadge status={j.status} /></td>
                <td style={{ padding: "0.75rem" }}>{j.priority}</td>
                <td style={{ padding: "0.75rem" }}>{j.attempts}/{j.maxAttempts}</td>
                <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                  {new Date(j.createdAt).toLocaleString()}
                </td>
                <td style={{ padding: "0.75rem", display: "flex", gap: "0.25rem" }}>
                  {(j.status === "FAILED" || j.status === "DEAD_LETTER") && (
                    <button
                      onClick={() => setActionTarget({ id: j.id, action: "retry" })}
                      style={{ padding: "0.25rem 0.5rem", cursor: "pointer", borderRadius: 4, border: "1px solid #3b82f6", background: "#fff", color: "#3b82f6", fontSize: "0.8rem" }}
                    >
                      Retry
                    </button>
                  )}
                  {(j.status === "PENDING" || j.status === "RETRYING") && (
                    <button
                      onClick={() => setActionTarget({ id: j.id, action: "cancel" })}
                      style={{ padding: "0.25rem 0.5rem", cursor: "pointer", borderRadius: 4, border: "1px solid #ef4444", background: "#fff", color: "#ef4444", fontSize: "0.8rem" }}
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "#999" }}>No jobs found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {actionTarget && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 8, padding: "1.5rem", width: 400 }}>
            <h3>{actionTarget.action === "retry" ? "Retry" : "Cancel"} Job</h3>
            <p style={{ color: "#666", fontSize: "0.9rem" }}>Job ID: {actionTarget.id}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason..."
              rows={3}
              style={{ width: "100%", padding: "0.5rem", borderRadius: 4, border: "1px solid #ccc", margin: "1rem 0" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setActionTarget(null)} style={{ padding: "0.5rem 1rem", cursor: "pointer", borderRadius: 4, border: "1px solid #ccc", background: "#fff" }}>
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={!reason.trim()}
                style={{ padding: "0.5rem 1rem", cursor: "pointer", borderRadius: 4, border: "none", background: "#3b82f6", color: "#fff" }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
