// Artifact Synthesizer — transforms conversation transcripts into tangible output
// After a roundtable conversation completes, this creates an agent session
// that synthesizes the discussion into a structured artifact (report, briefing, etc.)

import { sql } from '@/lib/db';
import { getFormat } from './formats';
import { getVoice } from './voices';
import { logger } from '@/lib/logger';
import type {
    RoundtableSession,
    ConversationTurnEntry,
    FormatArtifactConfig,
} from '../types';

const log = logger.child({ module: 'artifact-synthesizer' });

/**
 * Build the synthesis prompt that instructs the synthesizer agent to
 * read the conversation transcript and produce a structured artifact.
 */
function buildSynthesisPrompt(
    session: RoundtableSession,
    history: ConversationTurnEntry[],
    artifact: FormatArtifactConfig,
): string {
    // Build transcript
    const transcript = history.map(t => {
        const voice = getVoice(t.speaker);
        const name = voice?.displayName ?? t.speaker;
        return `${name}: ${t.dialogue}`;
    }).join('\n');

    let prompt = `You just participated in (or observed) a ${session.format} conversation.\n\n`;
    prompt += `Topic: ${session.topic}\n`;
    prompt += `Format: ${session.format}\n`;
    prompt += `Participants: ${session.participants.join(', ')}\n`;
    prompt += `Turns: ${history.length}\n\n`;
    prompt += `═══ TRANSCRIPT ═══\n${transcript}\n═══ END TRANSCRIPT ═══\n\n`;

    prompt += `Your task: Synthesize this conversation into a structured ${artifact.type}.\n\n`;

    const outputDir = artifact.outputDir;
    const dateStr = new Date().toISOString().slice(0, 10);
    const topicSlug = session.topic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
    const filename = `${dateStr}__${session.format}__${artifact.type}__${topicSlug}__${artifact.synthesizer}__v01.md`;

    prompt += `Requirements:\n`;
    prompt += `1. Include a clear title (as a markdown # heading) and summary\n`;
    prompt += `2. Capture key points, decisions, action items, and disagreements\n`;
    prompt += `3. Be concise but thorough — aim for 300-800 words\n`;
    prompt += `4. Write the artifact to the workspace using file_write to path: ${outputDir}/${filename}\n`;
    prompt += `5. Also include the full artifact content as your text response\n\n`;

    prompt += `Do NOT just repeat the transcript. Synthesize, structure, and add value.\n`;

    return prompt;
}

/**
 * Trigger artifact synthesis after a conversation completes.
 * Creates an agent session for the designated synthesizer.
 * Returns the session ID or null if no artifact is needed.
 */
export async function synthesizeArtifact(
    session: RoundtableSession,
    history: ConversationTurnEntry[],
): Promise<string | null> {
    const format = getFormat(session.format);
    if (!format.artifact || format.artifact.type === 'none') return null;

    const artifact = format.artifact;
    const prompt = buildSynthesisPrompt(session, history, artifact);

    try {
        const [row] = await sql<[{ id: string }]>`
            INSERT INTO ops_agent_sessions (
                agent_id, prompt, source, source_id,
                timeout_seconds, max_tool_rounds, status
            ) VALUES (
                ${artifact.synthesizer},
                ${prompt},
                'conversation',
                ${session.id},
                180,
                15,
                'pending'
            )
            RETURNING id
        `;

        log.info('Artifact synthesis session created', {
            sessionId: row.id,
            format: session.format,
            synthesizer: artifact.synthesizer,
            artifactType: artifact.type,
            roundtableSession: session.id,
        });

        return row.id;
    } catch (err) {
        log.error('Failed to create synthesis session', {
            error: err,
            sessionId: session.id,
            format: session.format,
        });
        return null;
    }
}
