import { useWorkers } from "../api/hooks.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function Workers() {
  const { data, isLoading } = useWorkers();

  if (isLoading) return <div>Loading workers...</div>;

  const workers = data?.data?.items ?? [];

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Worker Explorer</h1>

      <div style={{ backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 1px 3px rgba(0,0,0,0.1)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "2px solid #eee", backgroundColor: "#fafafa" }}>
              <th style={{ padding: "0.75rem" }}>ID</th>
              <th style={{ padding: "0.75rem" }}>Hostname</th>
              <th style={{ padding: "0.75rem" }}>Status</th>
              <th style={{ padding: "0.75rem" }}>Health</th>
              <th style={{ padding: "0.75rem" }}>Last Heartbeat</th>
              <th style={{ padding: "0.75rem" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: "0.75rem", fontFamily: "monospace", fontSize: "0.85rem" }}>{w.id.slice(0, 8)}...</td>
                <td style={{ padding: "0.75rem", fontWeight: 600 }}>{w.hostname}</td>
                <td style={{ padding: "0.75rem" }}><StatusBadge status={w.status} /></td>
                <td style={{ padding: "0.75rem" }}><StatusBadge status={w.health} /></td>
                <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                  {w.heartbeatAgeMs !== null ? `${(w.heartbeatAgeMs / 1000).toFixed(0)}s ago` : "never"}
                </td>
                <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                  {new Date(w.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={6} style={{ padding: "1rem", textAlign: "center", color: "#999" }}>No workers registered</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
