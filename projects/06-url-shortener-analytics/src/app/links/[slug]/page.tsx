"use client";

import { use, useEffect, useState } from "react";

interface Stats {
  slug: string;
  targetUrl: string;
  totalClicks: number;
  byReferrer: Record<string, number>;
  byCountry: Record<string, number>;
  recentClicks: { clickedAt: string; referrer: string | null; country: string | null; city: string | null }[];
}

export default function LinkStatsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`/api/links/${slug}/stats`)
      .then((res) => res.json())
      .then(setStats);
  }, [slug]);

  if (!stats) return <main>Loading...</main>;

  return (
    <main>
      <p>
        <a href="/">&larr; back</a>
      </p>
      <h1>
        <code>/{stats.slug}</code>
      </h1>
      <p className="muted">→ {stats.targetUrl}</p>
      <img src={`/api/links/${slug}/qr`} alt="QR code" width={150} height={150} />
      <p>
        <strong>{stats.totalClicks}</strong> total clicks
      </p>

      <h3>By referrer</h3>
      <ul>
        {Object.entries(stats.byReferrer).map(([ref, count]) => (
          <li key={ref}>
            {ref}: {count}
          </li>
        ))}
      </ul>

      <h3>By country</h3>
      <ul>
        {Object.entries(stats.byCountry).map(([country, count]) => (
          <li key={country}>
            {country}: {count}
          </li>
        ))}
      </ul>

      <h3>Recent clicks</h3>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Referrer</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {stats.recentClicks.map((c, i) => (
            <tr key={i}>
              <td>{new Date(c.clickedAt).toLocaleString()}</td>
              <td>{c.referrer ?? "(direct)"}</td>
              <td>{c.city ? `${c.city}, ${c.country}` : c.country ?? "Unknown"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
