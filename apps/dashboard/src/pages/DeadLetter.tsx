import { useState } from "react";
import { useDeadLetters, useReplayDeadLetter } from "../api/hooks.js";

export function DeadLetter() {
  const { data, isLoading } = useDeadLetters({ limit: 50 });
  const replayMutation = useReplayDeadLetter();
  const [actionTarget, setActionTarget] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (isLoading) return <div>Loading dead letter jobs...</div>;

  const items = data?.data?.items ?? [];

  const handleReplay = async () => {
    if (!actionTarget || !reason.trim()) return;
    await replayMutation.mutateAsync({ id: actionTarget, reason });
    setActionTarget(null);
    setReason("");
  };

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Dead Letter Queue</h1>

      <div style={{ backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #eee", backgroundColor: "#fafafa" }}>
              <th style={{ padding: "0.75rem" }}>Job ID</th>
              <th style={{ padding: "0.75rem" }}>Reason</th>
              <th style={{ padding: "0.75rem" }}>Created</th>
              <th style={{ padding: "0.75rem" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((dlq) => (
              <tr key={dlq.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.75rem", fontFamily: "monospace", fontSize: "0.85rem" }}>{dlq.jobId.slice(0, 8)}...</td>
                <td style={{ padding: "0.75rem", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{dlq.reason ?? "-"}</td>
                <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>{new Date(dlq.createdAt).toLocaleString()}</td>
                <td style={{ padding: "0.75rem" }}>
                  <button
                    onClick={() => setActionTarget(dlq.id)}
                    style={{ padding: "0.25rem 0.5rem", cursor: "pointer", borderRadius: 4, border: "1px solid #10b981", background: "#fff", color: "#10b981", fontSize: "0.8rem" }}
                  >
                    Replay
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={4} style={{ padding: "1rem", textAlign: "center", color: "#999" }}>No dead letter jobs</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {actionTarget && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ backgroundColor: "#fff", borderRadius: 8, padding: "1.5rem", width: 400 }}>
            <h3>Replay Dead Letter Job</h3>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter reason for replay..."
              rows={3}
              style={{ width: "100%", padding: "0.5rem", borderRadius: 4, border: "1px solid #ccc", margin: "1rem 0" }}
            />
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button onClick={() => setActionTarget(null)} style={{ padding: "0.5rem 1rem", cursor: "pointer", borderRadius: 4, border: "1px solid #ccc", background: "#fff" }}>
                Cancel
              </button>
              <button
                onClick={handleReplay}
                disabled={!reason.trim() || replayMutation.isPending}
                style={{ padding: "0.5rem 1rem", cursor: "pointer", borderRadius: 4, border: "none", background: "#10b981", color: "#fff" }}
              >
                Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
