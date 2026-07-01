import { useState } from "react";
import { useAuditLogs } from "../api/hooks.js";

export function AuditLog() {
  const [actionFilter, setActionFilter] = useState<string | undefined>();
  const { data, isLoading } = useAuditLogs({ action: actionFilter, limit: 100 });

  if (isLoading) return <div>Loading audit logs...</div>;

  const items = data?.data?.items ?? [];

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Audit Log</h1>

      <div style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <label>Action:</label>
        <select
          value={actionFilter ?? ""}
          onChange={(e) => setActionFilter(e.target.value || undefined)}
          style={{ padding: "0.3rem 0.5rem", borderRadius: 4, border: "1px solid #ccc" }}
        >
          <option value="">All</option>
          <option value="job.retry">job.retry</option>
          <option value="job.cancel">job.cancel</option>
          <option value="dlq.replay">dlq.replay</option>
          <option value="queue.pause">queue.pause</option>
          <option value="queue.resume">queue.resume</option>
        </select>
      </div>

      <div style={{ backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #eee", backgroundColor: "#fafafa" }}>
              <th style={{ padding: "0.75rem" }}>Time</th>
              <th style={{ padding: "0.75rem" }}>Actor</th>
              <th style={{ padding: "0.75rem" }}>Action</th>
              <th style={{ padding: "0.75rem" }}>Target</th>
              <th style={{ padding: "0.75rem" }}>Reason</th>
              <th style={{ padding: "0.75rem" }}>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {items.map((log) => (
              <tr key={log.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>{new Date(log.createdAt).toLocaleString()}</td>
                <td style={{ padding: "0.75rem", fontFamily: "monospace", fontSize: "0.85rem" }}>{log.actorId}</td>
                <td style={{ padding: "0.75rem", fontWeight: 600 }}>{log.action}</td>
                <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                  {log.targetType}:{log.targetId.slice(0, 8)}...
                </td>
                <td style={{ padding: "0.75rem", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {log.reason}
                </td>
                <td style={{ padding: "0.75rem" }}>
                  <span style={{ color: log.outcome === "accepted" ? "#10b981" : "#ef4444", fontWeight: 600 }}>
                    {log.outcome}
                  </span>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "#999" }}>No audit log entries</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
