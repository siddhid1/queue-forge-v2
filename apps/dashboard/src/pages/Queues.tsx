import { useState } from "react";
import { useQueues, usePauseQueue, useResumeQueue } from "../api/hooks.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function Queues() {
  const { data, isLoading } = useQueues();
  const pauseMutation = usePauseQueue();
  const resumeMutation = useResumeQueue();
  const [reason, setReason] = useState("");
  const [actionTarget, setActionTarget] = useState<{ name: string; action: "pause" | "resume" } | null>(null);

  if (isLoading) return <div>Loading queues...</div>;

  const queues = data?.data ?? [];

  const handleAction = async () => {
    if (!actionTarget || !reason.trim()) return;
    if (actionTarget.action === "pause") {
      await pauseMutation.mutateAsync({ name: actionTarget.name, reason });
    } else {
      await resumeMutation.mutateAsync({ name: actionTarget.name, reason });
    }
    setActionTarget(null);
    setReason("");
  };

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Queue Explorer</h1>

      <div style={{ backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #eee", backgroundColor: "#fafafa" }}>
              <th style={{ padding: "0.75rem" }}>Name</th>
              <th style={{ padding: "0.75rem" }}>State</th>
              <th style={{ padding: "0.75rem" }}>Depth (PG)</th>
              <th style={{ padding: "0.75rem" }}>Depth (Redis)</th>
              <th style={{ padding: "0.75rem" }}>Oldest Pending</th>
              <th style={{ padding: "0.75rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.name} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.75rem", fontWeight: 600 }}>{q.name}</td>
                <td style={{ padding: "0.75rem" }}><StatusBadge status={q.state} /></td>
                <td style={{ padding: "0.75rem" }}>{q.authoritativeDepth}</td>
                <td style={{ padding: "0.75rem" }}>{q.executionLayerAvailable ? (q.executionDepth ?? "?") : "N/A"}</td>
                <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                  {q.oldestPendingAt ? new Date(q.oldestPendingAt).toLocaleString() : "-"}
                </td>
                <td style={{ padding: "0.75rem" }}>
                  {q.state === "ACTIVE" ? (
                    <button
                      onClick={() => setActionTarget({ name: q.name, action: "pause" })}
                      style={{ padding: "0.3rem 0.75rem", cursor: "pointer", borderRadius: 4, border: "1px solid #f59e0b", background: "#fff", color: "#f59e0b" }}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      onClick={() => setActionTarget({ name: q.name, action: "resume" })}
                      style={{ padding: "0.3rem 0.75rem", cursor: "pointer", borderRadius: 4, border: "1px solid #10b981", background: "#fff", color: "#10b981" }}
                    >
                      Resume
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {actionTarget && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 8, padding: "1.5rem", width: 400 }}>
            <h3>{actionTarget.action === "pause" ? "Pause" : "Resume"} Queue: {actionTarget.name}</h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for this action..."
              rows={3}
              style={{ width: "100%", padding: "0.5rem", borderRadius: 4, border: "1px solid #ccc", margin: "1rem 0" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setActionTarget(null)} style={{ padding: "0.5rem 1rem", cursor: "pointer", borderRadius: 4, border: "1px solid #ccc", background: "#fff" }}>
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={!reason.trim() || pauseMutation.isPending || resumeMutation.isPending}
                style={{ padding: "0.5rem 1rem", cursor: "pointer", borderRadius: 4, border: "none", background: actionTarget.action === "pause" ? "#f59e0b" : "#10b981", color: "#fff" }}
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
