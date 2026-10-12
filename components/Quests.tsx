"use client";
import { money, monthLabel, Player, questStatus } from "@/lib/analysis";
import { cat } from "@/lib/categories";
import type { Ctx } from "./App";
import { PlayerCard } from "./Overview";

export default function Quests({ ctx, p }: { ctx: Ctx; p: Player }) {
  const { data } = ctx;
  const quests = data.quests.map((q) => ({ q, s: questStatus(q, data.transactions) })).reverse();
  const active = quests.filter((x) => x.s.state === "active");
  const finished = quests.filter((x) => x.s.state !== "active");

  async function abandon(id: number) {
    if (!confirm("Abandon this quest?")) return;
    await fetch(`/api/quests?id=${id}`, { method: "DELETE" });
    await ctx.reload();
  }

  return (
    <div className="stack">
      <PlayerCard p={p} />

      <section className="panel stack">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <h2>Active quests</h2>
          <button className="link-btn" onClick={() => ctx.go("overview")}>
            Find more on Overview
          </button>
        </div>
        {active.length === 0 && (
          <p className="muted">
            No quests running. Accept one from “Where to save” on the Overview — each completed quest is worth 250 XP.
          </p>
        )}
        {active.map(({ q, s }) => (
          <div className="quest" key={q.id}>
            <div className="row between">
              <strong>
                {cat(q.category).emoji} {q.title}
              </strong>
              <span className="pill gold">+250 XP</span>
            </div>
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              Keep {cat(q.category).label.toLowerCase()} under {money(q.target, false)} in {monthLabel(q.month)} (you usually spend about {money(q.baseline, false)}).
            </p>
            <div className="qbar">
              <span className={s.progress > 1 ? "over" : ""} style={{ width: `${Math.min(100, s.progress * 100)}%` }} />
            </div>
            <div className="row between faint num">
              <span>
                {money(s.spent)} used · {money(Math.max(0, q.target - s.spent))} left
              </span>
              <button className="link-btn" onClick={() => abandon(q.id)}>
                Abandon
              </button>
            </div>
          </div>
        ))}
      </section>

      {finished.length > 0 && (
        <section className="panel stack">
          <h2>Quest log</h2>
          {finished.map(({ q, s }) => (
            <div className={`quest ${s.state}`} key={q.id}>
              <div className="row between">
                <strong>
                  {cat(q.category).emoji} {q.title}
                </strong>
                <span className={`pill ${s.state === "won" ? "good" : "bad"}`}>{s.state === "won" ? "✓ Completed" : "✕ Failed"}</span>
              </div>
              <p className="faint num">
                {monthLabel(q.month)}: spent {money(s.spent)} against a target of {money(q.target, false)}
                {s.state === "won" ? ` — saved about ${money(Math.max(0, q.baseline - s.spent), false)} vs usual` : ""}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="panel">
        <h2 style={{ marginBottom: 12 }}>Badges</h2>
        <div className="badges">
          {p.badges.map((b) => (
            <div key={b.id} className={`badge ${b.earned ? "" : "locked"}`} title={b.earned ? "Earned" : "Locked"}>
              <span className="b-emo" aria-hidden>
                {b.emoji}
              </span>
              <span className="b-name">
                {b.name}
                {!b.earned && <span className="sr-only"> (locked)</span>}
              </span>
              <span className="b-desc">{b.desc}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: 8 }}>How you earned your XP</h2>
        {p.log.length === 0 && <p className="muted">Upload a statement to earn your first 100 XP.</p>}
        <table className="data">
          <tbody>
            {p.log.map((l, i) => (
              <tr key={i}>
                <td>{l.label}</td>
                <td className="r">+{l.xp} XP</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="faint" style={{ marginTop: 10 }}>
          Statement +100 · budget set +50 · goal set +50 · month under budget +150 · category on target +20 · quest completed +250
        </p>
      </section>
    </div>
  );
}
