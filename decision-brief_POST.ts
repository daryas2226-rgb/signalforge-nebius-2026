import superjson from "superjson";
import { schema, type DecisionBriefOutput } from "./decision-brief_POST.schema";

const MODEL = "nvidia/Nemotron-3_5-Lightning";
const ENDPOINT = "https://api.tokenfactory.nebius.com/v1/chat/completions";

type Message = { role: "system" | "user" | "assistant"; content: string };

function extractJson(text: string): unknown {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, "")
    .replace(/\s*\`\`\`$/, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Nemotron did not return a JSON object. Try again with a shorter dataset.");
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("Nemotron returned malformed JSON. Please retry the analysis.");
  }
}

async function callNemotron(apiKey: string, messages: Message[]) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 3200,
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Nebius Token Factory error (${response.status}): ${detail}`);
  }
  const data = await response.json() as { choices?: { finish_reason?: string; message?: { content?: string; reasoning_content?: string } }[] };
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (!content) throw new Error(`Nemotron returned no final content (finish_reason: ${choice?.finish_reason ?? "unknown"}).`);
  if (choice?.finish_reason === "length") {
    throw new Error("Nemotron response reached the output-token limit before completing JSON.");
  }
  return content;
}

function clampConfidence(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : 50;
}

export async function handle(request: Request) {
  try {
    const apiKey = (process.env as Record<string, string | undefined>).NEBIUS_API_KEY;
    if (!apiKey) {
      return new Response(superjson.stringify({ error: "Nebius Token Factory is not connected yet. Connect the secure API credential, then run the analysis again." }), { status: 503 });
    }

    const input = schema.parse(superjson.parse(await request.text()));
    const evidence = {
      dataset: input.datasetName,
      targetKpi: input.target,
      rows: input.points,
      latest: input.latest,
      longRunTrendPctPerPeriod: Number(input.trendPct.toFixed(3)),
      nextPeriodForecast: Number(input.forecast.toFixed(3)),
      forecastDeltaPct: Number(input.forecastDeltaPct.toFixed(3)),
      anomalies: input.anomalies.map(a => ({ index: a.index, value: a.value, zScoreAbs: Number(a.z.toFixed(2)) })),
      driverSignals: input.drivers.map(d => ({ metric: d.metric, correlation: Number(d.correlation.toFixed(3)) })),
    };

    const analystText = await callNemotron(apiKey, [
      {
        role: "system",
        content: "You are the Analyst in an executive decision-intelligence pipeline. Work only from supplied quantitative evidence. Correlation is not causation. Distinguish observation from hypothesis. Return strict JSON only.",
      },
      {
        role: "user",
        content: `Analyze this structured business evidence:\n${JSON.stringify(evidence)}\n\nReturn JSON with keys: whatChanged (string), why (string; explicitly label plausible drivers as hypotheses), whatNext (string), risks (array max 3), opportunities (array max 3), confidence (0-100 integer). Keep it concise and decision-oriented.`,
      },
    ]);
    const analyst = extractJson(analystText) as Record<string, unknown>;

    const strategistText = await callNemotron(apiKey, [
      {
        role: "system",
        content: "You are the Strategist. Convert grounded analysis into specific reversible next actions. Do not invent facts, budgets, causes, or certainty. Return strict JSON only.",
      },
      {
        role: "user",
        content: `Evidence:\n${JSON.stringify(evidence)}\n\nAnalyst output:\n${JSON.stringify(analyst)}\n\nReturn JSON with actions: an array of exactly 3 objects {action, rationale, confidence}. Rank actions by expected decision value and favor actions that validate uncertain causal hypotheses before irreversible commitments.`,
      },
    ]);
    const strategist = extractJson(strategistText) as Record<string, unknown>;

    const criticText = await callNemotron(apiKey, [
      {
        role: "system",
        content: "You are the Critic in a three-stage AI decision pipeline. Audit the Analyst and Strategist for unsupported causal claims, contradictions, overconfidence, and actions not grounded in evidence. Return strict JSON only.",
      },
      {
        role: "user",
        content: `Evidence:\n${JSON.stringify(evidence)}\n\nAnalyst:\n${JSON.stringify(analyst)}\n\nStrategist:\n${JSON.stringify(strategist)}\n\nReturn JSON with: verdict (1-2 sentences), overallConfidence (0-100), approvedActions (array of exactly 3 objects {action, rationale, confidence}). Rewrite any unsupported action rather than approving it blindly.`,
      },
    ]);
    const critic = extractJson(criticText) as Record<string, unknown>;

    const rawActions = Array.isArray(critic.approvedActions)
      ? critic.approvedActions
      : Array.isArray(strategist.actions) ? strategist.actions : [];
    const actions = rawActions.slice(0, 3).map((item, index) => {
      const a = (item ?? {}) as Record<string, unknown>;
      return {
        action: String(a.action || `Validate decision hypothesis ${index + 1}`),
        rationale: String(a.rationale || "Run a targeted validation step before committing resources."),
        confidence: clampConfidence(a.confidence),
      };
    });
    while (actions.length < 3) {
      actions.push({
        action: "Collect one more validation period",
        rationale: "The current evidence is not sufficient for another high-confidence action.",
        confidence: 45,
      });
    }

    const result: DecisionBriefOutput = {
      whatChanged: String(analyst.whatChanged || `${input.target} changed relative to its recent pattern.`),
      why: String(analyst.why || "The available driver signals suggest hypotheses that should be validated before causal conclusions are made."),
      whatNext: String(analyst.whatNext || `The next-period forecast is ${input.forecast.toFixed(1)}.`),
      risks: Array.isArray(analyst.risks) ? analyst.risks.slice(0, 3).map(String) : ["Forecast uncertainty should be validated against the next actual period."],
      opportunities: Array.isArray(analyst.opportunities) ? analyst.opportunities.slice(0, 3).map(String) : ["Use the strongest driver signals to design focused validation experiments."],
      actions,
      criticVerdict: String(critic.verdict || "The recommendations are directionally useful but should be treated as decision support, not causal proof."),
      overallConfidence: clampConfidence(critic.overallConfidence ?? analyst.confidence),
      model: MODEL,
    };

    return new Response(superjson.stringify(result), { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown decision-agent error.";
    return new Response(superjson.stringify({ error: message }), { status: 400 });
  }
}
