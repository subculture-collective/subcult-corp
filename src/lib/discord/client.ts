// Discord REST API v10 client — raw fetch, no dependencies
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'discord' });

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

// In-memory webhook cache: channelId -> webhookUrl
const webhookCache = new Map<string, string>();

interface WebhookPostOptions {
    webhookUrl: string;
    username?: string;
    avatarUrl?: string;
    content?: string;
    embeds?: DiscordEmbed[];
    threadId?: string;
}

export interface DiscordEmbed {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
    timestamp?: string;
}

/** POST to a Discord webhook. Returns the message object on success, null on failure. */
export async function postToWebhook(
    options: WebhookPostOptions,
): Promise<{ id: string; channel_id: string } | null> {
    const url = new URL(options.webhookUrl);
    url.searchParams.set('wait', 'true');
    if (options.threadId) {
        url.searchParams.set('thread_id', options.threadId);
    }

    const body: Record<string, unknown> = {};
    if (options.username) body.username = options.username;
    if (options.avatarUrl) body.avatar_url = options.avatarUrl;
    if (options.content) body.content = options.content;
    if (options.embeds) body.embeds = options.embeds;

    try {
        const res = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            log.warn('Webhook POST failed', {
                status: res.status,
                body: text.slice(0, 200),
            });
            return null;
        }

        return (await res.json()) as { id: string; channel_id: string };
    } catch (err) {
        log.warn('Webhook POST error', { error: (err as Error).message });
        return null;
    }
}

/**
 * Create a thread in a text channel via the Bot API.
 * Uses POST /channels/{channelId}/threads (type 11 = PUBLIC_THREAD).
 * Returns the new thread ID, or null on failure.
 */
export async function createThread(
    channelId: string,
    threadName: string,
): Promise<string | null> {
    if (!BOT_TOKEN) {
        log.warn('DISCORD_BOT_TOKEN not set, cannot create thread');
        return null;
    }

    try {
        const res = await discordFetch(`/channels/${channelId}/threads`, {
            method: 'POST',
            body: JSON.stringify({
                name: threadName.slice(0, 100), // Discord limit: 100 chars
                type: 11, // PUBLIC_THREAD
                auto_archive_duration: 1440, // 24 hours
            }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            log.warn('Thread creation failed', {
                status: res.status,
                channelId,
                body: text.slice(0, 200),
            });
            return null;
        }

        const thread = (await res.json()) as { id: string };
        return thread.id;
    } catch (err) {
        log.warn('Thread creation error', {
            error: (err as Error).message,
            channelId,
        });
        return null;
    }
}

/** Internal helper for bot API calls. */
async function discordFetch(
    path: string,
    options: RequestInit = {},
): Promise<Response> {
    const res = await fetch(`${DISCORD_API}${path}`, {
        ...options,
        headers: {
            Authorization: `Bot ${BOT_TOKEN}`,
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        log.warn('Discord rate limited', { retryAfter, path });
    }

    return res;
}

/**
 * List channel webhooks, reuse existing or create new.
 * Caches in-memory. Returns the webhook URL.
 */
export async function getOrCreateWebhook(
    channelId: string,
    name: string = 'Subcult',
): Promise<string | null> {
    if (!BOT_TOKEN) {
        log.warn('DISCORD_BOT_TOKEN not set, skipping webhook provisioning');
        return null;
    }

    const cached = webhookCache.get(channelId);
    if (cached) return cached;

    try {
        // List existing webhooks for the channel
        const listRes = await discordFetch(
            `/channels/${channelId}/webhooks`,
        );
        if (!listRes.ok) {
            log.warn('Failed to list webhooks', {
                status: listRes.status,
                channelId,
            });
            return null;
        }

        const webhooks = (await listRes.json()) as {
            id: string;
            name: string;
            url: string;
        }[];

        // Reuse existing webhook with our name
        const existing = webhooks.find((w) => w.name === name);
        if (existing) {
            const url = `https://discord.com/api/webhooks/${existing.id}/${(existing as Record<string, string>).token}`;
            webhookCache.set(channelId, url);
            return url;
        }

        // Create new webhook
        const createRes = await discordFetch(
            `/channels/${channelId}/webhooks`,
            {
                method: 'POST',
                body: JSON.stringify({ name }),
            },
        );
        if (!createRes.ok) {
            log.warn('Failed to create webhook', {
                status: createRes.status,
                channelId,
            });
            return null;
        }

        const created = (await createRes.json()) as {
            id: string;
            token: string;
        };
        const url = `https://discord.com/api/webhooks/${created.id}/${created.token}`;
        webhookCache.set(channelId, url);
        return url;
    } catch (err) {
        log.warn('Webhook provisioning error', {
            error: (err as Error).message,
            channelId,
        });
        return null;
    }
}

// ─── Multipart webhook (file attachments) ───

export interface WebhookFileAttachment {
    filename: string;
    data: Buffer;
    contentType: string; // e.g. "audio/mpeg"
}

/**
 * POST to a Discord webhook with file attachments via multipart/form-data.
 * If no files provided, delegates to existing postToWebhook.
 * Uses Node 22 native FormData — no external dependencies.
 */
export async function postToWebhookWithFiles(
    options: WebhookPostOptions & { files?: WebhookFileAttachment[] },
): Promise<{ id: string; channel_id: string } | null> {
    if (!options.files || options.files.length === 0) {
        return postToWebhook(options);
    }

    const url = new URL(options.webhookUrl);
    url.searchParams.set('wait', 'true');
    if (options.threadId) {
        url.searchParams.set('thread_id', options.threadId);
    }

    const payload: Record<string, unknown> = {};
    if (options.username) payload.username = options.username;
    if (options.avatarUrl) payload.avatar_url = options.avatarUrl;
    if (options.content) payload.content = options.content;
    if (options.embeds) payload.embeds = options.embeds;

    const formData = new FormData();
    formData.append('payload_json', JSON.stringify(payload));

    for (let i = 0; i < options.files.length; i++) {
        const file = options.files[i];
        const blob = new Blob([new Uint8Array(file.data)], { type: file.contentType });
        formData.append(`files[${i}]`, blob, file.filename);
    }

    try {
        const res = await fetch(url.toString(), {
            method: 'POST',
            body: formData,
            // No Content-Type header — auto multipart boundary
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            log.warn('Webhook multipart POST failed', {
                status: res.status,
                body: text.slice(0, 200),
            });
            return null;
        }

        return (await res.json()) as { id: string; channel_id: string };
    } catch (err) {
        log.warn('Webhook multipart POST error', {
            error: (err as Error).message,
        });
        return null;
    }
}

/** Convert hex color string to decimal int for Discord embeds. */
export function hexToDecimal(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}
