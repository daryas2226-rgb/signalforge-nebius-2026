# SignalForge AI — Explainable Decision Intelligence

Built for the **Nebius × NVIDIA Global AI Hackathon**, Best Apps & Agents track.

**Live prototype:** https://signalforge-nebius-2026.floot.app

## Why it exists
Business operators have KPI dashboards, but often lack a clear, evidence-based explanation of what changed, what to investigate, and which reversible action to take next.

## Features
- Upload a CSV dataset or explore a preloaded **synthetic** monthly business dataset.
- Select a numeric target KPI.
- Inspect linear trend, z-score anomaly signals (threshold 1.8), driver correlations, and a simple extrapolated next-period forecast.
- Request a three-stage AI decision brief using **NVIDIA Nemotron via Nebius Token Factory**:
  1. **Analyst** separates observed evidence from possible explanations.
  2. **Strategist** proposes three specific, reversible actions.
  3. **Critic** checks unsupported causal claims, confidence, and recommendations.
- Read the resulting risks, opportunities, actions, and confidence alongside the quantitative evidence.

## Architecture
- React + TypeScript frontend: `pages/_index.tsx`, `pages/_index.module.css`, `base.css`.
- Server-side AI pipeline: `endpoints/decision-brief_POST.ts`.
- Zod input schema and typed client: `endpoints/decision-brief_POST.schema.ts`.
- Model API: `https://api.tokenfactory.nebius.com/v1/chat/completions`.
- Model identifier: `nvidia/Nemotron-3_5-Lightning`, verified through a successful live three-agent API test on 2026-10-26.
- Secret environment variable: `NEBIUS_API_KEY` (server-side only; never commit a real key).

## Running the prototype
1. Open the Floot-hosted app or import the project files into a Floot React/TypeScript workspace.
2. Set `NEBIUS_API_KEY` through Floot's secure secret connector, using a valid Nebius Token Factory key.
3. Load the included sample data or upload a CSV with a header row and numeric KPI columns.
4. Choose a target KPI and click **Run AI decision analysis**.
5. Inspect the quantitative signals and three-agent decision brief.

The AI brief endpoint returns an explicit **503** if the key is missing. The UI does **not** fabricate AI responses.

## Evaluation and limitations
- The built-in dataset is synthetic and for demonstration only.
- Correlation does not imply causation.
- Anomaly threshold and linear forecast are lightweight exploratory methods, not production-grade forecasting.
- The CSV parser is basic and does not support quoted commas or all RFC 4180 cases.
- The system has no authentication, persistent storage, or confidential-data controls; do not upload sensitive business information.
- The live API test passed on 2026-10-26 (HTTP 200, Analyst → Strategist → Critic). API quota and credit consumption still depend on the Nebius account.

## Hackathon submission checklist
- [x] Build responsive analytics and three-agent server pipeline.
- [x] Publish public web prototype.
- [x] Confirm TypeScript typecheck.
- [x] Verify explicit 503 behavior when Nebius key is missing.
- [x] Connect Nebius API key and verify all three live model calls (2026-10-26).
- [ ] Test a real CSV and error/edge cases.
- [ ] Create a **dedicated public GitHub repository** with full project source, README and a root-level LICENSE file.
- [ ] Record and publish a <=3-minute public YouTube demo showing actual model responses.
- [ ] Finish required Devpost fields and submit.

## License
MIT — see `static/LICENSE.txt` in the Floot project. When exporting to GitHub, place this file at repository root as `LICENSE`.
