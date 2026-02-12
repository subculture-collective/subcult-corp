/**
 * SSE (Server-Sent Events) utility module
 * Provides helpers for creating SSE streams in Next.js Route Handlers
 */

/**
 * SSE Stream Controller
 * Provides a ReadableStream and a writer for sending SSE events
 */
export interface SSEStreamController {
    stream: ReadableStream<Uint8Array>;
    writer: WritableStreamDefaultWriter<string>;
}

/**
 * Creates an SSE stream with a writer for sending events
 * @returns An object containing the ReadableStream and the writer
 */
export function createSSEStream(): SSEStreamController {
    const encoder = new TextEncoder();
    let writer: WritableStreamDefaultWriter<string>;

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            // Create a writable stream that encodes strings and enqueues to the readable stream
            const writable = new WritableStream<string>({
                write(chunk) {
                    controller.enqueue(encoder.encode(chunk));
                },
                close() {
                    controller.close();
                },
                abort(reason) {
                    controller.error(reason);
                },
            });

            writer = writable.getWriter();
        },
    });

    return { stream, writer: writer! };
}

/**
 * Sends an SSE event through the writer
 * @param writer - The WritableStreamDefaultWriter from createSSEStream
 * @param eventType - The event type (e.g., "message", "update")
 * @param data - The data to send (will be JSON stringified)
 */
export async function sendEvent(
    writer: WritableStreamDefaultWriter<string>,
    eventType: string,
    data: unknown,
): Promise<void> {
    const jsonData = JSON.stringify(data);
    const message = `event: ${eventType}\ndata: ${jsonData}\n\n`;
    await writer.write(message);
}

/**
 * Starts sending periodic keepalive comments to prevent connection timeout
 * @param writer - The WritableStreamDefaultWriter from createSSEStream
 * @param intervalMs - Interval in milliseconds between keepalive messages
 * @returns A function to stop the keepalive interval
 */
export function keepAlive(
    writer: WritableStreamDefaultWriter<string>,
    intervalMs: number,
): () => void {
    const interval = setInterval(async () => {
        try {
            await writer.write(':keepalive\n\n');
        } catch (error) {
            // Writer is likely closed, clear the interval
            clearInterval(interval);
        }
    }, intervalMs);

    return () => clearInterval(interval);
}

/**
 * Creates an SSE Response with proper headers
 * @param stream - The ReadableStream from createSSEStream
 * @returns A Response configured for SSE
 */
export function createSSEResponse(stream: ReadableStream<Uint8Array>): Response {
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
