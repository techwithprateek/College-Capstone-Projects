import { describe, expect, it, vi } from "vitest";
import { buildGithubAuthorizeUrl, exchangeCodeForAccessToken, fetchGithubProfile } from "../src/lib/auth/github";

describe("buildGithubAuthorizeUrl", () => {
  it("includes client id, redirect uri, and state", () => {
    const url = new URL(buildGithubAuthorizeUrl("client123", "http://localhost:3000/callback", "state456"));

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("client123");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback");
    expect(url.searchParams.get("state")).toBe("state456");
  });
});

describe("exchangeCodeForAccessToken", () => {
  it("posts the code and returns the access token on success", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "gho_faketoken" }),
    });

    const token = await exchangeCodeForAccessToken(
      { clientId: "c", clientSecret: "s", code: "abc", redirectUri: "http://localhost/cb" },
      fetchSpy as unknown as typeof fetch,
    );

    expect(token).toBe("gho_faketoken");
    const [, options] = fetchSpy.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(body).toEqual({ client_id: "c", client_secret: "s", code: "abc", redirect_uri: "http://localhost/cb" });
  });

  it("throws if GitHub returns a non-ok response", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: false, status: 401 });

    await expect(
      exchangeCodeForAccessToken(
        { clientId: "c", clientSecret: "s", code: "bad", redirectUri: "http://localhost/cb" },
        fetchSpy as unknown as typeof fetch,
      ),
    ).rejects.toThrow(/401/);
  });

  it("throws if the response has no access_token (e.g. invalid code)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "bad_verification_code" }),
    });

    await expect(
      exchangeCodeForAccessToken(
        { clientId: "c", clientSecret: "s", code: "bad", redirectUri: "http://localhost/cb" },
        fetchSpy as unknown as typeof fetch,
      ),
    ).rejects.toThrow();
  });
});

describe("fetchGithubProfile", () => {
  it("returns the profile directly when the public email is set", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, email: "octocat@github.com", name: "The Octocat", login: "octocat" }),
    });

    const profile = await fetchGithubProfile("token", fetchSpy as unknown as typeof fetch);

    expect(profile).toEqual({ githubId: "123", email: "octocat@github.com", name: "The Octocat" });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // no need for the emails endpoint
  });

  it("falls back to /user/emails when the public email is private", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 123, email: null, name: null, login: "octocat" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { email: "secondary@example.com", primary: false, verified: true },
          { email: "primary@example.com", primary: true, verified: true },
        ],
      });

    const profile = await fetchGithubProfile("token", fetchSpy as unknown as typeof fetch);

    expect(profile.email).toBe("primary@example.com");
    expect(profile.name).toBe("octocat"); // falls back to login when name is null
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws when no verified email can be found at all", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 1, email: null, name: null, login: "x" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ email: "a@b.com", primary: true, verified: false }] });

    await expect(fetchGithubProfile("token", fetchSpy as unknown as typeof fetch)).rejects.toThrow(/verified email/);
  });
});
