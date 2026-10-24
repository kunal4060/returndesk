"use client";

/**
 * ThreadDiagram — the "Three Truths" signature view.
 *
 * Seller, Platform and Provider stand as three ledger columns; each
 * recorded event is a row, and a thread connects the same event across
 * the columns. Straight and pale when all three agree; sagging (in the
 * quiet waiting ochre) where a source merely lags; kinked with the
 * delta printed in oxide red where the records disagree past budget.
 */

export type ThreadVerdict = "in_agreement" | "waiting" | "stuck";

export interface ThreadRow {
  label: string;
  seller?: string;
  platform?: string;
  provider?: string;
  verdict: ThreadVerdict;
  lagging?: "seller" | "platform" | "provider";
  deltaText?: string;
}

const COL_X = { seller: 110, platform: 330, provider: 550 } as const;
const COL_LABEL = { seller: "Seller", platform: "Platform", provider: "Provider" } as const;
const ROW_H = 58;
const TOP = 52;

const VERDICT_STROKE: Record<ThreadVerdict, string> = {
  in_agreement: "#C9BFA9",
  waiting: "#8A6D1F",
  stuck: "#B3372F",
};

export function ThreadDiagram({ rows, staleProvider = false }: { rows: ThreadRow[]; staleProvider?: boolean }) {
  const height = TOP + rows.length * ROW_H + 16;
  return (
    <div className="overflow-x-auto rounded border border-rule bg-surface p-4">
      <svg
        viewBox={`0 0 660 ${height}`}
        className="min-w-[620px]"
        role="img"
        aria-label="Three truths thread diagram: seller, platform and provider records compared row by row"
      >
        {(Object.keys(COL_X) as (keyof typeof COL_X)[]).map((col) => (
          <g key={col}>
            <text x={COL_X[col]} y={22} textAnchor="middle" fontSize="11" letterSpacing="1.4" fill="#57534E" fontWeight="600">
              {COL_LABEL[col].toUpperCase()}
            </text>
            <line x1={COL_X[col]} y1={32} x2={COL_X[col]} y2={height - 8} stroke="#E7E0D4" strokeWidth="1" />
            {col === "provider" && staleProvider && (
              <text x={COL_X[col]} y={height - 0} textAnchor="middle" fontSize="10.5" fill="#B3372F" fontWeight="600">
                STALE — provider outage (simulated)
              </text>
            )}
          </g>
        ))}

        {rows.map((row, i) => {
          const y = TOP + i * ROW_H;
          const pts = (["seller", "platform", "provider"] as const).map((col) => {
            const present = row[col] !== undefined;
            let py = y;
            if (row.verdict === "waiting" && row.lagging === col) py = y + 13;
            if (row.verdict === "stuck" && row.lagging === col) py = y + 10;
            return { col, x: COL_X[col], y: py, present, state: row[col] };
          });
          const path =
            row.verdict === "in_agreement"
              ? `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y} L ${pts[2].x} ${pts[2].y}`
              : `M ${pts[0].x} ${pts[0].y} Q ${pts[1].x} ${Math.max(pts[0].y, pts[1].y) + (row.verdict === "stuck" ? 2 : 14)} ${pts[1].x} ${pts[1].y} Q ${pts[2].x} ${Math.max(pts[1].y, pts[2].y) + (row.verdict === "stuck" ? 2 : 14)} ${pts[2].x} ${pts[2].y}`;
          return (
            <g key={i}>
              <text x={8} y={y - 14} fontSize="11" fill="#57534E" fontWeight="600">
                {row.label}
              </text>
              <path d={path} fill="none" stroke={VERDICT_STROKE[row.verdict]} strokeWidth={row.verdict === "stuck" ? 2 : 1.4} />
              {pts.map((p) => (
                <g key={p.col}>
                  {p.present ? (
                    <circle cx={p.x} cy={p.y} r="4" fill={row.verdict === "stuck" && row.lagging === p.col ? "#B3372F" : "#FFFFFF"} stroke={VERDICT_STROKE[row.verdict]} strokeWidth="1.6" />
                  ) : (
                    <g stroke="#B3372F" strokeWidth="1.4">
                      <line x1={p.x - 4} y1={p.y - 4} x2={p.x + 4} y2={p.y + 4} />
                      <line x1={p.x + 4} y1={p.y - 4} x2={p.x - 4} y2={p.y + 4} />
                    </g>
                  )}
                  <text x={p.x} y={p.y + 18} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" fill="#1C1917">
                    {p.present ? p.state : "missing"}
                  </text>
                </g>
              ))}
              {row.deltaText && (
                <text x={440} y={y - 14} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#B3372F">
                  {row.deltaText}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 border-t border-rule pt-2.5 text-[12px] text-ink-2">
        <span><span className="mr-1.5 inline-block h-[3px] w-6 bg-[#C9BFA9] align-middle" /> Straight — all three agree</span>
        <span><span className="mr-1.5 inline-block h-[3px] w-6 bg-wait align-middle" /> Sagging — a source is still inside its expected window (waiting)</span>
        <span><span className="mr-1.5 inline-block h-[3px] w-6 bg-stuck align-middle" /> Kinked — disagreement past budget (stuck), delta printed</span>
      </div>
    </div>
  );
}
