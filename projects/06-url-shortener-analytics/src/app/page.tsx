"use client";

import { useEffect, useState } from "react";

interface LinkRow {
  id: number;
  slug: string;
  targetUrl: string;
  createdAt: string;
  expiresAt: string | null;
  _count: { clicks: number };
}

export default function HomePage() {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [targetUrl, setTargetUrl] = useState("");
  const [customSlug, setCustomSlug] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadLinks() {
    const res = await fetch("/api/links");
    setLinks(await res.json());
  }

  useEffect(() => {
    loadLinks();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl,
          customSlug: customSlug.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create link");
        return;
      }
      setTargetUrl("");
      setCustomSlug("");
      await loadLinks();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>🔗 URL Shortener + Analytics</h1>

      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <input
            type="url"
            placeholder="https://example.com/a-very-long-url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="custom-slug (optional)"
            value={customSlug}
            onChange={(e) => setCustomSlug(e.target.value)}
          />
          <button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Shorten"}
          </button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Short link</th>
            <th>Target</th>
            <th>Clicks</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id}>
              <td>
                <code>/{link.slug}</code>
              </td>
              <td className="muted">{link.targetUrl.slice(0, 40)}{link.targetUrl.length > 40 ? "..." : ""}</td>
              <td>{link._count.clicks}</td>
              <td>
                <a href={`/links/${link.slug}`}>stats</a>
              </td>
            </tr>
          ))}
          {links.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">No links yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
