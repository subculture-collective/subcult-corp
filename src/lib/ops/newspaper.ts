// SUBCULT Daily — AI-generated newspaper pipeline
// Curates RSS items, generates summaries, produces markdown + PDF editions.
import { sql, jsonb } from '@/lib/db';
import { llmGenerate } from '@/lib/llm/client';
import { emitEvent } from '@/lib/ops/events';
import { postToWebhook } from '@/lib/discord/client';
import { getWebhookUrl } from '@/lib/discord/channels';
import { execInToolbox } from '@/lib/tools/executor';
import { AGENT_IDS } from '@/lib/agents';
import { logger } from '@/lib/logger';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const log = logger.child({ module: 'newspaper' });

// ─── Types ───

export interface NewspaperArticle {
    title: string;
    source: string;
    category: string;
    link: string | null;
    summary: string;
    ogImage: string | null;
}

export interface NewspaperEdition {
    id: string;
    edition_date: string;
    headline: string;
    summary: string;
    article_count: number;
    articles: NewspaperArticle[];
    markdown_path: string | null;
    pdf_path: string | null;
    pdf_data: Buffer | null;
    generated_by: string;
    created_at: string;
}

// ─── Constants ───

const WORKSPACE_BASE = '/workspace/output/newspapers';
const AGENT_INBOX_BASE = '/workspace/agents';
const OG_IMAGE_TIMEOUT_MS = 5_000;
const OG_IMAGE_MAX_BYTES = 50 * 1024; // 50KB
const OG_IMAGE_CONCURRENCY = 5;

// ─── og:image extraction ───

/** Extract og:image URL from the first 50KB of an article's HTML. */
async function fetchOgImage(url: string): Promise<string | null> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), OG_IMAGE_TIMEOUT_MS);

        const res = await fetch(url, {
            headers: { 'User-Agent': 'SubcultDaily/1.0' },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!res.ok || !res.body) return null;

        // Read only first 50KB
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let totalBytes = 0;

        while (totalBytes < OG_IMAGE_MAX_BYTES) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            totalBytes += value.length;
        }
        reader.cancel().catch(() => {});

        const html = new TextDecoder().decode(
            chunks.length === 1 ? chunks[0] : Buffer.concat(chunks),
        );

        // Parse og:image — handle both single and double quotes, content before/after property
        const match = html.match(
            /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        ) ?? html.match(
            /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
        );

        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

/** Fetch og:images for multiple articles with concurrency limit. */
async function fetchOgImages(
    articles: { link: string | null }[],
): Promise<(string | null)[]> {
    const results: (string | null)[] = new Array(articles.length).fill(null);
    const queue = articles
        .map((a, i) => ({ url: a.link, index: i }))
        .filter((item): item is { url: string; index: number } => item.url !== null);

    // Process in batches
    for (let i = 0; i < queue.length; i += OG_IMAGE_CONCURRENCY) {
        const batch = queue.slice(i, i + OG_IMAGE_CONCURRENCY);
        const batchResults = await Promise.all(
            batch.map(({ url }) => fetchOgImage(url)),
        );
        for (let j = 0; j < batch.length; j++) {
            results[batch[j].index] = batchResults[j];
        }
    }

    return results;
}

// ─── LLM steps ───

/** Ask LLM to select the best 12-18 articles from a numbered list. */
async function curateArticles(
    items: { index: number; title: string; category: string; source: string }[],
): Promise<number[]> {
    const numbered = items
        .map((item) => `${item.index}. [${item.category}] ${item.title} (${item.source})`)
        .join('\n');

    const response = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: 'You are a newspaper editor for SUBCULT Daily, a tech-forward daily newspaper. Select the most newsworthy articles for today\'s edition.',
            },
            {
                role: 'user',
                content: `From these articles, select 12-18 of the most important and interesting for today's newspaper. Prioritize: AI/ML, open source, cybersecurity, labor/organizing, geopolitics, and significant tech news. Avoid duplicates and low-quality items.

Return ONLY a comma-separated list of article numbers, nothing else. Example: 1,3,5,7,9,12,15

Articles:
${numbered}`,
            },
        ],
        temperature: 0.3,
        maxTokens: 100,
        trackingContext: { agentId: 'system', context: 'newspaper_curation' },
    });

    const indices = response
        .replace(/[^0-9,]/g, '')
        .split(',')
        .map(Number)
        .filter((n) => !isNaN(n) && n >= 0 && n < items.length);

    return [...new Set(indices)]; // deduplicate
}

/** Ask LLM to summarize all curated articles in one batch call. */
async function summarizeArticles(
    articles: { title: string; description: string | null; source: string; category: string }[],
): Promise<string[]> {
    const numbered = articles
        .map(
            (a, i) =>
                `${i + 1}. [${a.category}] "${a.title}" (${a.source})${a.description ? '\n   ' + a.description.slice(0, 300) : ''}`,
        )
        .join('\n\n');

    const response = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: 'You are a concise news summarizer for SUBCULT Daily. Write sharp, informative summaries.',
            },
            {
                role: 'user',
                content: `Summarize each article in 2-3 sentences. Be factual and informative. Number each summary to match the input.

Articles:
${numbered}

Write summaries as:
1. [summary]
2. [summary]
...`,
            },
        ],
        temperature: 0.3,
        maxTokens: 2000,
        trackingContext: { agentId: 'system', context: 'newspaper_summarization' },
    });

    // Parse numbered summaries
    const summaries: string[] = [];
    const lines = response.split('\n');
    let current = '';
    let currentNum = -1;

    for (const line of lines) {
        const match = line.match(/^(\d+)\.\s+(.+)/);
        if (match) {
            if (currentNum >= 0 && current) {
                summaries[currentNum] = current.trim();
            }
            currentNum = parseInt(match[1]) - 1;
            current = match[2];
        } else if (currentNum >= 0 && line.trim()) {
            current += ' ' + line.trim();
        }
    }
    if (currentNum >= 0 && current) {
        summaries[currentNum] = current.trim();
    }

    // Fill gaps with fallback
    return articles.map((a, i) => summaries[i] || a.description?.slice(0, 200) || a.title);
}

/** Generate a front-page headline from the top stories. */
async function generateHeadline(topStories: string[]): Promise<string> {
    const response = await llmGenerate({
        messages: [
            {
                role: 'system',
                content: 'You are a headline writer for SUBCULT Daily. Write compelling, newspaper-style headlines.',
            },
            {
                role: 'user',
                content: `Write one compelling front-page headline that captures today's top stories. Keep it under 80 characters. No quotes or punctuation at the start/end.

Top stories:
${topStories.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
            },
        ],
        temperature: 0.5,
        maxTokens: 50,
        trackingContext: { agentId: 'system', context: 'newspaper_headline' },
    });

    return response.replace(/^["']|["']$/g, '').trim() || 'Today in Tech, Security, and Power';
}

// ─── Markdown generation ───

const CATEGORY_LABELS: Record<string, string> = {
    tech: 'Technology',
    security: 'Security',
    politics: 'Politics & Power',
    organizing: 'Labor & Organizing',
    'open-source': 'Open Source',
    world: 'World',
    general: 'General',
};

function generateMarkdown(
    date: string,
    headline: string,
    articles: NewspaperArticle[],
): string {
    const grouped = new Map<string, NewspaperArticle[]>();
    for (const article of articles) {
        const cat = article.category;
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(article);
    }

    // Sort categories: tech first, then alphabetically
    const sortedCategories = [...grouped.keys()].sort((a, b) => {
        if (a === 'tech') return -1;
        if (b === 'tech') return 1;
        return a.localeCompare(b);
    });

    let md = `# SUBCULT DAILY\n\n`;
    md += `**${date}** | ${articles.length} articles curated from ${new Set(articles.map((a) => a.source)).size} sources\n\n`;
    md += `---\n\n`;
    md += `## ${headline}\n\n`;
    md += `---\n\n`;

    for (const category of sortedCategories) {
        const catArticles = grouped.get(category)!;
        const label = CATEGORY_LABELS[category] ?? category;
        md += `### ${label}\n\n`;

        for (const article of catArticles) {
            if (article.link) {
                md += `#### [${article.title}](${article.link})\n`;
            } else {
                md += `#### ${article.title}\n`;
            }
            md += `*${article.source}*\n\n`;
            md += `${article.summary}\n\n`;
        }
    }

    md += `---\n\n`;
    md += `*SUBCULT Daily — curated by the collective | subcorp.subcult.tv/news*\n`;

    return md;
}

// ─── Delivery ───

/** Write newspaper markdown to all 6 agent inboxes via toolbox container. */
async function deliverToAgentInboxes(date: string, markdown: string): Promise<void> {
    const filename = `subcult-daily-${date}.md`;
    const escapedContent = markdown.replace(/'/g, "'\\''");

    for (const agentId of AGENT_IDS) {
        try {
            const inboxDir = `${AGENT_INBOX_BASE}/${agentId}/inbox`;
            await execInToolbox(
                `mkdir -p '${inboxDir}' && cat > '${inboxDir}/${filename}' << 'NEWSPAPER_EOF'\n${escapedContent}\nNEWSPAPER_EOF`,
                15_000,
            );
        } catch (err) {
            log.warn('Failed to deliver newspaper to agent inbox', {
                agentId,
                error: (err as Error).message,
            });
        }
    }
}

/** Post newspaper announcement to Discord. */
async function postToDiscord(headline: string, articleCount: number, date: string): Promise<void> {
    const webhookUrl = await getWebhookUrl('daily-digest');
    if (!webhookUrl) return;

    await postToWebhook({
        webhookUrl,
        username: 'SUBCULT Daily',
        embeds: [{
            title: `SUBCULT Daily — ${date}`,
            description: `**${headline}**\n\n${articleCount} articles curated from today's feeds.\n\n[Read the full edition](https://subcorp.subcult.tv/news/${date})`,
            color: 0x1a1a2e,
            footer: { text: 'subcorp.subcult.tv/news' },
            timestamp: new Date().toISOString(),
        }],
    });
}

// ─── Main pipeline ───

/**
 * Generate today's SUBCULT Daily newspaper edition.
 * Returns edition ID on success, null if skipped (already exists or insufficient items).
 */
export async function generateDailyNewspaper(): Promise<string | null> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. Dedup check
    const existing = await sql<{ id: string }[]>`
        SELECT id FROM ops_newspaper_editions
        WHERE edition_date = ${today}
    `;
    if (existing.length > 0) {
        log.debug('Newspaper edition already exists', { date: today });
        return null;
    }

    // 2. Gather recent RSS items (last 24h)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentItems = await sql<{
        title: string;
        description: string | null;
        link: string | null;
        feed_name: string;
        category: string;
    }[]>`
        SELECT
            ri.title,
            ri.description,
            ri.link,
            rf.name AS feed_name,
            rf.category
        FROM ops_rss_items ri
        JOIN ops_rss_feeds rf ON rf.id = ri.feed_id
        WHERE ri.created_at >= ${since}
        ORDER BY ri.pub_date DESC NULLS LAST
        LIMIT 60
    `;

    if (recentItems.length < 5) {
        log.debug('Not enough RSS items for newspaper', { count: recentItems.length });
        return null;
    }

    log.info('Generating newspaper edition', { date: today, candidates: recentItems.length });

    // 3. Curate — LLM selects best articles
    const indexed = recentItems.map((item, i) => ({
        index: i,
        title: item.title,
        category: item.category,
        source: item.feed_name,
    }));

    let selectedIndices = await curateArticles(indexed);

    // Fallback: if curation returns too few, take top 15 by recency
    if (selectedIndices.length < 5) {
        log.warn('Curation returned too few articles, using fallback', {
            count: selectedIndices.length,
        });
        selectedIndices = recentItems.slice(0, 15).map((_, i) => i);
    }

    const curated = selectedIndices.map((i) => recentItems[i]).filter(Boolean);

    // 4. Summarize — batch LLM call
    const summaries = await summarizeArticles(
        curated.map((item) => ({
            title: item.title,
            description: item.description,
            source: item.feed_name,
            category: item.category,
        })),
    );

    // 5. Headline — LLM generates front-page headline
    const headline = await generateHeadline(curated.map((item) => item.title));

    // 6. Fetch og:images — parallel with concurrency limit
    const ogImages = await fetchOgImages(curated);

    // 7. Build article objects
    const articles: NewspaperArticle[] = curated.map((item, i) => ({
        title: item.title,
        source: item.feed_name,
        category: item.category,
        link: item.link,
        summary: summaries[i] || item.description?.slice(0, 200) || item.title,
        ogImage: ogImages[i],
    }));

    // 8. Generate edition summary from first few summaries
    const editionSummary = articles
        .slice(0, 3)
        .map((a) => a.summary.split('.')[0])
        .join('. ') + '.';

    // 9. Generate markdown
    const markdown = generateMarkdown(today, headline, articles);

    // 10. Save markdown to workspace
    const markdownPath = `${WORKSPACE_BASE}/${today}.md`;
    try {
        await mkdir(dirname(markdownPath), { recursive: true });
        await writeFile(markdownPath, markdown, 'utf-8');
    } catch (err) {
        log.warn('Failed to save newspaper markdown', { error: (err as Error).message });
    }

    // 11. Deliver to agent inboxes
    deliverToAgentInboxes(today, markdown).catch((err) =>
        log.warn('Agent inbox delivery failed', { error: (err as Error).message }),
    );

    // 12. Render PDF (non-fatal)
    let pdfPath: string | null = null;
    let pdfBuffer: Buffer | null = null;
    try {
        const { renderNewspaperPdf } = await import('./newspaper-pdf');
        pdfBuffer = await renderNewspaperPdf({
            date: today,
            headline,
            articles,
        });
        pdfPath = `${WORKSPACE_BASE}/${today}.pdf`;
        await mkdir(dirname(pdfPath), { recursive: true });
        await writeFile(pdfPath, pdfBuffer);
        log.info('PDF rendered', { path: pdfPath, size: pdfBuffer.length });
    } catch (err) {
        log.warn('PDF generation failed (non-fatal)', { error: (err as Error).message });
    }

    // 13. Store in DB (including PDF binary for persistence across rebuilds)
    const [inserted] = await sql<{ id: string }[]>`
        INSERT INTO ops_newspaper_editions (
            edition_date, headline, summary, article_count, articles,
            markdown_path, pdf_path, pdf_data, generated_by
        )
        VALUES (
            ${today}, ${headline}, ${editionSummary}, ${articles.length},
            ${jsonb(articles)}, ${markdownPath}, ${pdfPath},
            ${pdfBuffer}, 'system'
        )
        RETURNING id
    `;

    // 14. Discord announcement (fire-and-forget)
    postToDiscord(headline, articles.length, today).catch((err) =>
        log.warn('Discord newspaper post failed', { error: (err as Error).message }),
    );

    // 15. Emit event
    await emitEvent({
        agent_id: 'system',
        kind: 'newspaper_generated',
        title: `SUBCULT Daily — ${today}`,
        summary: `${articles.length} articles curated: ${headline}`,
        tags: ['newspaper', 'daily', 'content'],
        metadata: {
            edition_id: inserted.id,
            date: today,
            article_count: articles.length,
            has_pdf: pdfPath !== null,
        },
    });

    log.info('Newspaper edition generated', {
        date: today,
        articles: articles.length,
        id: inserted.id,
        hasPdf: pdfPath !== null,
    });

    return inserted.id;
}

// ─── Query helpers ───

/** List recent newspaper editions. */
export async function listEditions(limit = 30): Promise<{
    id: string;
    edition_date: string;
    headline: string;
    summary: string;
    article_count: number;
    has_pdf: boolean;
    created_at: string;
}[]> {
    return sql`
        SELECT
            id,
            edition_date,
            headline,
            summary,
            article_count,
            pdf_path IS NOT NULL AS has_pdf,
            created_at
        FROM ops_newspaper_editions
        ORDER BY edition_date DESC
        LIMIT ${limit}
    `;
}

/** Get a single edition by date (YYYY-MM-DD). Excludes heavy pdf_data column. */
export async function getEdition(date: string): Promise<Omit<NewspaperEdition, 'pdf_data'> & { has_pdf: boolean } | null> {
    const rows = await sql<(Omit<NewspaperEdition, 'pdf_data'> & { has_pdf: boolean })[]>`
        SELECT
            id, edition_date, headline, summary, article_count, articles,
            markdown_path, pdf_path, generated_by, created_at,
            (pdf_data IS NOT NULL OR pdf_path IS NOT NULL) AS has_pdf
        FROM ops_newspaper_editions
        WHERE edition_date = ${date}
    `;
    return rows[0] ?? null;
}

/** Get PDF binary for an edition by date. Returns null if no PDF stored. */
export async function getEditionPdf(date: string): Promise<Buffer | null> {
    const rows = await sql<{ pdf_data: Buffer | null; pdf_path: string | null }[]>`
        SELECT pdf_data, pdf_path FROM ops_newspaper_editions
        WHERE edition_date = ${date}
    `;
    if (!rows[0]) return null;

    // Prefer DB-stored binary; fall back to filesystem
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
