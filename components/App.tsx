"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppData, player } from "@/lib/analysis";
import Overview from "./Overview";
import Upload from "./Upload";
import Transactions from "./Transactions";
import Budgets from "./Budgets";
import Quests from "./Quests";

type Tab = "overview" | "quests" | "transactions" | "budget" | "upload";
const TABS: { id: Tab; label: string; ico: string }[] = [
  { id: "overview", label: "Overview", ico: "🏠" },
  { id: "quests", label: "Quests", ico: "⚔️" },
  { id: "upload", label: "Upload", ico: "📥" },
  { id: "transactions", label: "Spending", ico: "🧾" },
  { id: "budget", label: "Budget", ico: "🎯" },
];

export interface Ctx {
  data: AppData;
  reload: () => Promise<void>;
  toast: (msg: string) => void;
  go: (t: Tab) => void;
}

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [toastMsg, setToastMsg] = useState<{ text: string; big: boolean } | null>(null);
  const lastXp = useRef<{ xp: number; level: number } | null>(null);

  const toast = useCallback((text: string, big = false) => {
    setToastMsg({ text, big });
    window.setTimeout(() => setToastMsg(null), big ? 4000 : 2800);
  }, []);

  const reload = useCallback(async () => {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (r.status === 401) {
      window.location.href = "/login";
      return;
    }
    const j = await r.json();
    if (!r.ok) {
      setError(j.error || "Couldn't load your data.");
      return;
    }
    setError("");
    setData(j);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const p = useMemo(() => (data ? player(data) : null), [data]);

  // Celebrate XP gains after any change.
  useEffect(() => {
    if (!p) return;
    const prev = lastXp.current;
    lastXp.current = { xp: p.xp, level: p.level };
    if (!prev) return;
    if (p.level > prev.level) toast(`⬆️ Level ${p.level}! You're now a ${p.title}`, true);
    else if (p.xp > prev.xp) toast(`+${p.xp - prev.xp} XP`);
  }, [p, toast]);

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    window.location.href = "/login";
  }

  const ctx: Ctx | null = data ? { data, reload, toast, go: setTab } : null;

  return (
    <>
      <main className="shell">
        <header className="topbar">
          <div className="brand">
            <img src="/icon.svg" alt="" />
            <span>Budget Quest</span>
          </div>
          <button className="link-btn" onClick={logout}>
            Lock
          </button>
        </header>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className="tab" aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <span className="ico" aria-hidden>
                {t.ico}
              </span>
              {t.label}
            </button>
          ))}
        </nav>

        {error && (
          <div className="err" role="alert">
            {error}
          </div>
        )}
        {!ctx && !error && <p className="muted">Loading your save file…</p>}
        {ctx && p && (
          <>
            {tab === "overview" && <Overview ctx={ctx} p={p} />}
            {tab === "quests" && <Quests ctx={ctx} p={p} />}
            {tab === "upload" && <Upload ctx={ctx} />}
            {tab === "transactions" && <Transactions ctx={ctx} />}
            {tab === "budget" && <Budgets ctx={ctx} />}
          </>
        )}
      </main>
      {toastMsg && (
        <div className={`toast ${toastMsg.big ? "levelup" : ""}`} role="status">
          {toastMsg.text}
        </div>
      )}
    </>
  );
}
