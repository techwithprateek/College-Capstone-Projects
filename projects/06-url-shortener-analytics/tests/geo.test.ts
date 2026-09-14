import { describe, expect, it, vi } from "vitest";
import { lookupGeo } from "../src/lib/geo";

describe("lookupGeo", () => {
  it("skips the network call entirely for loopback addresses", async () => {
    const fetchSpy = vi.fn();
    const result = await lookupGeo("127.0.0.1", fetchSpy);

    expect(result).toEqual({ country: null, city: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips private IP ranges (10.x, 192.168.x, 172.16-31.x)", async () => {
    const fetchSpy = vi.fn();
    await lookupGeo("10.0.0.5", fetchSpy);
    await lookupGeo("192.168.1.20", fetchSpy);
    await lookupGeo("172.20.0.1", fetchSpy);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns country/city on a successful lookup", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "success", country: "United States", city: "San Francisco" }),
    });

    const result = await lookupGeo("8.8.8.8", fetchSpy as unknown as typeof fetch);

    expect(result).toEqual({ country: "United States", city: "San Francisco" });
  });

  it("degrades to unknown on a network error, without throwing", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await lookupGeo("8.8.8.8", fetchSpy as unknown as typeof fetch);

    expect(result).toEqual({ country: null, city: null });
  });

  it("degrades to unknown when the API reports failure status", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "fail", message: "invalid query" }),
    });

    const result = await lookupGeo("not-a-real-ip", fetchSpy as unknown as typeof fetch);

    expect(result).toEqual({ country: null, city: null });
  });

  it("degrades to unknown on a non-ok HTTP response", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false });

    const result = await lookupGeo("8.8.8.8", fetchSpy as unknown as typeof fetch);

    expect(result).toEqual({ country: null, city: null });
  });
});
