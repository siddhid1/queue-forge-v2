import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Overview } from "./pages/Overview.js";
import { Queues } from "./pages/Queues.js";
import { Jobs } from "./pages/Jobs.js";
import { Workers } from "./pages/Workers.js";
import { DeadLetter } from "./pages/DeadLetter.js";
import { AuditLog } from "./pages/AuditLog.js";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="queues" element={<Queues />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="workers" element={<Workers />} />
        <Route path="dead-letter" element={<DeadLetter />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>
    </Routes>
  );
}
