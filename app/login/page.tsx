"use client";
import { useState } from "react";

export default function Login() {
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode: pass }),
    });
    if (r.ok) {
      window.location.href = "/";
      return;
    }
    const j = await r.json().catch(() => ({}));
    setErr(j.error || "Couldn't unlock. Try again.");
    setBusy(false);
  }

  return (
    <main className="shell" style={{ maxWidth: 420, paddingTop: "12vh" }}>
      <form className="panel stack" onSubmit={submit}>
        <div className="row">
          <img src="/icon.svg" alt="" width={40} height={40} />
          <div>
            <h1 className="pixel" style={{ fontSize: "1.6rem" }}>Budget Quest</h1>
            <p className="faint">Enter your passcode to load your save file.</p>
          </div>
        </div>
        <label className="stack" style={{ gap: 6 }}>
          <span className="muted" style={{ fontSize: "0.9rem" }}>Passcode</span>
          <input
            className="input"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
          />
        </label>
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy || !pass}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </main>
  );
}
