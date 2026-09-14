"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { canTransition } from "@/lib/statusMachine";

type Status = "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "REJECTED";
const ALL_STATUSES: Status[] = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER", "REJECTED"];

interface AppRow {
  id: number;
  company: string;
  role: string;
  status: Status;
  createdAt: string;
}

interface Analytics {
  totalApplications: number;
  byStatus: Record<Status, number>;
  responseRate: number;
  conversion: { appliedToScreening: number | null; screeningToInterview: number | null; interviewToOffer: number | null };
}

interface Me {
  id: number;
  email: string;
  name: string | null;
  role: "MEMBER" | "ADMIN";
}

export default function DashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [applications, setApplications] = useState<AppRow[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const meRes = await fetch("/api/me");
    if (!meRes.ok) {
      router.push("/login");
      return;
    }
    setMe(await meRes.json());
    const [appsRes, analyticsRes] = await Promise.all([fetch("/api/applications"), fetch("/api/analytics")]);
    setApplications(await appsRes.json());
    setAnalytics(await analyticsRes.json());
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, role }),
    });
    setCompany("");
    setRole("");
    await loadAll();
  }

  async function handleTransition(id: number, status: Status) {
    const res = await fetch(`/api/applications/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) await loadAll();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (loading) return <main>Loading...</main>;

  return (
    <main>
      <nav>
        <h1>💼 Applications</h1>
        <div>
          <span className="muted">{me?.email} ({me?.role})</span>{" "}
          <button className="secondary" onClick={handleLogout}>Log out</button>
        </div>
      </nav>

      {analytics && (
        <div className="stat-grid">
          <div className="stat-box">
            <div className="value">{analytics.totalApplications}</div>
            <div className="label">Total applications</div>
          </div>
          <div className="stat-box">
            <div className="value">{Math.round(analytics.responseRate * 100)}%</div>
            <div className="label">Response rate</div>
          </div>
          <div className="stat-box">
            <div className="value">{analytics.conversion.appliedToScreening !== null ? `${Math.round(analytics.conversion.appliedToScreening * 100)}%` : "—"}</div>
            <div className="label">Applied → Screening</div>
          </div>
          <div className="stat-box">
            <div className="value">{analytics.conversion.screeningToInterview !== null ? `${Math.round(analytics.conversion.screeningToInterview * 100)}%` : "—"}</div>
            <div className="label">Screening → Interview</div>
          </div>
          <div className="stat-box">
            <div className="value">{analytics.conversion.interviewToOffer !== null ? `${Math.round(analytics.conversion.interviewToOffer * 100)}%` : "—"}</div>
            <div className="label">Interview → Offer</div>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate}>
        <div className="form-row">
          <input placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} required />
          <input placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} required />
          <button type="submit">Add application</button>
        </div>
      </form>

      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Role</th>
            <th>Status</th>
            <th>Applied</th>
            <th>Move to</th>
          </tr>
        </thead>
        <tbody>
          {applications.map((app) => (
            <tr key={app.id}>
              <td>{app.company}</td>
              <td>{app.role}</td>
              <td>
                <span className={`badge ${app.status}`}>{app.status}</span>
              </td>
              <td className="muted">{new Date(app.createdAt).toLocaleDateString()}</td>
              <td>
                {ALL_STATUSES.filter((s) => canTransition(app.status, s)).map((s) => (
                  <button
                    key={s}
                    className="secondary"
                    style={{ marginRight: 4, fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                    onClick={() => handleTransition(app.id, s)}
                  >
                    {s}
                  </button>
                ))}
              </td>
            </tr>
          ))}
          {applications.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">No applications yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
