// Works in both the Edge middleware and Node route handlers (Web Crypto only).
export const COOKIE = "bq_session";

async function hmac(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The session token is derived from the passcode, so changing APP_PASSCODE logs everyone out. */
export async function sessionToken(): Promise<string | null> {
  const pass = process.env.APP_PASSCODE;
  if (!pass) return null;
  return hmac(pass, "budget-quest-session-v1");
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const expected = await sessionToken();
  if (!expected || expected.length !== value.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
