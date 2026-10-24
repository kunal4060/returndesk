"use client";

import { useMemo, useRef, useState } from "react";
import { FrictionLadder } from "@/components/ops/FrictionLadder";
import { StateChip } from "@/components/ui/StateChip";
import { assessFriction } from "@/lib/engine";
import {
  detectorScores,
  evidenceSet,
  heavyReturners,
  scenario,
  str,
  type Rec,
} from "@/lib/data";
import { HONESTY_NOTICE, screenEvidence } from "@impactx/ml";

interface SeededScreening {
  evidence: Rec;
  signals: { signal: string; score: number | null; band: string; source: string; explanation: string; action: string }[];
  priorityScore: number;
  band: string;
  outcome: string;
}

function seededScreenings(): SeededScreening[] {
  const table = {
    labelling: str({ labelling: (detectorScoresLabelling()) }, "labelling"),
    scores: detectorScores.map((s) => ({
      evidenceId: str(s, "evidenceId"),
      aiLikelihood: Number(s.aiLikelihood ?? 0),
      confidenceNote: str(s, "confidenceNote"),
    })),
  };
  const corpus = evidenceSet.map((e) => ({
    id: str(e, "id"),
    phashHex: str(e, "phashHex") || undefined,
    sha256Hex: str(e, "sha256Hex") || undefined,
  }));
  return evidenceSet.map((photo) => {
    try {
      const result = screenEvidence({
        evidenceId: str(photo, "id"),
        exif: (photo.exif as never) ?? null,
        phashHex: str(photo, "phashHex") || undefined,
        sha256Hex: str(photo, "sha256Hex") || undefined,
        c2paPresent: typeof photo.c2paPresent === "boolean" ? photo.c2paPresent : undefined,
        corpus,
        deliveredAtISO: str(photo, "deliveredAt") || str(scenario.order as Rec, "deliveredAt"),
        photoClaimedOfDeliveredItem: true,
        precomputedTable: table as never,
      });
      return {
        evidence: photo,
        signals: result.signals,
        priorityScore: result.priorityScore,
        band: result.band,
        outcome: result.outcome,
      };
    } catch (e) {
      return {
        evidence: photo,
        signals: [],
        priorityScore: 0,
        band: "error",
        outcome: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

function detectorScoresLabelling(): string {
  return "Precomputed detector scores for the seeded evidence set — simulated set, NOT live inference";
}

interface LiveOnnxState {
  status: "idle" | "loading" | "done" | "failed";
  score?: number;
  accuracyLabel?: string;
  message?: string;
}

interface GeminiState {
  status: "idle" | "loading" | "done" | "failed";
  mode?: string;
  verdict?: Rec;
  signalExplanation?: string;
  message?: string;
}

export default function OpsFraudPage() {
  const heroProfile =
    heavyReturners.find((p) => str(p, "id") === "HR-1") ??
    heavyReturners.find((p) => str(p, "customerId") === "CUST-1042") ??
    heavyReturners[0];
  const assessment = useMemo(
    () => (heroProfile ? assessFriction(heroProfile) : undefined),
    [heroProfile],
  );
  const screenings = useMemo(() => seededScreenings(), []);

  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [onnx, setOnnx] = useState<LiveOnnxState>({ status: "idle" });
  const [gemini, setGemini] = useState<GeminiState>({ status: "idle" });
  const [claimedItem, setClaimedItem] = useState("Velocity Street Running Shoes");
  const [claimedDamage, setClaimedDamage] = useState("Sole shows wear consistent with outdoor use");

  const readFile = async (): Promise<{ blob: Blob; base64: string; mimeType: string } | null> => {
    const file = fileRef.current?.files?.[0];
    if (!file) return null;
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return { blob: file, base64: btoa(binary), mimeType: file.type || "image/jpeg" };
  };

  const runOnnx = async () => {
    const data = await readFile();
    if (!data) {
      setOnnx({ status: "failed", message: "Choose an image file first." });
      return;
    }
    setOnnx({ status: "loading" });
    try {
      // Live detector, loaded lazily in the browser only.
      const ml = await import("@impactx/ml");
      const detect = (ml as Record<string, unknown>).detectAiLikelihood as
        | ((image: Blob) => Promise<{ score: number; accuracyLabel: string }>)
        | undefined;
      if (!detect) throw new Error("detectAiLikelihood is not exported by @impactx/ml");
      const result = await detect(data.blob);
      setOnnx({ status: "done", score: result.score, accuracyLabel: result.accuracyLabel });
    } catch (e) {
      setOnnx({
        status: "failed",
        message:
          "The live ONNX detector could not run in this browser session (" +
          (e instanceof Error ? e.message.slice(0, 140) : String(e)) +
          "). The model downloads on first use and needs network access to the model host. The seeded screening results above are unaffected — and no decision ever depends on this score.",
      });
    }
  };

  const runGemini = async () => {
    const data = await readFile();
    if (!data) {
      setGemini({ status: "failed", message: "Choose an image file first." });
      return;
    }
    setGemini({ status: "loading" });
    try {
      const res = await fetch("/api/gemini-screen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          imageBase64: data.base64,
          mimeType: data.mimeType,
          claimedItem,
          claimedDamage,
        }),
      });
      const json = (await res.json()) as Rec;
      if (!res.ok) throw new Error(str(json, "error") || `HTTP ${res.status}`);
      const signal = (json.signal ?? {}) as Rec;
      setGemini({
        status: "done",
        mode: str(json, "mode"),
        verdict: (json.verdict ?? {}) as Rec,
        signalExplanation: str(signal, "explanation"),
      });
    } catch (e) {
      setGemini({ status: "failed", message: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div className="px-4 py-6 md:px-6">
      <p className="eyebrow">Ops · Fraud friction &amp; evidence lab</p>
      <h1 className="mt-1.5 text-[22px] font-bold tracking-tight">Verification, never accusation</h1>
      <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
        The friction ladder escalates checks for unusual return patterns — with every signal
        explained and a human appeal that can overturn it. Below it, the evidence lab screens
        return photos with an ensemble whose signals can only reorder a human review queue.
      </p>

      {/* Friction ladder — hero heavy returner */}
      <div className="mt-6">
        {heroProfile && assessment ? (
          <FrictionLadder profileId={str(heroProfile, "id")} assessment={assessment} />
        ) : (
          <p className="rounded border border-rule bg-surface p-5 text-sm text-ink-2">
            No heavy-returner profiles in the seeded dataset yet.
          </p>
        )}
      </div>
      {heroProfile && (
        <p className="mt-2.5 max-w-3xl text-[12.5px] text-ink-2">
          Seeded expectation for this profile: never escalate beyond level{" "}
          {String(heroProfile.expectedMaxFrictionLevel ?? "—")} — it is the fairness case the{" "}
          <a href="/eval" className="text-accent underline underline-offset-2">evaluation harness</a>{" "}
          measures across all {heavyReturners.length} seeded profiles.
        </p>
      )}

      {/* Evidence lab */}
      <section className="mt-10" aria-label="Evidence lab">
        <h2 className="eyebrow">Evidence lab</h2>
        <div className="mt-3 rounded border border-wait bg-surface px-4 py-3">
          <div className="eyebrow text-wait">Honesty notice</div>
          <p className="mt-1 max-w-4xl text-[13.5px] leading-relaxed">{HONESTY_NOTICE}</p>
          <p className="mt-1.5 text-[13px] font-medium">
            Hard rule: there is no code path from any score on this page to a cancelled or
            denied refund. Signals set review priority — a human decides.
          </p>
        </div>

        <h3 className="eyebrow mb-2 mt-6">Seeded evidence — screened live by the ensemble</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {screenings.map(({ evidence, signals, priorityScore, band, outcome }) => (
            <article key={str(evidence, "id")} className="rounded border border-rule bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="font-mono text-[13.5px] font-semibold">
                  {str(evidence, "id")} <span className="font-sans font-normal text-ink-2">· {str(evidence, "kind").replace(/_/g, " ")}</span>
                </h4>
                <span className="tnum text-[12.5px] text-ink-2">
                  review priority <span className="font-semibold text-ink">{priorityScore.toFixed(2)}</span> · band {band}
                </span>
              </div>
              {str(evidence, "notes") && (
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{str(evidence, "notes")}</p>
              )}
              <ul className="mt-2.5 flex flex-col">
                {signals.map((s, i) => (
                  <li key={i} className="border-t border-rule py-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-mono text-[12px] font-medium">{s.signal}</span>
                      <span className="tnum text-[12.5px]">{s.score === null ? "no score" : s.score.toFixed(2)}</span>
                      <StateChip label={s.band} tone={s.band === "high" ? "stuck" : s.band === "medium" ? "wait" : "ok"} shape="current" />
                      <span className="ml-auto font-mono text-[10.5px] text-ink-2">{s.action}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink-2">{s.explanation}</p>
                  </li>
                ))}
                {signals.length === 0 && <li className="py-2 text-[12.5px] text-ink-2">No signals.</li>}
              </ul>
              <p className="mt-2 font-mono text-[11.5px] text-ink-2">outcome: {outcome} · automatedDecision: null</p>
            </article>
          ))}
          {screenings.length === 0 && (
            <p className="rounded border border-rule bg-surface p-4 text-sm text-ink-2">No seeded evidence yet.</p>
          )}
        </div>

        {/* Try it live */}
        <h3 className="eyebrow mb-2 mt-8">Try it live — sandbox</h3>
        <div className="rounded border border-rule bg-surface p-5">
          <p className="max-w-3xl text-[13.5px] leading-relaxed text-ink-2">
            Upload any photo. It is screened in your browser by the live ONNX detector, and —
            separately — by a Gemini semantic-consistency check run server-side. Both are
            uncalibrated second opinions; neither can affect a refund from here.
          </p>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
              className="text-[13px]"
              aria-label="Choose an evidence photo to screen"
            />
            {fileName && <span className="font-mono text-[12px] text-ink-2">{fileName}</span>}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded border border-rule p-4">
              <div className="eyebrow">(a) Live ONNX detector — in your browser</div>
              <button
                onClick={runOnnx}
                disabled={onnx.status === "loading"}
                className="mt-2.5 rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper disabled:opacity-50"
              >
                {onnx.status === "loading" ? "Loading model & scoring…" : "Run ONNX detector"}
              </button>
              {onnx.status === "loading" && (
                <p className="mt-2 text-[13px] text-ink-2">First run downloads the model — this can take a while on a slow connection.</p>
              )}
              {onnx.status === "done" && (
                <div className="mt-2.5">
                  <p className="tnum text-[15px]">
                    AI likelihood: <span className="font-bold">{onnx.score?.toFixed(2)}</span>{" "}
                    <span className="text-[12.5px] text-ink-2">(uncalibrated)</span>
                  </p>
                  {onnx.accuracyLabel && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{onnx.accuracyLabel}</p>}
                </div>
              )}
              {onnx.status === "failed" && <p className="mt-2.5 text-[13px] leading-relaxed text-wait">{onnx.message}</p>}
            </div>
            <div className="rounded border border-rule p-4">
              <div className="eyebrow">(b) Gemini semantic check — server-side</div>
              <div className="mt-2.5 grid gap-2">
                <label className="text-[12.5px] text-ink-2">
                  Claimed item
                  <input value={claimedItem} onChange={(e) => setClaimedItem(e.target.value)} className="mt-0.5 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent" />
                </label>
                <label className="text-[12.5px] text-ink-2">
                  Claimed damage
                  <input value={claimedDamage} onChange={(e) => setClaimedDamage(e.target.value)} className="mt-0.5 w-full rounded border border-rule bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-accent" />
                </label>
              </div>
              <button
                onClick={runGemini}
                disabled={gemini.status === "loading"}
                className="mt-3 rounded bg-ink px-4 py-2 text-[13px] font-semibold text-paper disabled:opacity-50"
              >
                {gemini.status === "loading" ? "Checking…" : "Run Gemini semantic check"}
              </button>
              {gemini.status === "done" && gemini.verdict && (
                <div className="mt-2.5">
                  <span className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${gemini.mode === "live" ? "border-ok text-ok" : "border-wait text-wait"}`}>
                    {gemini.mode === "live" ? "LIVE" : "MOCK — no API key configured"}
                  </span>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-ink-2">Item matches claim</dt>
                    <dd className="font-mono">{String(gemini.verdict.itemMatch)}</dd>
                    <dt className="text-ink-2">Damage matches claim</dt>
                    <dd className="font-mono">{String(gemini.verdict.damageMatch)}</dd>
                    <dt className="text-ink-2">Inconsistencies</dt>
                    <dd>{Array.isArray(gemini.verdict.inconsistencies) && gemini.verdict.inconsistencies.length ? gemini.verdict.inconsistencies.map(String).join("; ") : "none reported"}</dd>
                  </dl>
                  {gemini.signalExplanation && <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{gemini.signalExplanation}</p>}
                </div>
              )}
              {gemini.status === "failed" && <p className="mt-2.5 text-[13px] text-stuck">{gemini.message}</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
