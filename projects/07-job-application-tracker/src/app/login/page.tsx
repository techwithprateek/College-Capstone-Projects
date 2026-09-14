"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 360 }}>
      <h1>💼 Job Application Tracker</h1>
      <form onSubmit={handleSubmit}>
        <div className="form-row" style={{ flexDirection: "column" }}>
          <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input
            type="password"
            placeholder="password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={submitting} style={{ width: "100%" }}>
          {mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}

      <p className="muted" style={{ marginTop: "1rem" }}>
        {mode === "login" ? "No account yet?" : "Already have an account?"}{" "}
        <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "login" ? "register" : "login"); }}>
          {mode === "login" ? "Create one" : "Log in"}
        </a>
      </p>

      <hr style={{ margin: "1.5rem 0" }} />
      <a href="/api/auth/github">
        <button className="secondary" style={{ width: "100%" }}>Sign in with GitHub</button>
      </a>
    </main>
  );
}
