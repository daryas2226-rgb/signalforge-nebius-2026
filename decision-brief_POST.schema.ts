import { z } from "zod";
import superjson from "superjson";

export const schema = z.object({
  datasetName: z.string().min(1).max(200),
  target: z.string().min(1).max(120),
  latest: z.number().finite(),
  trendPct: z.number().finite(),
  forecast: z.number().finite(),
  forecastDeltaPct: z.number().finite(),
  points: z.number().int().min(2).max(100000),
  anomalies: z.array(z.object({
    index: z.number().int().min(0),
    value: z.number().finite(),
    z: z.number().finite(),
  })).max(100),
  drivers: z.array(z.object({
    metric: z.string().min(1).max(120),
    correlation: z.number().finite().min(-1).max(1),
  })).max(20),
});

export type DecisionBriefInput = z.infer<typeof schema>;

export type DecisionBriefOutput = {
  whatChanged: string;
  why: string;
  whatNext: string;
  risks: string[];
  opportunities: string[];
  actions: { action: string; rationale: string; confidence: number }[];
  criticVerdict: string;
  overallConfidence: number;
  model: string;
};

export const postDecisionBrief = async (body: DecisionBriefInput, init?: RequestInit): Promise<DecisionBriefOutput> => {
  const validated = schema.parse(body);
  const response = await fetch("/_api/decision-brief", {
    method: "POST",
    body: superjson.stringify(validated),
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = superjson.parse<{ error: string }>(await response.text());
    throw new Error(payload.error || "Decision agent request failed.");
  }
  return superjson.parse<DecisionBriefOutput>(await response.text());
};
