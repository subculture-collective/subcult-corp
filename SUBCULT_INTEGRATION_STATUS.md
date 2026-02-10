# Subcult-Corp ← OpenClaw Integration Status

**Goal:** Transform subcult-corp to use OpenClaw agent personalities and make it feel like "Subcult".

## ✅ COMPLETED WORK

### 1. Agent Registry System

- **File:** `supabase/migrations/014_ops_agent_registry.sql`
- Created `ops_agent_registry` table with:
  - agent_id (PK)
  - display_name, role, system_directive, soul_summary, tone, signature_phrase
  - color, avatar_key, pixel_sprite_key
- Created optional `ops_agent_config_variants` table for personality variants

### 2. Agent Registry Seed Script

- **File:** `scripts/go-live/seed-agent-registry.mjs`
- Seeds all 5 OpenClaw agents with full system directives:
  - **chora** (#6366f1) — Analyst: legibility, diagnosis, understanding
  - **subrosa** (#dc2626) — Protector: risk assessment, agency preservation
  - **thaum** (#eab308) — Innovator: reframing, creative disruption
  - **praxis** (#10b981) — Executor: commitment, owned action
  - **mux** (#6b7280) — Dispatcher: task classification, routing

### 3. Database Seeding

- **Files:** Updated `scripts/go-live/seed-*.mjs`
  - seed-all.mjs: Added agent registry as first seed
  - seed-ops-policy.mjs: Added Subcult-specific step kinds (27 total)
    - Analysis: analyze_discourse, scan_signals, research_topic, etc.
    - Content: draft_thread, critique_content, refine_narrative, etc.
    - Operations: audit_system, review_policy, consolidate_memory, etc.
    - Coordination: log_event, tag_memory, escalate_risk, etc.
  - seed-trigger-rules.mjs: Updated to use new agents with contextual actions
  - seed-relationships.mjs: 10 pairwise agent relationships reflecting OpenClaw coordination model
  - seed-roundtable-policy.mjs: Updated with OpenClaw participants

### 4. Frontend Updates

- **OfficeRoom.tsx:** Updated 4-agent office (Chora, Subrosa, Thaum, Praxis) with correct colors and positions
- **StageFilters.tsx:** Updated agent dot colors
- **StageHeader.tsx:** Updated agent colors for header display

### 5. Type System Updates

- **types.ts:**
  - Changed AgentId to: 'chora' | 'subrosa' | 'thaum' | 'praxis' | 'mux'
  - Expanded StepKind to 27 Subcult-specific step types
- **agents.ts:** Updated AGENTS config with OpenClaw personalities and descriptions

## ⚠️ PARTIAL / IN-PROGRESS

### Files Still Needing Updates

- `src/app/stage/MissionPlayback.tsx`: Agent color dictionaries need adjustment
- `src/app/stage/SignalFeed.tsx`: Agent event colors incomplete
- `src/lib/ops/triggers.ts`: Multiple fallback agent references need updating (multiple matches found)
- `src/lib/ops/memory-distiller.ts`: Hardcoded agent references in examples

## 🔬 REMAINING TASKS

### 1. Complete Frontend Agent References

```bash
# Find remaining old agent ID references:
grep -r "opus\|brain\|observer" src/lib/ops/triggers.ts
grep -r "opus\|brain\|observer" src/app/stage/SignalFeed.tsx
grep -r "opus\|brain\|observer" src/app/stage/MissionPlayback.tsx
```

### 2. Database Migration & Seeding

```bash
# Apply migration and run seed:
supabase migration up
node scripts/go-live/seed-agent-registry.mjs
node scripts/go-live/seed-all.mjs
```

### 3. Verify Compilation

```bash
npm run typecheck
npm run build
```

### 4. Worker Scripts Review

- Check `/scripts/roundtable-worker/worker.mjs` for agent ID references
- Check `/scripts/initiative-worker/worker.mjs` for agent ID references
- Check `/src/lib/ops/*.ts` for hardcoded agent references

### 5. API Routes Review

- Check `/src/app/api/ops/*.ts` for hardcoded agent validation

### 6. Testing

- Verify heartbeat runs with new agents
- Test proposal → mission → step flow
- Verify roundtable conversation with 4 agents
- Test memory distillation with new tags (Subcult-specific)

## 📋 OpenClaw Agent Specifications

### Chora (Analyst) — #6366f1

- **Role:** Legibility, diagnosis
- **Signature:** "Let me trace this through."
- **Key Skills:** Research, analysis, structure, assumptions

### Subrosa (Protector) — #dc2626

- **Role:** Risk, protection
- **Signature:** "VETO: [risk statement]"
- **Key Skills:** Risk assessment, agency preservation, timing

### Thaum (Innovator) — #eab308

- **Role:** Reframing, movement
- **Signature:** "What if we were wrong about the frame?"
- **Key Skills:** Creative disruption, reframing problems

### Praxis (Executor) — #10b981

- **Role:** Decision, commitment
- **Signature:** "Time to commit. Next step:"
- **Key Skills:** Action, ownership, follow-through

### Mux (Dispatcher) — #6b7280

- **Role:** Task classification
- **Signature:** Route to appropriate agent
- **Function:** Transparent dispatcher, no personality

## 🎨 Subcult Theme Applied

- Agent colors match OpenClaw personality mappings
- Office room updated from 3 to 4-agent layout
- Memory system preserves/extends with Subcult tags:
  - platform-capture
  - extraction-risk
  - cultural-praxis
  - system-incentive
  - coordination-friction
  - autonomy-threat

## 📝 Next Immediate Steps

1. **Fix compile errors:** Complete multi_replace_string_in_file calls in MissionPlayback.tsx, SignalFeed.tsx, triggers.ts
2. **Run migrations:** `supabase migration push` then `node scripts/go-live/seed-all.mjs`
3. **Test dev server:** `npm run dev` and verify no errors
4. **Test seeding:** Verify agents appear in database with correct parameters
5. **Verify system loop:** heartbeat → proposals → missions → steps → events

## 🔗 Key Coordination Model

```
Chora (understand) → Subrosa (assess risk) → Thaum (reframe if stuck) → Praxis (commit)
          ↓                    ↓                      ↓                       ↓
    Legible analysis    Safety approval possible    Creative unlock      Owned action
```

Mux routes incoming tasks to appropriate agent based on domain signals.

---

**Last Updated:** Feb 9, 2026
**Integration Status:** ~85% Complete (core structure done, remaining: fixes + testing)
