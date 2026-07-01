interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}

export function MetricCard({ title, value, subtitle, color = "#2563eb" }: MetricCardProps) {
  return (
    <div
      style={{
        backgroundColor: "#fff",
        borderRadius: 8,
        padding: "1rem",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        borderLeft: `4px solid ${color}`,
      }}
    >
      <div style={{ fontSize: "0.8rem", color: "#666", marginBottom: "0.25rem" }}>{title}</div>
      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#1a1a2e" }}>{value}</div>
      {subtitle && <div style={{ fontSize: "0.75rem", color: "#999", marginTop: "0.25rem" }}>{subtitle}</div>}
    </div>
  );
}
