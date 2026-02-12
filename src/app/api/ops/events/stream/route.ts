// /api/ops/events/stream — SSE endpoint for real-time agent events
import { NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import {
    createSSEStream,
    sendEvent,
    keepAlive,
    createSSEResponse,
} from '@/lib/sse';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;
const KEEPALIVE_INTERVAL_MS = 15000;

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const lastEventId = searchParams.get('last_event_id');
    const agentId = searchParams.get('agent_id');
    const kind = searchParams.get('kind');

    const { stream, writer } = createSSEStream();

    // Track cursor — start after the given event ID's timestamp, or now
    let cursor: string | null = null;

    // If a last_event_id was provided, look up its created_at as the cursor
    if (lastEventId) {
        try {
            const rows = await sql`
                SELECT created_at FROM ops_agent_events
                WHERE id = ${lastEventId}
                LIMIT 1
            `;
            if (rows.length > 0) {
                cursor = rows[0].created_at;
            }
        } catch {
            // If lookup fails, start from now
        }
    }

    // If no cursor yet, use current time
    if (!cursor) {
        cursor = new Date().toISOString();
    }

    // Start keepalive
    const stopKeepAlive = keepAlive(writer, KEEPALIVE_INTERVAL_MS);

    // Poll for new events
    let isActive = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
        if (!isActive) return;

        try {
            const rows = await sql`
                SELECT * FROM ops_agent_events
                WHERE created_at > ${cursor}
                ${agentId ? sql`AND agent_id = ${agentId}` : sql``}
                ${kind ? sql`AND kind = ${kind}` : sql``}
                ORDER BY created_at ASC
                LIMIT 50
            `;

            for (const row of rows) {
                await sendEvent(writer, 'event', row);
                cursor = row.created_at;
            }
        } catch (err) {
            // Stream may be closed by client
            if (isActive) {
                try {
                    await sendEvent(writer, 'error', {
                        message: (err as Error).message,
                    });
                } catch {
                    // Writer closed, stop polling
                    isActive = false;
                }
            }
        }

        if (isActive) {
            pollTimer = setTimeout(poll, POLL_INTERVAL_MS);
        }
    }

    // Start first poll
    poll();

    // Handle client disconnect
    req.signal.addEventListener('abort', () => {
        isActive = false;
        stopKeepAlive();
        if (pollTimer) clearTimeout(pollTimer);
        writer.close().catch(() => {});
    });

    return createSSEResponse(stream);
}
