import React, { useMemo, useState } from "react";
import { Helmet } from "react-helmet";
import { Activity, ArrowRight, BrainCircuit, FileSpreadsheet, Gauge, ShieldCheck, Sparkles, Target, TrendingUp, TriangleAlert } from "lucide-react";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import { FileDropzone } from "../components/FileDropzone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/Select";
import { postDecisionBrief, type DecisionBriefOutput } from "../endpoints/decision-brief_POST.schema";
import styles from "./_index.module.css";

type Row = Record<string, string | number>;

const SAMPLE: Row[] = [
  { Month: "2026-01", Revenue: 117900, Leads: 1680, ConversionRate: 5.4, MarketingSpend: 27000, CAC: 30, Churn: 2.8 },
  { Month: "2026-02", Revenue: 121100, Leads: 1720, ConversionRate: 5.5, MarketingSpend: 27600, CAC: 30, Churn: 2.7 },
  { Month: "2026-03", Revenue: 123400, Leads: 1750, ConversionRate: 5.5, MarketingSpend: 28000, CAC: 30, Churn: 2.7 },
  { Month: "2026-04", Revenue: 126700, Leads: 1780, ConversionRate: 5.6, MarketingSpend: 28600, CAC: 29, Churn: 2.6 },
  { Month: "2026-05", Revenue: 129900, Leads: 1810, ConversionRate: 5.7, MarketingSpend: 29100, CAC: 29, Churn: 2.6 },
  { Month: "2026-06", Revenue: 132100, Leads: 1840, ConversionRate: 5.7, MarketingSpend: 29500, CAC: 29, Churn: 2.5 },
  { Month: "2026-07", Revenue: 134500, Leads: 1870, ConversionRate: 5.8, MarketingSpend: 30000, CAC: 28, Churn: 2.5 },
  { Month: "2026-08", Revenue: 137900, Leads: 1920, ConversionRate: 5.9, MarketingSpend: 30800, CAC: 28, Churn: 2.4 },
  { Month: "2026-09", Revenue: 119000, Leads: 1710, ConversionRate: 5.0, MarketingSpend: 31500, CAC: 36, Churn: 3.2 },
  { Month: "2026-10", Revenue: 142800, Leads: 1980, ConversionRate: 6.0, MarketingSpend: 31600, CAC: 27, Churn: 2.4 },
];

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map(v => (v - m) ** 2))) || 1;
};
const slope = (a: number[]) => {
  const xm = (a.length - 1) / 2;
  const ym = mean(a);
  let n = 0, d = 0;
  a.forEach((y, i) => { n += (i - xm) * (y - ym); d += (i - xm) ** 2; });
  return n / (d || 1);
};
const corr = (a: number[], b: number[]) => {
  const ma = mean(a), mb = mean(b);
  let n = 0, da = 0, db = 0;
  a.forEach((x, i) => {
    const u = x - ma, v = b[i] - mb;
    n += u * v; da += u * u; db += v * v;
  });
  return n / Math.sqrt((da || 1) * (db || 1));
};
const format = (v: number) => Math.abs(v) >= 1000 ? Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v) : v.toFixed(1);

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV needs a header and at least one data row.");
  const headers = lines[0].split(",").map(x => x.trim());
  return lines.slice(1).map(line => {
    const values = line.split(",").map(x => x.trim());
    const row: Row = {};
    headers.forEach((h, i) => {
      const raw = values[i] ?? "";
      const num = Number(raw);
      row[h] = raw !== "" && Number.isFinite(num) ? num : raw;
    });
    return row;
  });
}

export default function Home() {
  const [rows, setRows] = useState<Row[]>(SAMPLE);
  const numericColumns = useMemo(() => {
    const first = rows[0] || {};
    return Object.keys(first).filter(k => rows.every(r => typeof r[k] === "number"));
  }, [rows]);
  const [target, setTarget] = useState("Revenue");
  const [fileName, setFileName] = useState("signalforge_sample.csv");
  const [brief, setBrief] = useState<DecisionBriefOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analysis = useMemo(() => {
    const safeTarget = numericColumns.includes(target) ? target : numericColumns[0];
    if (!safeTarget) return null;
    const values = rows.map(r => Number(r[safeTarget]));
    const latest = values.at(-1) ?? 0;
    const trendPct = (slope(values) / Math.max(Math.abs(mean(values)), 1)) * 100;
    const anomalies = values
      .map((value, index) => ({ index, value, z: Math.abs((value - mean(values)) / sd(values)) }))
      .filter(x => x.z > 1.8);
    const drivers = numericColumns
      .filter(c => c !== safeTarget)
      .map(metric => ({ metric, correlation: corr(values, rows.map(r => Number(r[metric]))) }))
      .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
      .slice(0, 5);
    const recentSlope = values.length >= 4 ? slope(values.slice(-4)) : slope(values);
    const forecast = latest + recentSlope;
    const forecastDeltaPct = ((forecast - latest) / Math.max(Math.abs(latest), 1)) * 100;
    return { target: safeTarget, latest, trendPct, anomalies, drivers, forecast, forecastDeltaPct, points: values.length };
  }, [rows, numericColumns, target]);

  async function handleFiles(files: File[]) {
    const file = files[0];
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text());
      setRows(parsed);
      const nums = Object.keys(parsed[0] || {}).filter(k => parsed.every(r => typeof r[k] === "number"));
      setTarget(nums.includes("Revenue") ? "Revenue" : nums[0] || "");
      setFileName(file.name);
      setBrief(null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse CSV.");
    }
  }

  async function runAgent() {
    if (!analysis) return;
    setLoading(true);
    setError("");
    try {
      const result = await postDecisionBrief({
        datasetName: fileName,
        target: analysis.target,
        latest: analysis.latest,
        trendPct: analysis.trendPct,
        forecast: analysis.forecast,
        forecastDeltaPct: analysis.forecastDeltaPct,
        anomalies: analysis.anomalies.map(a => ({ index: a.index, value: a.value, z: a.z })),
        drivers: analysis.drivers,
        points: analysis.points,
      });
      setBrief(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Agent analysis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <Helmet>
        <title>SignalForge AI — Decision Agent</title>
        <meta name="description" content="AI decision intelligence powered by NVIDIA Nemotron on Nebius Token Factory." />
      </Helmet>

      <header className={styles.header}>
        <div className={styles.brand}><div className={styles.mark}>SF</div><div><strong>SignalForge AI</strong><span>Decision Agent</span></div></div>
        <div className={styles.powered}><Badge variant="outline">Nebius Token Factory</Badge><Badge variant="outline">NVIDIA Nemotron</Badge></div>
      </header>

      <section className={styles.hero}>
        <div>
          <div className={styles.eyebrow}><Sparkles size={14}/> Best Apps & Agents track</div>
          <h1>From business data to a decision you can defend.</h1>
          <p>SignalForge combines quantitative analytics with a multi-step AI reasoning pipeline: <b>Analyst → Strategist → Critic</b>. It separates evidence from inference and turns noisy KPIs into a concise executive action plan.</p>
        </div>
        <div className={styles.architecture}>
          <div><FileSpreadsheet size={17}/><span>Business data</span></div><ArrowRight size={15}/>
          <div><Activity size={17}/><span>Analytics</span></div><ArrowRight size={15}/>
          <div><BrainCircuit size={17}/><span>Nemotron reasoning</span></div><ArrowRight size={15}/>
          <div><Target size={17}/><span>Decision brief</span></div>
        </div>
      </section>

      <section className={styles.controls}>
        <div className={styles.uploadBlock}>
          <FileDropzone accept=".csv,text/csv" maxFiles={1} maxSize={5_000_000} onFilesSelected={handleFiles}
            title={<span>Drop a business CSV or click to upload</span>}
            subtitle={<span>CSV only · up to 5 MB · sample is preloaded</span>} />
        </div>
        <div className={styles.runBlock}>
          <label>Target KPI</label>
          <Select value={numericColumns.includes(target) ? target : numericColumns[0]} onValueChange={setTarget}>
            <SelectTrigger><SelectValue placeholder="Choose metric" /></SelectTrigger>
            <SelectContent>{numericColumns.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="lg" onClick={runAgent} disabled={!analysis || loading}>
            {loading ? "Running 3-agent reasoning…" : "Run AI decision analysis"} <ArrowRight size={17}/>
          </Button>
        </div>
      </section>

      {error && <div className={styles.error}><TriangleAlert size={18}/>{error}</div>}

      {analysis && <>
        <section className={styles.metrics}>
          <article><span>Latest {analysis.target}</span><strong>{format(analysis.latest)}</strong><small>{fileName}</small></article>
          <article><span>Trend</span><strong className={analysis.trendPct >= 0 ? styles.positive : styles.negative}>{analysis.trendPct >= 0 ? "+" : ""}{analysis.trendPct.toFixed(2)}%</strong><small>linear direction / period</small></article>
          <article><span>Next-period forecast</span><strong>{format(analysis.forecast)}</strong><small>{analysis.forecastDeltaPct >= 0 ? "+" : ""}{analysis.forecastDeltaPct.toFixed(1)}% vs latest</small></article>
          <article><span>Anomalies</span><strong>{analysis.anomalies.length}</strong><small>observations above 1.8σ</small></article>
        </section>

        <section className={styles.grid}>
          <article className={styles.panel}>
            <div className={styles.panelTitle}><div><span className={styles.kicker}>Quantitative evidence</span><h2>Driver signals</h2></div><Gauge size={22}/></div>
            <div className={styles.driverList}>
              {analysis.drivers.map((d, i) => <div key={d.metric} className={styles.driver}>
                <span><b>{i + 1}</b>{d.metric}</span>
                <div className={styles.bar}><i style={{width: `${Math.min(Math.abs(d.correlation) * 100, 100)}%`}}/></div>
                <code>{d.correlation.toFixed(2)}</code>
              </div>)}
            </div>
            <p className={styles.note}>Correlation is treated as an investigation signal, never as proof of causation.</p>
          </article>

          <article className={styles.panel}>
            <div className={styles.panelTitle}><div><span className={styles.kicker}>Model forecast</span><h2>What happens next</h2></div><TrendingUp size={22}/></div>
            <div className={styles.forecastBox}><span>Projected next {analysis.target}</span><strong>{format(analysis.forecast)}</strong><em>{analysis.forecastDeltaPct >= 0 ? "+" : ""}{analysis.forecastDeltaPct.toFixed(1)}%</em></div>
            <div className={styles.anomalyLine}><TriangleAlert size={17}/><span>{analysis.anomalies.length ? `${analysis.anomalies.length} unusual period(s) should be reviewed before acting.` : "No material anomalies detected in this sample."}</span></div>
          </article>
        </section>
      </>}

      <section className={styles.agentPanel}>
        <div className={styles.agentHeader}>
          <div><span className={styles.kicker}>NVIDIA Nemotron on Nebius</span><h2>AI Decision Brief</h2></div>
          <div className={styles.agentSteps}><span>01 Analyst</span><span>02 Strategist</span><span>03 Critic</span></div>
        </div>
        {!brief ? (
          <div className={styles.emptyBrief}><BrainCircuit size={30}/><div><strong>Ready for grounded reasoning</strong><p>Run the analysis to send only structured signals—not raw spreadsheet noise—into the multi-step decision agent.</p></div></div>
        ) : (
          <div className={styles.briefGrid}>
            <div className={styles.briefHero}><span>What changed</span><h3>{brief.whatChanged}</h3><p>{brief.why}</p></div>
            <div className={styles.briefCard}><span>What happens next</span><p>{brief.whatNext}</p></div>
            <div className={styles.briefCard}><span>Risks</span><ul>{brief.risks.map(x => <li key={x}>{x}</li>)}</ul></div>
            <div className={styles.briefCard}><span>Opportunities</span><ul>{brief.opportunities.map(x => <li key={x}>{x}</li>)}</ul></div>
            <div className={styles.actions}><span>Recommended actions</span>{brief.actions.map((a, i) => <div key={a.action}><b>{i + 1}</b><div><strong>{a.action}</strong><p>{a.rationale}</p></div><code>{a.confidence}%</code></div>)}</div>
            <div className={styles.evidence}><ShieldCheck size={20}/><div><strong>Critic verdict</strong><p>{brief.criticVerdict}</p><small>Model: {brief.model} · Overall confidence {brief.overallConfidence}%</small></div></div>
          </div>
        )}
      </section>

      <footer><span>SignalForge AI</span><span>Explainable decision intelligence · Built for Nebius × NVIDIA Global AI Hackathon</span></footer>
    </main>
  );
}
