import { useMetrics, useQueues, useWorkers } from "../api/hooks.js";
import { MetricCard } from "../components/MetricCard.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function Overview() {
  const { data: metricsData, isLoading: metricsLoading } = useMetrics();
  const { data: queuesData } = useQueues();
  const { data: workersData } = useWorkers();

  if (metricsLoading) return <div>Loading overview...</div>;

  const metrics = metricsData?.data;
  const queues = queuesData?.data ?? [];
  const workers = workersData?.data?.items ?? [];

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "1.5rem" }}>Operations Overview</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "2rem" }}>
        <MetricCard title="Total Jobs" value={metrics?.jobs.total ?? 0} color="#3b82f6" />
        <MetricCard
          title="Success Rate"
          value={metrics ? `${Math.round((metrics.jobs.successRate ?? 0) * 100)}%` : "N/A"}
          color="#10b981"
        />
        <MetricCard title="Active Workers" value={metrics?.workers.byStatus.ACTIVE ?? 0} color="#10b981" />
        <MetricCard title="Throughput" value={metrics ? `${metrics.window.throughputPerMinute.toFixed(1)}/min` : "0"} color="#8b5cf6" />
        <MetricCard title="Failed (window)" value={metrics?.window.jobsFailed ?? 0} color="#ef4444" />
        <MetricCard title="Retry Attempts" value={metrics?.jobs.retryAttempts ?? 0} color="#f59e0b" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        <div style={{ backgroundColor: "#fff", borderRadius: 8, padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>Queue Health</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
                <th style={{ padding: "0.5rem" }}>Queue</th>
                <th style={{ padding: "0.5rem" }}>Depth</th>
                <th style={{ padding: "0.5rem" }}>State</th>
                <th style={{ padding: "0.5rem" }}>Redis</th>
              </tr>
            </thead>
            <tbody>
              {queues.map((q) => (
                <tr key={q.name} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "0.5rem", fontWeight: 600 }}>{q.name}</td>
                  <td style={{ padding: "0.5rem" }}>{q.authoritativeDepth}</td>
                  <td style={{ padding: "0.5rem" }}><StatusBadge status={q.state} /></td>
                  <td style={{ padding: "0.5rem" }}>{q.executionLayerAvailable ? (q.executionDepth ?? "?") : "unavailable"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ backgroundColor: "#fff", borderRadius: 8, padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <h3 style={{ marginTop: 0 }}>Worker Status</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "2px solid #eee" }}>
                <th style={{ padding: "0.5rem" }}>Hostname</th>
                <th style={{ padding: "0.5rem" }}>Health</th>
                <th style={{ padding: "0.5rem" }}>Heartbeat</th>
              </tr>
            </thead>
            <tbody>
              {workers.slice(0, 10).map((w) => (
                <tr key={w.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "0.5rem" }}>{w.hostname}</td>
                  <td style={{ padding: "0.5rem" }}><StatusBadge status={w.health} /></td>
                  <td style={{ padding: "0.5rem", fontSize: "0.85rem" }}>
                    {w.heartbeatAgeMs !== null ? `${(w.heartbeatAgeMs / 1000).toFixed(0)}s ago` : "never"}
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr><td colSpan={3} style={{ padding: "1rem", textAlign: "center", color: "#999" }}>No workers registered</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
