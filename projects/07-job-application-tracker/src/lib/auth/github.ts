/**
 * The GitHub OAuth2 Authorization Code flow, implemented directly against
 * GitHub's HTTP API rather than through an auth framework — this is the
 * actual mechanism NextAuth/Auth.js etc. wrap, made visible: redirect the
 * user to GitHub with a `state` value, GitHub redirects back with a `code`,
 * exchange that code server-side for an access token, then use the token
 * to fetch the user's profile. Each step is its own small, testable
 * function.
 */

export interface GithubProfile {
  githubId: string;
  email: string;
  name: string | null;
}

export function buildGithubAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCodeForAccessToken(
  params: { clientId: string; clientSecret: string; code: string; redirectUri: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub token exchange failed with status ${res.status}`);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`GitHub token exchange did not return an access_token: ${JSON.stringify(data)}`);
  }
  return data.access_token as string;
}

export async function fetchGithubProfile(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
  };

  const userRes = await fetchImpl("https://api.github.com/user", { headers });
  if (!userRes.ok) {
    throw new Error(`GitHub /user request failed with status ${userRes.status}`);
  }
  const user = await userRes.json();

  // A user's primary email can be private, in which case GET /user's
  // `email` field is null — the emails endpoint is the reliable source.
  let email: string | null = user.email ?? null;
  if (!email) {
    const emailsRes = await fetchImpl("https://api.github.com/user/emails", { headers });
    if (emailsRes.ok) {
      const emails: { email: string; primary: boolean; verified: boolean }[] = await emailsRes.json();
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      email = primary?.email ?? null;
    }
  }

  if (!email) {
    throw new Error("Could not determine a verified email address from the GitHub account");
  }

  return { githubId: String(user.id), email, name: user.name ?? user.login ?? null };
}
