import { ArrowRight, Brain, CalendarClock, Flame, Printer, Sparkles, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { nowMs } from "@/lib/clock";
import { useI18n, type Key } from "@/lib/i18n";
import type { ConceptRow, Report } from "@/lib/analytics";
import { dueLabel } from "@/components/ReviewPanel";

type Props = {
  report: Report;
  onReview: () => void;
  onStudy: (key: string) => void;
  bloom: (b: string) => string;
  children?: React.ReactNode;
};

/** Circular progress ring. */
function Ring({ value, size = 96, label }: { value: number; size?: number; label: string }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="kyro-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${value}%`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="9"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent-strong)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b>{value}%</b>
    </div>
  );
}

/** Forgetting-curve forecast: predicted recall over the next 30 days if nothing is reviewed. */
function Forecast({ data }: { data: number[] }) {
  const { t } = useI18n();
  const W = 520;
  const H = 190;
  const P = { l: 34, r: 12, t: 10, b: 26 };
  const x = (i: number) => P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const line = data
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("report.forecast")}>
      {[0, 25, 50, 75, 100].map((g) => (
        <g key={g}>
          <line
            x1={P.l}
            x2={W - P.r}
            y1={y(g)}
            y2={y(g)}
            stroke="var(--border)"
            strokeDasharray={g === 0 ? "" : "3 4"}
          />
          <text
            x={P.l - 6}
            y={y(g) + 3}
            textAnchor="end"
            fontSize="9"
            fill="var(--muted-foreground)"
          >
            {g}%
          </text>
        </g>
      ))}
      <line
        x1={P.l}
        x2={W - P.r}
        y1={y(60)}
        y2={y(60)}
        stroke="var(--live)"
        strokeDasharray="5 4"
        opacity=".6"
      />
      <path d={area} fill="var(--accent-strong)" opacity=".16" />
      <path
        d={line}
        fill="none"
        stroke="var(--accent-strong)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {[0, 7, 14, 21, 30].map((d) => (
        <text
          key={d}
          x={x(d)}
          y={H - 8}
          textAnchor={d === 0 ? "start" : d === 30 ? "end" : "middle"}
          fontSize="9"
          fill="var(--muted-foreground)"
        >
          {d === 0 ? t("due.today") : t("report.day", { n: d })}
        </text>
      ))}
    </svg>
  );
}

/** 12 weeks of study activity, one square per day. */
function Heatmap({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const weeks = Array.from({ length: 12 }, (_, w) => data.slice(w * 7, w * 7 + 7));
  return (
    <div className="heatmap" role="img" aria-label="activity">
      {weeks.map((wk, w) => (
        <div key={w} className="heat-col">
          {wk.map((n, d) => (
            <i key={d} className={`heat l${level(n)}`} title={`${n}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

const statusKey = (s: ConceptRow["state"]) => `status.${s}` as Key;

export function ReportPanel({ report: r, onReview, onStudy, bloom, children }: Props) {
  const { t, tp } = useI18n();
  const now = useMemo(() => nowMs(), []);
  const [showAll, setShowAll] = useState(false);
  const all = r.modules.flatMap((m) => m.concepts);
  const shown = showAll ? all : all.slice(0, 8);
  const activeDays = r.activity.filter((n) => n > 0).length;

  return (
    <section className="page-view report-page">
      <div className="page-title">
        <div>
          <small>{t("ui.report_card").toUpperCase()}</small>
          <h1>{t("ui.your_understanding_not_your_streak")}</h1>
          <p>{t("report.updated")}</p>
        </div>
        <Button variant="outline" className="no-print" onClick={() => window.print()}>
          <Printer /> {t("report.print")}
        </Button>
      </div>

      <div className="report-stats">
        <article className="report-stat main">
          <Ring value={r.overall} label={t("report.overall")} />
          <div>
            <small>{t("report.overall")}</small>
            <strong>{r.startedCount ? `${r.overall}%` : "—"}</strong>
            <span>{t("report.coverage", { n: r.startedCount, total: r.totalCount })}</span>
          </div>
        </article>
        <article className="report-stat">
          <span className="stat-ico">
            <Flame />
          </span>
          <div>
            <small>{t("report.streak")}</small>
            <strong>{r.streak}</strong>
            <span>{t("report.streakBest", { n: r.bestStreak })}</span>
          </div>
        </article>
        <article className="report-stat">
          <span className="stat-ico">
            <Brain />
          </span>
          <div>
            <small>{t("report.retention")}</small>
            <strong>{r.retention === null ? "—" : `${r.retention}%`}</strong>
            <span>
              {r.retention === null ? t("report.noRetention") : t("report.retentionHelp")}
            </span>
          </div>
        </article>
        <article className="report-stat">
          <span className="stat-ico">
            <Sparkles />
          </span>
          <div>
            <small>{t("report.points")}</small>
            <strong>{r.points}</strong>
            <span>{r.transferAvg === null ? "" : `${t("kind.transfer")} ${r.transferAvg}%`}</span>
          </div>
        </article>
      </div>

      {children}

      <div className="report-two">
        <section className="report-card">
          <h2>
            <CalendarClock /> {t("report.due")}
          </h2>
          {r.due.length === 0 ? (
            <p className="muted">{t("report.dueEmpty")}</p>
          ) : (
            <ul className="due-list">
              {r.due.slice(0, 6).map((d) => (
                <li key={d.key}>
                  <div>
                    <strong>{d.title}</strong>
                    <small>{d.moduleTitle}</small>
                  </div>
                  <em className="late">{dueLabel(t, tp, d.srs, now)}</em>
                </li>
              ))}
            </ul>
          )}
          <Button className="no-print" onClick={onReview}>
            {t("report.reviewNow")} <ArrowRight />
          </Button>
        </section>
        <section className="report-card">
          <h2>
            <Target /> {t("report.forecast")}
          </h2>
          {r.forecast.length ? (
            <>
              <Forecast data={r.forecast} />
              <small className="muted">{t("report.forecastHelp")}</small>
            </>
          ) : (
            <p className="muted">{t("report.forecastEmpty")}</p>
          )}
        </section>
      </div>

      <section className="report-card">
        <h2>{t("report.activity")}</h2>
        <small className="muted">{t("report.activityHelp", { days: activeDays })}</small>
        <Heatmap data={r.activity} />
        <div className="heat-legend">
          {t("report.less")} <i className="heat l0" /> <i className="heat l1" />{" "}
          <i className="heat l2" /> <i className="heat l3" /> <i className="heat l4" />{" "}
          {t("report.more")}
        </div>
      </section>

      <section className="report-card">
        <h2>{t("report.byModule")}</h2>
        <div className="module-bars">
          {r.modules.map((m) => (
            <article key={m.slug}>
              <header>
                <strong>{m.title}</strong>
                <span>{m.started ? `${m.mastery}%` : "—"}</span>
              </header>
              <div className="bar">
                <i style={{ width: `${m.mastery}%` }} />
              </div>
              <small>{t("report.started", { started: m.started, total: m.total })}</small>
              <div className="bloom-bars">
                {Object.entries(m.bloom).map(([lvl, v]) => (
                  <div key={lvl} title={`${bloom(lvl)} ${v}%`}>
                    <i style={{ height: `${Math.max(4, v)}%` }} />
                    <small>{bloom(lvl)}</small>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="report-card">
        <h2>{t("report.table")}</h2>
        <div className="table-scroll">
          <table className="concept-table">
            <thead>
              <tr>
                <th>{t("report.col.concept")}</th>
                <th>{t("report.col.mastery")}</th>
                <th>{t("report.col.next")}</th>
                <th>{t("report.col.status")}</th>
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.key}>
                  <td>
                    <strong>{c.title}</strong>
                    <small>
                      {c.moduleTitle} · {bloom(c.bloom)}
                    </small>
                  </td>
                  <td>
                    <div className="bar slim">
                      <i style={{ width: `${c.mastery}%` }} />
                    </div>
                    <small>{c.started ? `${c.mastery}%` : "—"}</small>
                  </td>
                  <td>{c.started ? dueLabel(t, tp, c.srs, now) : "—"}</td>
                  <td>
                    <span className={`status ${c.state}`}>{t(statusKey(c.state))}</span>
                  </td>
                  <td className="no-print">
                    <button type="button" className="link-btn" onClick={() => onStudy(c.key)}>
                      {c.started ? t("report.studyAgain") : t("report.start")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {all.length > 8 && (
          <button type="button" className="link-btn no-print" onClick={() => setShowAll(!showAll)}>
            {showAll ? "−" : `+${all.length - 8}`}
          </button>
        )}
      </section>

      <div className="report-two">
        <section className="report-card">
          <h2>{t("report.doubts")}</h2>
          <small className="muted">{t("report.doubtsHelp")}</small>
          {r.doubts.length === 0 ? (
            <p className="muted">{t("report.noDoubts")}</p>
          ) : (
            <ul className="doubt-list">
              {r.doubts.map((d) => (
                <li key={d.key}>
                  <header>
                    <strong>{d.title}</strong>
                    <span>{d.mastery}%</span>
                  </header>
                  {d.gaps.map((g, i) => (
                    <small key={i}>{g}</small>
                  ))}
                  <button
                    type="button"
                    className="link-btn no-print"
                    onClick={() => onStudy(d.key)}
                  >
                    {t("report.studyAgain")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="report-card">
          <h2>{t("report.recent")}</h2>
          {r.recent.length === 0 ? (
            <p className="muted">{t("report.noActivity")}</p>
          ) : (
            <ul className="recent-list">
              {r.recent.map((a, i) => (
                <li key={i}>
                  <div>
                    <strong>{a.title}</strong>
                    <small>
                      {t(`kind.${a.kind}` as Key)} · {new Date(a.at).toLocaleDateString()}
                    </small>
                  </div>
                  <span className={a.score >= 60 ? "up" : "down"}>{a.score}%</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
