# Dynamic Memory System Enhancements

## Overview

Four additions to give agents persistent working memory, semantic recall, situational awareness, and self-directed memory formation.

## Current State

| Layer | What exists | Gap |
|-------|------------|-----|
| Stored memories | `ops_agent_memory` — 200 max/agent, typed, pgvector embeddings | Flat — no "working" vs "archival" distinction |
| Memory retrieval | `queryAgentMemories()` — by recency, type, tags | No semantic retrieval in conversations (only in agent sessions via `memory_search` tool) |
| Memory formation | Roundtable distiller, sanctum distiller, dreams, outcome-learner | All async. Agents can't say "remember this" in the moment |
| Context loading | 3-5 recent memories in system prompt | No situational awareness, no persistent working state between activations |

## 1. Agent Scratchpad (Working Memory)

**Purpose**: Persistent, agent-editable markdown document per agent. Always loaded into system prompt. Updated by the agent at the end of each activation.

**Schema**:
```sql
CREATE TABLE IF NOT EXISTS ops_agent_scratchpad (
    agent_id TEXT PRIMARY KEY,
    content TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Implementation**:
- `src/lib/ops/scratchpad.ts` — `getScratchpad()`, `updateScratchpad()`
- `src/lib/tools/tools/scratchpad.ts` — `scratchpad_read` and `scratchpad_update` tools
- Register tools in `src/lib/tools/registry.ts`
- Load scratchpad into system prompt in: agent-session.ts, agent-router.ts (sanctum), voices/orchestrator (roundtable)
- ~2000 char limit

## 2. Semantic Memory Retrieval

**Purpose**: Replace recency-only memory loading with blended relevance + recency using existing pgvector embeddings.

**Implementation**:
- `src/lib/ops/memory.ts` — new `queryRelevantMemories(agentId, topic, limit)` function
  - Embed the topic via Ollama `/v1/embeddings`
  - pgvector cosine similarity search for top K relevant
  - Blend: top 3 by relevance + top 2 by recency (deduplicated)
  - Falls back to pure recency if embeddings unavailable
- Wire into: sanctum agent-router, agent-session.ts

## 3. Situational Briefing

**Purpose**: Auto-generated "what happened recently" context section. Gives agents awareness of system state without consuming memory slots.

**Implementation**:
- `src/lib/ops/situational-briefing.ts` — `buildBriefing(agentId)` function
  - Recent events across all agents (last 6 hours, summarized)
  - Active missions and their status
  - Recent conversations the agent wasn't part of
  - Pending proposals
  - 5-minute cache per agent
- Injected as `═══ CURRENT SITUATION ═══` in system prompts
- Wire into: agent-session.ts, sanctum agent-router

## 4. Memory Write Tool

**Purpose**: Let agents explicitly write memories during any interaction — real-time memory formation.

**Implementation**:
- `src/lib/tools/tools/memory-write.ts` — `memory_write` tool
  - Parameters: type (insight|pattern|strategy|preference|lesson), content, confidence, tags
  - Validation: valid type, confidence >= 0.4, content <= 200 chars
  - Dedup via source_trace_id
  - Calls `writeMemory()` + `enforceMemoryCap()`
- Register in `src/lib/tools/registry.ts` for all 6 agents

## Files Changed

| File | Change |
|------|--------|
| `db/migrations/XXX_ops_agent_scratchpad.sql` | New table |
| `src/lib/ops/scratchpad.ts` | New — scratchpad read/write |
| `src/lib/ops/memory.ts` | Add `queryRelevantMemories()` |
| `src/lib/ops/situational-briefing.ts` | New — briefing builder |
| `src/lib/tools/tools/scratchpad.ts` | New — scratchpad tools |
| `src/lib/tools/tools/memory-write.ts` | New — memory_write tool |
| `src/lib/tools/registry.ts` | Register new tools |
| `src/lib/tools/agent-session.ts` | Load scratchpad + briefing, use semantic retrieval |
| `src/lib/sanctum/agent-router.ts` | Load scratchpad + briefing, use semantic retrieval |
| `scripts/sanctum-server/server.mjs` | Prompt scratchpad update after conversations |
