# Development plan

1. **Vertical slice** — FastAPI simulation engine, deterministic rules, mock participants, one playable scenario, persistence, and timeline UI.
2. **Provider layer** — LiteLLM adapter, ephemeral credentials, JSON response validation, rate and cost guards.
3. **Scenario library** — Add philosophical dilemma and resource-allocation templates beside Helios-7.
4. **Director controls** — Pause/resume, inject events, alter conditions, and replay earlier snapshots.
5. **Hardening** — Transition, invalid-action, API-failure, replay, type, and production-build checks.

The current implementation covers all five at MVP depth. Next steps would be streamed responses, richer scenario authoring, and stronger distributed rate limiting.

