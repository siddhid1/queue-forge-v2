const statusColors: Record<string, string> = {
  PENDING: "#f59e0b",
  RUNNING: "#3b82f6",
  COMPLETED: "#10b981",
  FAILED: "#ef4444",
  RETRYING: "#f97316",
  CANCELED: "#6b7280",
  DEAD_LETTER: "#dc2626",
  ACTIVE: "#10b981",
  HEALTHY: "#10b981",
  STALE: "#f59e0b",
  OFFLINE: "#ef4444",
  PAUSED: "#f59e0b",
};

export function StatusBadge({ status }: { status: string }) {
  const color = statusColors[status] || "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.5rem",
        borderRadius: 12,
        fontSize: "0.75rem",
        fontWeight: 600,
        color: "#fff",
        backgroundColor: color,
      }}
    >
      {status}
    </span>
  );
}
