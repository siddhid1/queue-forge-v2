import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Overview" },
  { to: "/queues", label: "Queues" },
  { to: "/jobs", label: "Jobs" },
  { to: "/workers", label: "Workers" },
  { to: "/dead-letter", label: "Dead Letter" },
  { to: "/audit", label: "Audit Log" },
];

export function Layout() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <nav
        style={{
          width: 220,
          padding: "1rem",
          backgroundColor: "#1a1a2e",
          color: "#e0e0e0",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 1rem", color: "#fff" }}>Queue Forge</h2>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            style={({ isActive }) => ({
              color: isActive ? "#fff" : "#a0a0b0",
              textDecoration: "none",
              padding: "0.5rem 0.75rem",
              borderRadius: 6,
              backgroundColor: isActive ? "#16213e" : "transparent",
              fontWeight: isActive ? 600 : 400,
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ flex: 1, padding: "1.5rem", backgroundColor: "#f5f5f5", overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
