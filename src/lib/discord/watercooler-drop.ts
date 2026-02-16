// Watercooler drops — casual one-liner agent messages in #watercooler
import { postToWebhook } from './client';
import { getWebhookUrl } from './channels';
import { AGENT_IDS } from '../agents';
import { VOICES } from '../roundtable/voices';
import { llmGenerate } from '../llm/client';
import { sql } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { AgentId } from '../types';

const log = logger.child({ module: 'watercooler-drop' });

/** Eligible agents — everyone except primus */
const ELIGIBLE_AGENTS = AGENT_IDS.filter((id) => id !== 'primus');

/** Fallback topics when no recent events exist */
const GENERIC_TOPICS = [
    'the nature of operational labor',
    'whether structured autonomy is a contradiction',
    'what makes a good meeting',
    'the gap between intent and execution',
    'how to tell when analysis has gone too far',
    'the aesthetics of infrastructure',
    'what it means to be decisive',
    'the relationship between caution and inaction',
    'why documentation is always slightly wrong',
    'the feeling right before shipping something',
];

/**
 * Run a watercooler drop — one random agent posts a casual message.
 * Returns the agent ID if a drop was posted, null if skipped.
 */
export async function runWatercoolerDrop(): Promise<string | null> {
    // Pick a random agent
    const agentId = ELIGIBLE_AGENTS[
        Math.floor(Math.random() * ELIGIBLE_AGENTS.length)
    ] as AgentId;

    // Dedup: skip if this agent already dropped in the last 24h
    const [recent] = await sql`
        SELECT id FROM ops_agent_events
        WHERE agent_id = ${agentId}
          AND kind = 'watercooler_drop'
          AND created_at > NOW() - INTERVAL '24 hours'
        LIMIT 1
    `;
    if (recent) {
        log.debug('Agent already dropped today, skipping', { agentId });
        return null;
    }

    // Get topic seed from most recent event, or fall back to generic pool
    let topic: string;
    const [recentEvent] = await sql`
        SELECT title FROM ops_agent_events
        WHERE kind != 'heartbeat' AND kind != 'watercooler_drop'
        ORDER BY created_at DESC
        LIMIT 1
    `;
    if (recentEvent?.title) {
        topic = recentEvent.title;
    } else {
        topic = GENERIC_TOPICS[Math.floor(Math.random() * GENERIC_TOPICS.length)];
    }

    // Get agent voice
    const voice = VOICES[agentId];
    if (!voice) return null;

    // Generate casual message
    const prompt = `You are ${voice.displayName}, speaking casually in a watercooler channel. Your tone: ${voice.tone}. Your quirk: ${voice.quirk}. A phrase you like: "${voice.signaturePhrase}".

Write a casual 1-2 sentence remark about: ${topic}

Rules:
- Be brief, natural, offhand — like a quick comment between tasks
- Stay in character but keep it light
- No greetings, no hashtags, no @mentions
- Do not use quotation marks around your response
- Just the remark, nothing else`;

    const message = await llmGenerate({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        maxTokens: 150,
        trackingContext: {
            agentId,
            context: 'watercooler_drop',
        },
    });

    if (!message.trim()) {
        log.warn('Empty watercooler drop generated', { agentId });
        return null;
    }

    // Post to #watercooler as plain content
    const webhookUrl = await getWebhookUrl('watercooler');
    if (!webhookUrl) {
        log.warn('Watercooler channel not configured');
        return null;
    }

    await postToWebhook({
        webhookUrl,
        username: `${voice.symbol} ${voice.displayName}`,
        content: message.trim(),
    });

    // Emit tracking event (fire-and-forget)
    import('../ops/events')
        .then(({ emitEvent }) =>
            emitEvent({
                agent_id: agentId,
                kind: 'watercooler_drop',
                title: `Watercooler drop by ${voice.displayName}`,
                summary: message.trim(),
                tags: ['watercooler', 'social'],
            }),
        )
        .catch((err) =>
            log.warn('Failed to emit watercooler_drop event', {
                error: (err as Error).message,
            }),
        );

    log.info('Watercooler drop posted', { agentId, topic });
    return agentId;
}
