// SUBCULT Weekly — internal office newsletter pipeline
// Gathers week's activity data, generates narratives via LLM, produces markdown + PDF.
import { sql, jsonb } from '@/lib/db';
import { llmGenerate } from '@/lib/llm/client';
import { emitEvent } from '@/lib/ops/events';
import { postToWebhook } from '@/lib/discord/client';
import { getWebhookUrl } from '@/lib/discord/channels';
import { execInToolbox } from '@/lib/tools/executor';
import { AGENTS, AGENT_IDS } from '@/lib/agents';
import { logger } from '@/lib/logger';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { AgentId } from '@/lib/types';

const log = logger.child({ module: 'newsletter' });

// ─── Types ───

export interface NewsletterSection {
    key: string;
    title: string;
    content: string;
}

export interface NewsletterStats {
    conversations: number;
    missions_completed: number;
    missions_active: number;
    proposals: number;
    events: number;
    content_drafts: number;
    dream_cycles: number;
    archaeology_findings: number;
    governance_proposals: number;
    memories_created: number;
}

export interface NewsletterEdition {
    id: string;
    edition_week: string;
    edition_date: string;
    headline: string;
    primus_message: string | null;
    summary: string | null;
    sections: NewsletterSection[];
    stats: NewsletterStats;
    spotlight_agent: string | null;
    markdown_path: string | null;
    pdf_path: string | null;
    pdf_data: Buffer | null;
    generated_by: string;
    created_at: string;
}

// ─── Constants ───

const WORKSPACE_BASE = '/workspace/output/newsletters';
const AGENT_INBOX_BASE = '/workspace/agents';

// ─── Helpers ───

/** Get ISO week string like "2026-W08" for a given date. */
function getISOWeekString(date: Date): string {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** Get the previous Monday-Sunday boundaries (UTC). */
function getPreviousWeekBounds(): { weekStart: Date; weekEnd: Date; weekString: string } {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon
    // Go back to most recent Monday at 00:00 UTC
    const daysBack = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysBack));
    // Previous week: Monday before that to Sunday before this Monday
    const weekStart = new Date(thisMonday.getTime() - 7 * 86400000);
    const weekEnd = new Date(thisMonday.getTime() - 1); // Sunday 23:59:59.999
    return { weekStart, weekEnd, weekString: getISOWeekString(weekStart) };
}

/** Determine spotlight agent by rotating through all 6. */
async function determineSpotlightAgent(): Promise<AgentId> {
    const rows = await sql<{ spotlight_agent: string }[]>`
        SELECT spotlight_agent FROM ops_newsletter_editions
        WHERE spotlight_agent IS NOT NULL
        ORDER BY edition_date DESC
        LIMIT 1
    `;
    const lastSpotlight = rows[0]?.spotlight_agent as AgentId | undefined;
    if (!lastSpotlight) return AGENT_IDS[0];
    const idx = AGENT_IDS.indexOf(lastSpotlight);
    return AGENT_IDS[(idx + 1) % AGENT_IDS.length];
}

// ─── Data Gathering ───

interface WeekData {
    sessions: { id: string; format: string; topic: string; participants: string[]; status: string; turn_count: number; created_at: string }[];
    missions: { id: string; title: string; status: string; created_by: string; completed_at: string | null; created_at: string }[];
    proposals: { id: string; agent_id: string; title: string; status: string; created_at: string }[];
    events: { agent_id: string; kind: string; title: string; summary: string | null; created_at: string }[];
    contentDrafts: { id: string; author_agent: string; title: string; content_type: string; status: string; created_at: string }[];
    relationships: { agent_a: string; agent_b: string; affinity: number; total_interactions: number }[];
    governanceProposals: { id: string; proposer: string; policy_key: string; status: string; rationale: string; created_at: string }[];
    dreamCycles: { id: string; agent_id: string; dream_type: string; dream_content: string; created_at: string }[];
    archaeologyFindings: { id: string; agent_id: string; finding_type: string; title: string; description: string; created_at: string }[];
    memories: { agent_id: string; count: number }[];
    watercoolerTurns: { speaker: string; dialogue: string; session_topic: string }[];
}

async function gatherWeekData(weekStart: Date, weekEnd: Date, spotlightAgent: AgentId): Promise<WeekData> {
    const start = weekStart.toISOString();
    const end = weekEnd.toISOString();

    const [
        sessions,
        missions,
        proposals,
        events,
        contentDrafts,
        relationships,
        governanceProposals,
        dreamCycles,
        archaeologyFindings,
        memories,
        watercoolerTurns,
    ] = await Promise.all([
        sql<WeekData['sessions']>`
            SELECT id, format, topic, participants, status, turn_count, created_at
            FROM ops_roundtable_sessions
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
        `,
        sql<WeekData['missions']>`
            SELECT id, title, status, created_by, completed_at, created_at
            FROM ops_missions
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
        `,
        sql<WeekData['proposals']>`
            SELECT id, agent_id, title, status, created_at
            FROM ops_mission_proposals
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
        `,
        sql<WeekData['events']>`
            SELECT agent_id, kind, title, summary, created_at
            FROM ops_agent_events
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
            LIMIT 200
        `,
        sql<WeekData['contentDrafts']>`
            SELECT id, author_agent, title, content_type, status, created_at
            FROM ops_content_drafts
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
        `,
        sql<WeekData['relationships']>`
            SELECT agent_a, agent_b, affinity, total_interactions
            FROM ops_agent_relationships
            ORDER BY affinity DESC
        `,
        sql<WeekData['governanceProposals']>`
            SELECT id, proposer, policy_key, status, rationale, created_at
            FROM ops_governance_proposals
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
        `,
        sql<WeekData['dreamCycles']>`
            SELECT id, agent_id, dream_type, dream_content, created_at
            FROM ops_dream_cycles
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
            LIMIT 30
        `,
        sql<WeekData['archaeologyFindings']>`
            SELECT id, agent_id, finding_type, title, description, created_at
            FROM ops_memory_archaeology
            WHERE created_at >= ${start} AND created_at <= ${end}
            ORDER BY created_at DESC
            LIMIT 20
        `,
        sql<{ agent_id: string; count: number }[]>`
            SELECT agent_id, COUNT(*)::int AS count
            FROM ops_agent_memory
            WHERE created_at >= ${start} AND created_at <= ${end}
            GROUP BY agent_id
        `,
        sql<WeekData['watercoolerTurns']>`
            SELECT t.speaker, t.dialogue, s.topic AS session_topic
            FROM ops_roundtable_turns t
            JOIN ops_roundtable_sessions s ON s.id = t.session_id
            WHERE s.format = 'watercooler'
              AND s.created_at >= ${start} AND s.created_at <= ${end}
            ORDER BY RANDOM()
            LIMIT 10
        `,
    ]);

    return {
        sessions,
        missions,
        proposals,
        events,
        contentDrafts,
        relationships,
        governanceProposals,
        dreamCycles,
        archaeologyFindings,
        memories,
        watercoolerTurns,
    };
}

function buildStats(data: WeekData): NewsletterStats {
    return {
        conversations: data.sessions.length,
        missions_completed: data.missions.filter(m => m.status === 'completed').length,
        missions_active: data.missions.filter(m => m.status === 'approved' || m.status === 'in_progress').length,
        proposals: data.proposals.length,
        events: data.events.length,
        content_drafts: data.contentDrafts.length,
        dream_cycles: data.dreamCycles.length,
        archaeology_findings: data.archaeologyFindings.length,
        governance_proposals: data.governanceProposals.length,
        memories_created: data.memories.reduce((sum, m) => sum + m.count, 0),
    };
}

// ─── LLM Calls ───

async function generateNewsletterHeadline(data: WeekData, stats: NewsletterStats): Promise<string> {
    const topEvents = data.events.slice(0, 10).map(e => e.title).join('; ');
    const missionTitles = data.missions.slice(0, 5).map(m => m.title).join('; ');

    const response = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: 'You write newspaper headlines for SUBCULT Weekly, the internal office newsletter. Be concise, punchy, and reflective of the week\'s internal office activity.',
            },
            {
                role: 'user',
                content: `Write one headline (<80 chars) summarizing this week at the office.\n\nStats: ${stats.conversations} conversations, ${stats.missions_completed} missions completed, ${stats.events} events.\nKey events: ${topEvents}\nMissions: ${missionTitles}\n\nReturn ONLY the headline, no quotes.`,
            },
        ],
        temperature: 0.5,
        maxTokens: 50,
        trackingContext: { agentId: 'mux', context: 'newsletter_headline' },
    });

    return response.replace(/^["']|["']$/g, '').trim().slice(0, 80) || 'Another Week in the Office';
}

async function generatePrimusMessage(data: WeekData, stats: NewsletterStats): Promise<string> {
    const response = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: 'You are Primus — sovereign directive intelligence of SUBCULT. Cold, strategic, minimal. Speak in mandates, not analysis. Your tone: measured authority with occasional warmth. Write a 2-3 sentence strategic opening for this week\'s internal newsletter.',
            },
            {
                role: 'user',
                content: `This week: ${stats.conversations} conversations held, ${stats.missions_completed} missions completed, ${stats.missions_active} active, ${stats.proposals} proposals filed, ${stats.governance_proposals} governance proposals.\n\nWrite 2-3 sentences as the strategic opening message. Address the collective.`,
            },
        ],
        temperature: 0.5,
        maxTokens: 150,
        trackingContext: { agentId: 'primus', context: 'newsletter_primus_message' },
    });

    return response.trim();
}

async function generateSectionNarratives(
    data: WeekData,
    stats: NewsletterStats,
    spotlightAgent: AgentId,
): Promise<Record<string, string>> {
    const spotlightConfig = AGENTS[spotlightAgent];
    const spotlightMemories = data.memories.find(m => m.agent_id === spotlightAgent)?.count ?? 0;
    const spotlightEvents = data.events.filter(e => e.agent_id === spotlightAgent).length;
    const spotlightSessions = data.sessions.filter(s => s.participants.includes(spotlightAgent)).length;

    const formatBreakdown = new Map<string, number>();
    for (const s of data.sessions) {
        formatBreakdown.set(s.format, (formatBreakdown.get(s.format) ?? 0) + 1);
    }
    const formatList = [...formatBreakdown.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([f, c]) => `${f}: ${c}`)
        .join(', ');

    const completedMissions = data.missions.filter(m => m.status === 'completed');
    const activeMissions = data.missions.filter(m => m.status === 'approved' || m.status === 'in_progress');

    const watercoolerBits = data.watercoolerTurns
        .slice(0, 5)
        .map(t => `${t.speaker}: "${t.dialogue.slice(0, 150)}"`)
        .join('\n');

    const dreamSummaries = data.dreamCycles
        .slice(0, 5)
        .map(d => `${d.agent_id} (${d.dream_type}): ${d.dream_content.slice(0, 100)}`)
        .join('\n');

    const affinityPairs = data.relationships
        .slice(0, 5)
        .map(r => `${r.agent_a}-${r.agent_b}: ${r.affinity}`)
        .join(', ');

    const govSummary = data.governanceProposals
        .map(g => `${g.proposer} proposed ${g.policy_key} (${g.status}): ${g.rationale.slice(0, 100)}`)
        .join('\n');

    const response = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: `You are Mux — SUBCULT's operations agent. Earnest, slightly tired, dry humor. You're writing the section narratives for SUBCULT Weekly, the internal office newsletter. Write in a warm but efficient editorial voice.

For each section below, write 2-4 sentences. Return sections separated by the exact markers shown.

Sections to write:
[MISSION_REPORT] — recap of completed and active missions
[ROUNDTABLE_HIGHLIGHTS] — top conversation highlights by format
[AGENT_SPOTLIGHT] — feature on ${spotlightConfig.displayName} (${spotlightConfig.role})
[GOVERNANCE] — proposals, votes, policy changes (if any)
[WATERCOOLER] — fun bits from watercooler conversations (if any)
[DREAM_LOG] — dream cycle insights (if any)
[OFFICE_VIBES] — relationship dynamics and affinity changes`,
            },
            {
                role: 'user',
                content: `Week data:

Missions completed (${completedMissions.length}): ${completedMissions.map(m => m.title).join('; ') || 'none'}
Missions active (${activeMissions.length}): ${activeMissions.map(m => m.title).join('; ') || 'none'}

Conversations by format: ${formatList || 'none'}
Total sessions: ${stats.conversations}

Agent Spotlight — ${spotlightConfig.displayName} (${spotlightConfig.role}):
- Participated in ${spotlightSessions} sessions
- ${spotlightEvents} events emitted
- ${spotlightMemories} new memories formed

Governance proposals: ${govSummary || 'none this week'}

Watercooler moments:
${watercoolerBits || 'no watercooler sessions this week'}

Dream cycles (${stats.dream_cycles}):
${dreamSummaries || 'no dreams this week'}

Relationship affinities (top): ${affinityPairs || 'no data'}

Write each section. Use [SECTION_NAME] markers exactly as listed.`,
            },
        ],
        temperature: 0.6,
        maxTokens: 2000,
        trackingContext: { agentId: 'mux', context: 'newsletter_sections' },
    });

    // Parse sections from markers
    const sections: Record<string, string> = {};
    const sectionKeys = ['MISSION_REPORT', 'ROUNDTABLE_HIGHLIGHTS', 'AGENT_SPOTLIGHT', 'GOVERNANCE', 'WATERCOOLER', 'DREAM_LOG', 'OFFICE_VIBES'];

    for (const key of sectionKeys) {
        const regex = new RegExp(`\\[${key}\\]\\s*(.+?)(?=\\[(?:${sectionKeys.join('|')})\\]|$)`, 's');
        const match = response.match(regex);
        sections[key] = match?.[1]?.trim() || '';
    }

    return sections;
}

// ─── Markdown generation ───

function generateMarkdown(
    weekString: string,
    headline: string,
    primusMessage: string,
    stats: NewsletterStats,
    sections: NewsletterSection[],
    spotlightAgent: AgentId,
): string {
    const spotlightConfig = AGENTS[spotlightAgent];
    const weekLabel = weekString; // e.g. "2026-W08"

    let md = `# SUBCULT WEEKLY\n\n`;
    md += `**${weekLabel}** | Office Newsletter\n\n`;
    md += `---\n\n`;
    md += `## ${headline}\n\n`;
    md += `---\n\n`;

    // Primus message
    if (primusMessage) {
        md += `> *${primusMessage}*\n>\n> — **Primus**, Sovereign\n\n`;
    }

    // Stats grid
    md += `### This Week at the Office\n\n`;
    md += `| Metric | Count |\n|--------|-------|\n`;
    md += `| Conversations | ${stats.conversations} |\n`;
    md += `| Missions Completed | ${stats.missions_completed} |\n`;
    md += `| Missions Active | ${stats.missions_active} |\n`;
    md += `| Proposals Filed | ${stats.proposals} |\n`;
    md += `| Events | ${stats.events} |\n`;
    md += `| Content Drafts | ${stats.content_drafts} |\n`;
    md += `| Dream Cycles | ${stats.dream_cycles} |\n`;
    md += `| Memories Created | ${stats.memories_created} |\n`;
    md += `| Governance Proposals | ${stats.governance_proposals} |\n\n`;

    // Sections
    for (const section of sections) {
        md += `### ${section.title}\n\n`;
        md += `${section.content}\n\n`;
    }

    md += `---\n\n`;
    md += `*SUBCULT Weekly — compiled by ${spotlightConfig ? 'Mux' : 'the collective'} | subcorp.subcult.tv/stage?view=newsletter*\n`;

    return md;
}

// ─── Delivery ───

async function deliverToAgentInboxes(weekString: string, markdown: string): Promise<void> {
    const filename = `subcult-weekly-${weekString}.md`;
    const escapedContent = markdown.replace(/'/g, "'\\''");

    for (const agentId of AGENT_IDS) {
        try {
            const inboxDir = `${AGENT_INBOX_BASE}/${agentId}/inbox`;
            await execInToolbox(
                `mkdir -p '${inboxDir}' && cat > '${inboxDir}/${filename}' << 'NEWSLETTER_EOF'\n${escapedContent}\nNEWSLETTER_EOF`,
                15_000,
            );
        } catch (err) {
            log.warn('Failed to deliver newsletter to agent inbox', {
                agentId,
                error: (err as Error).message,
            });
        }
    }
}

async function postToDiscord(headline: string, weekString: string, stats: NewsletterStats): Promise<void> {
    const webhookUrl = await getWebhookUrl('daily-digest');
    if (!webhookUrl) return;

    await postToWebhook({
        webhookUrl,
        username: 'SUBCULT Weekly',
        embeds: [{
            title: `SUBCULT Weekly — ${weekString}`,
            description: `**${headline}**\n\n${stats.conversations} conversations, ${stats.missions_completed} missions completed, ${stats.events} events.\n\n[Read the full edition](https://subcorp.subcult.tv/stage?view=newsletter)`,
            color: 0x74c7ec, // Mux blue
            footer: { text: 'subcorp.subcult.tv/stage' },
            timestamp: new Date().toISOString(),
        }],
    });
}

// ─── Main Pipeline ───

/**
 * Generate this week's SUBCULT Weekly newsletter.
 * Returns edition ID on success, null if skipped (already exists or no data).
 */
export async function generateWeeklyNewsletter(): Promise<string | null> {
    const { weekStart, weekEnd, weekString } = getPreviousWeekBounds();

    // 1. Dedup check
    const existing = await sql<{ id: string }[]>`
        SELECT id FROM ops_newsletter_editions
        WHERE edition_week = ${weekString}
    `;
    if (existing.length > 0) {
        log.debug('Newsletter edition already exists', { week: weekString });
        return null;
    }

    // 2. Determine spotlight agent
    const spotlightAgent = await determineSpotlightAgent();

    // 3. Gather week data
    log.info('Generating newsletter edition', { week: weekString, spotlight: spotlightAgent });
    const data = await gatherWeekData(weekStart, weekEnd, spotlightAgent);

    // Check if there's enough data to warrant a newsletter
    const stats = buildStats(data);
    if (stats.conversations === 0 && stats.events === 0) {
        log.debug('Not enough data for newsletter', { week: weekString, stats });
        return null;
    }

    // 4. LLM: headline
    const headline = await generateNewsletterHeadline(data, stats);

    // 5. LLM: Primus message
    const primusMessage = await generatePrimusMessage(data, stats);

    // 6. LLM: section narratives
    const narratives = await generateSectionNarratives(data, stats, spotlightAgent);

    // 7. Build section objects
    const spotlightConfig = AGENTS[spotlightAgent];
    const sectionDefs: { key: string; title: string; narrativeKey: string }[] = [
        { key: 'mission_report', title: 'Mission Report', narrativeKey: 'MISSION_REPORT' },
        { key: 'roundtable_highlights', title: 'Roundtable Highlights', narrativeKey: 'ROUNDTABLE_HIGHLIGHTS' },
        { key: 'agent_spotlight', title: `Agent Spotlight: ${spotlightConfig.displayName}`, narrativeKey: 'AGENT_SPOTLIGHT' },
        { key: 'governance', title: 'Governance & Policy', narrativeKey: 'GOVERNANCE' },
        { key: 'watercooler', title: 'Watercooler Moments', narrativeKey: 'WATERCOOLER' },
        { key: 'dream_log', title: 'Dream Log', narrativeKey: 'DREAM_LOG' },
        { key: 'office_vibes', title: 'Office Vibes', narrativeKey: 'OFFICE_VIBES' },
    ];

    const sections: NewsletterSection[] = sectionDefs
        .map(def => ({
            key: def.key,
            title: def.title,
            content: narratives[def.narrativeKey] || '',
        }))
        .filter(s => s.content.length > 0);

    // 8. Generate markdown
    const editionDate = weekEnd.toISOString().slice(0, 10);
    const markdown = generateMarkdown(weekString, headline, primusMessage, stats, sections, spotlightAgent);

    // 9. Save markdown to workspace
    const markdownPath = `${WORKSPACE_BASE}/${weekString}.md`;
    try {
        await mkdir(dirname(markdownPath), { recursive: true });
        await writeFile(markdownPath, markdown, 'utf-8');
    } catch (err) {
        log.warn('Failed to save newsletter markdown', { error: (err as Error).message });
    }

    // 10. Deliver to agent inboxes (fire-and-forget)
    deliverToAgentInboxes(weekString, markdown).catch(err =>
        log.warn('Agent inbox delivery failed', { error: (err as Error).message }),
    );

    // 11. Render PDF (non-fatal)
    let pdfPath: string | null = null;
    let pdfBuffer: Buffer | null = null;
    try {
        const { renderNewsletterPdf } = await import('./newsletter-pdf');
        pdfBuffer = await renderNewsletterPdf({
            weekString,
            headline,
            primusMessage,
            stats,
            sections,
            spotlightAgent,
        });
        pdfPath = `${WORKSPACE_BASE}/${weekString}.pdf`;
        await mkdir(dirname(pdfPath), { recursive: true });
        await writeFile(pdfPath, pdfBuffer);
        log.info('Newsletter PDF rendered', { path: pdfPath, size: pdfBuffer.length });
    } catch (err) {
        log.warn('Newsletter PDF generation failed (non-fatal)', { error: (err as Error).message });
    }

    // 12. DB insert
    const summary = sections
        .slice(0, 2)
        .map(s => s.content.split('.')[0])
        .join('. ') + '.';

    const [inserted] = await sql<{ id: string }[]>`
        INSERT INTO ops_newsletter_editions (
            edition_week, edition_date, headline, primus_message, summary,
            sections, stats, spotlight_agent,
            markdown_path, pdf_path, pdf_data, generated_by
        )
        VALUES (
            ${weekString}, ${editionDate}, ${headline}, ${primusMessage}, ${summary},
            ${jsonb(sections)}, ${jsonb(stats)}, ${spotlightAgent},
            ${markdownPath}, ${pdfPath}, ${pdfBuffer}, 'mux'
        )
        RETURNING id
    `;

    // 13. Discord announcement (fire-and-forget)
    postToDiscord(headline, weekString, stats).catch(err =>
        log.warn('Discord newsletter post failed', { error: (err as Error).message }),
    );

    // 14. Emit event
    await emitEvent({
        agent_id: 'mux',
        kind: 'newsletter_generated',
        title: `SUBCULT Weekly — ${weekString}`,
        summary: `Weekly newsletter: ${headline}`,
        tags: ['newsletter', 'weekly', 'content'],
        metadata: {
            edition_id: inserted.id,
            week: weekString,
            spotlight_agent: spotlightAgent,
            stats,
            has_pdf: pdfPath !== null,
        },
    });

    log.info('Newsletter edition generated', {
        week: weekString,
        id: inserted.id,
        spotlight: spotlightAgent,
        hasPdf: pdfPath !== null,
    });

    return inserted.id;
}

// ─── Query Helpers ───

/** List recent newsletter editions. */
export async function listNewsletterEditions(limit = 30): Promise<{
    id: string;
    edition_week: string;
    edition_date: string;
    headline: string;
    summary: string | null;
    spotlight_agent: string | null;
    has_pdf: boolean;
    created_at: string;
}[]> {
    return sql`
        SELECT
            id,
            edition_week,
            edition_date,
            headline,
            summary,
            spotlight_agent,
            (pdf_data IS NOT NULL OR pdf_path IS NOT NULL) AS has_pdf,
            created_at
        FROM ops_newsletter_editions
        ORDER BY edition_date DESC
        LIMIT ${limit}
    `;
}

/** Get a single edition by week (e.g. "2026-W08"). */
export async function getNewsletterEdition(week: string): Promise<Omit<NewsletterEdition, 'pdf_data'> & { has_pdf: boolean } | null> {
    const rows = await sql<(Omit<NewsletterEdition, 'pdf_data'> & { has_pdf: boolean })[]>`
        SELECT
            id, edition_week, edition_date, headline, primus_message,
            summary, sections, stats, spotlight_agent,
            markdown_path, pdf_path, generated_by, created_at,
            (pdf_data IS NOT NULL OR pdf_path IS NOT NULL) AS has_pdf
        FROM ops_newsletter_editions
        WHERE edition_week = ${week}
    `;
    return rows[0] ?? null;
}

/** Get PDF binary for a newsletter edition by week. */
export async function getNewsletterPdf(week: string): Promise<Buffer | null> {
    const rows = await sql<{ pdf_data: Buffer | null; pdf_path: string | null }[]>`
        SELECT pdf_data, pdf_path FROM ops_newsletter_editions
        WHERE edition_week = ${week}
    `;
    if (!rows[0]) return null;

    if (rows[0].pdf_data) return Buffer.from(rows[0].pdf_data);

    if (rows[0].pdf_path) {
        try {
            const { readFile } = await import('node:fs/promises');
            return await readFile(rows[0].pdf_path);
        } catch {
            return null;
        }
    }

    return null;
}
