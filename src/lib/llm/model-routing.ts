// Dynamic model routing — resolve model list per tracking context
// Cascading lookup: exact context → prefix (before ':') → 'default' → hardcoded fallback
//
// Environment variable overrides:
//   MODEL_ROUTING_DEFAULT=openai/gpt-oss-120b,deepseek/deepseek-v3.2,google/gemini-2.5-flash
//   MODEL_ROUTING_ROUNDTABLE=deepseek/deepseek-v3.2,moonshotai/kimi-k2.5
//   MODEL_ROUTING_ROUNDTABLE__DEEP_DIVE=moonshotai/kimi-k2.5,anthropic/claude-sonnet-4.5
//   MODEL_ROUTING_AGENT_SESSION=google/gemini-2.5-flash,openai/gpt-oss-120b
//
// Naming: MODEL_ROUTING_ + UPPER_SNAKE context. Colons become __ (double underscore).
//   e.g. roundtable:deep_dive → MODEL_ROUTING_ROUNDTABLE__DEEP_DIVE
//
// Env vars are synced to ops_model_routing on first use, then DB is the source of truth.
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Default models for SDK-native routing via `models` array.
 * OpenRouter tries each in order, falling back on provider errors / unavailability.
 * Ordered by speed/cost — fast cheap models first, heavier last resort.
 *
 * Heavy models (opus-4.6, gpt-5.2, deepseek-r1) excluded from default rotation
 * — available via LLM_MODEL env override for specific tasks.
 */
export const DEFAULT_MODELS = [
    'openai/gpt-oss-120b',          // fast, cheap ($0.10/M), strong general-purpose
    'deepseek/deepseek-v3.2',       // fast, cheap ($0.14/M avg), good tool calling
    'google/gemini-2.5-flash',      // fast, cheap ($0.15/M avg), 1M context
    'qwen/qwen3-235b-a22b',        // good quality, cheap ($0.14/M avg)
    'moonshotai/kimi-k2.5',        // strong reasoning, moderate cost ($0.60/M avg)
    'anthropic/claude-haiku-4.5',   // reliable, moderate cost ($1/$5)
    'anthropic/claude-sonnet-4.5',  // last resort — highest quality, highest cost
];

const ENV_PREFIX = 'MODEL_ROUTING_';
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { models: string[]; ts: number }>();

let envSynced = false;

/**
 * Parse MODEL_ROUTING_* env vars and upsert into ops_model_routing.
 * Called once on first resolveModels() call.
 *
 * Env var naming:
 *   MODEL_ROUTING_DEFAULT          → context "default"
 *   MODEL_ROUTING_AGENT_SESSION    → context "agent_session"
 *   MODEL_ROUTING_ROUNDTABLE       → context "roundtable"
 *   MODEL_ROUTING_ROUNDTABLE__DEEP_DIVE → context "roundtable:deep_dive"
 *
 * Values are comma-separated model IDs:
 *   MODEL_ROUTING_DEFAULT=openai/gpt-oss-120b,deepseek/deepseek-v3.2
 */
async function syncEnvToDb(): Promise<void> {
    if (envSynced) return;
    envSynced = true;

    const entries: { context: string; models: string[] }[] = [];

    for (const [key, value] of Object.entries(process.env)) {
        if (!key.startsWith(ENV_PREFIX) || !value) continue;

        const rawContext = key.slice(ENV_PREFIX.length);
        if (!rawContext) continue;

        // Convert UPPER_SNAKE to lower_snake, double underscore → colon
        const context = rawContext
            .toLowerCase()
            .replace(/__/g, ':');

        const models = value
            .split(',')
            .map(m => m.trim())
            .filter(Boolean);

        if (models.length > 0) {
            entries.push({ context, models });
        }
    }

    if (entries.length === 0) return;

    for (const { context, models } of entries) {
        try {
            await sql`
                INSERT INTO ops_model_routing (context, models, description, updated_at)
                VALUES (${context}, ${models}, ${'Set via MODEL_ROUTING env var'}, NOW())
                ON CONFLICT (context) DO UPDATE SET
                    models = EXCLUDED.models,
                    description = EXCLUDED.description,
                    updated_at = NOW()
            `;
            // Invalidate cache for this context
            cache.delete(context);
            logger.info('Model routing updated from env', { context, models });
        } catch (error) {
            logger.error('Failed to sync model routing env var', { context, models, error });
        }
    }
}

/** Normalize context: hyphens → underscores so 'governance-vote' matches 'governance_vote' in DB */
function normalizeContext(context: string): string {
    return context.replace(/-/g, '_');
}

/**
 * Resolve the ordered model list for a given tracking context.
 * Cascading lookup: exact match → prefix before ':' → 'default' row → hardcoded DEFAULT_MODELS.
 * Hyphens and underscores are treated as equivalent (normalized to underscores).
 */
export async function resolveModels(context?: string): Promise<string[]> {
    // Sync env vars to DB on first call
    await syncEnvToDb();

    if (!context) {
        return await lookupOrDefault('default');
    }

    const normalized = normalizeContext(context);

    // 1. Exact match
    const exact = await lookupCached(normalized);
    if (exact) return exact;

    // 2. Prefix match (e.g. 'roundtable:deep_dive' → 'roundtable')
    const colonIdx = normalized.indexOf(':');
    if (colonIdx > 0) {
        const prefix = normalized.slice(0, colonIdx);
        const prefixResult = await lookupCached(prefix);
        if (prefixResult) return prefixResult;
    }

    // 3. Default row
    return await lookupOrDefault('default');
}

/** Lookup with 30s TTL cache. Returns null if no row found or if models array is empty. */
async function lookupCached(context: string): Promise<string[] | null> {
    const cached = cache.get(context);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached.models.length > 0 ? cached.models : null;
    }

    try {
        const [row] = await sql<[{ models: string[] }?]>`
            SELECT models FROM ops_model_routing WHERE context = ${context}
        `;

        if (!row || !row.models || row.models.length === 0) {
            // Cache the miss too, so we don't hit the DB every call
            // Treat NULL or empty array as a miss to fall back to prefix/default/hardcoded
            cache.set(context, { models: [], ts: Date.now() });
            return null;
        }

        cache.set(context, { models: row.models, ts: Date.now() });
        return row.models;
    } catch (error) {
        // If the routing table is missing or the query fails for any reason,
        // log and fall back to hardcoded DEFAULT_MODELS via lookupOrDefault.
        logger.error(
            'resolveModels: failed to query ops_model_routing; falling back to default models',
            { error, context },
        );
        // Cache the miss so we don't repeatedly hit a failing query.
        cache.set(context, { models: [], ts: Date.now() });
        return null;
    }
}

/** Lookup 'default' row, fall back to hardcoded DEFAULT_MODELS. */
async function lookupOrDefault(context: string): Promise<string[]> {
    const result = await lookupCached(context);
    return result ?? DEFAULT_MODELS;
}
