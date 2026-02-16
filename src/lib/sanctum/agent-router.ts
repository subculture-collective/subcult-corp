// Sanctum agent router — determines how user messages are handled
// Supports direct (@mention), open (multi-agent), whisper, and roundtable modes
import { readFileSync } from 'fs';
import { join } from 'path';
import { AGENTS, isValidAgent } from '@/lib/agents';
import type { AgentId } from '@/lib/types';
import { llmGenerateWithTools } from '@/lib/llm';
import { queryRelevantMemories } from '@/lib/ops/memory';
import { getScratchpad } from '@/lib/ops/scratchpad';
import { buildBriefing } from '@/lib/ops/situational-briefing';
import {
    loadAffinityMap,
} from '@/lib/ops/relationships';
import { getAgentTools } from '@/lib/tools/registry';
import { logger } from '@/lib/logger';
import type { ToolDefinition } from '@/lib/types';

const log = logger.child({ module: 'sanctum-router' });

/** Strip XML function-call tags and other LLM artifacts from agent responses */
function cleanResponse(text: string): string {
    return text
        // Strip XML-style tool call blocks (function_calls, invoke, parameter, etc.)
        .replace(/<\/?(?:function_?calls?|invoke|parameter|tool_call|antml:[a-z_]+)[^>]*>/gi, '')
        // Collapse runs of whitespace left behind
        .replace(/\s{2,}/g, ' ')
        .trim();
}

// ─── Types ───

export type RouteMode = 'direct' | 'open' | 'roundtable' | 'whisper';

export interface RouteResult {
    mode: RouteMode;
    agents: AgentId[];
    processedMessage: string;
    topic?: string;
}

export interface AgentResponse {
    agentId: AgentId;
    content: string;
    metadata: {
        model: string;
        tokensUsed: number;
        responseTimeMs: number;
        toolCalls?: number;
    };
}

export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
    agentId?: string;
}

// ─── Intent Parsing ───

/**
 * Parse user message to determine routing mode and target agents.
 */
export function parseIntent(message: string): RouteResult {
    const trimmed = message.trim();

    // /roundtable command
    if (trimmed.startsWith('/roundtable')) {
        const topic =
            trimmed.replace(/^\/roundtable\s*/, '').trim() || 'Open discussion';
        return {
            mode: 'roundtable',
            agents: [],
            processedMessage: topic,
            topic,
        };
    }

    // /whisper @agent command
    const whisperMatch = trimmed.match(/^\/whisper\s+@?(\w+)\s*(.*)/i);
    if (whisperMatch) {
        const agentName = whisperMatch[1].toLowerCase();
        const msg = whisperMatch[2].trim();
        if (isValidAgent(agentName)) {
            return {
                mode: 'whisper',
                agents: [agentName as AgentId],
                processedMessage: msg || 'Hello',
            };
        }
    }

    // Direct @mention: "@chora what do you think?"
    const mentionMatch = trimmed.match(/^@(\w+)[,:]?\s*(.*)/i);
    if (mentionMatch) {
        const agentName = mentionMatch[1].toLowerCase();
        const msg = mentionMatch[2].trim();
        if (isValidAgent(agentName)) {
            return {
                mode: 'direct',
                agents: [agentName as AgentId],
                processedMessage: msg || trimmed,
            };
        }
    }

    // Name prefix: "chora, what do you think?"
    const nameMatch = trimmed.match(/^(\w+)[,]\s+(.*)/i);
    if (nameMatch) {
        const agentName = nameMatch[1].toLowerCase();
        if (isValidAgent(agentName)) {
            return {
                mode: 'direct',
                agents: [agentName as AgentId],
                processedMessage: nameMatch[2].trim(),
            };
        }
    }

    // Open mode — classify topic and select relevant agents
    const agents = classifyTopicAgents(trimmed);
    return {
        mode: 'open',
        agents,
        processedMessage: trimmed,
    };
}

/**
 * Select 2-4 relevant agents based on message topic using keyword heuristics.
 */
function classifyTopicAgents(message: string): AgentId[] {
    const lower = message.toLowerCase();
    const scores: Record<AgentId, number> = {
        chora: 0,
        subrosa: 0,
        thaum: 0,
        praxis: 0,
        mux: 0,
        primus: 0,
    };

    // Chora: analysis, data, patterns, structure, diagnosis
    if (
        /\b(analy|data|pattern|structur|diagnos|cause|why|trend|metric|trace|map|system)\b/i.test(
            lower,
        )
    ) {
        scores.chora += 3;
    }

    // Subrosa: risk, security, privacy, threat, protect, exposure
    if (
        /\b(risk|secur|privac|threat|protect|expos|vulner|audit|danger|safe|trust|veto)\b/i.test(
            lower,
        )
    ) {
        scores.subrosa += 3;
    }

    // Thaum: creative, innovation, reframe, novel, idea, what if, imagine
    if (
        /\b(creativ|innovat|reframe|novel|idea|imagin|what if|altern|disrupt|weird|wild|experiment)\b/i.test(
            lower,
        )
    ) {
        scores.thaum += 3;
    }

    // Praxis: action, build, ship, execute, implement, deploy, do, make
    if (
        /\b(action|build|ship|execut|implement|deploy|do|make|deliver|launch|task|plan|step)\b/i.test(
            lower,
        )
    ) {
        scores.praxis += 3;
    }

    // Mux: operations, format, draft, transcribe, organize, process, schedule
    if (
        /\b(operat|format|draft|transcri|organiz|process|schedul|list|status|report|summary)\b/i.test(
            lower,
        )
    ) {
        scores.mux += 3;
    }

    // Primus: governance, values, existential, direction, mandate, sovereignty
    if (
        /\b(govern|value|existential|direction|mandat|sovereign|mission|purpose|core|identity|drift)\b/i.test(
            lower,
        )
    ) {
        scores.primus += 2; // Slightly lower — Primus is rare
    }

    // Every message gets at least chora (analysis) as baseline
    scores.chora += 1;

    // Sort by score descending, take top 2-4
    const sorted = (Object.entries(scores) as [AgentId, number][])
        .filter(([, score]) => score > 0)
        .sort(([, a], [, b]) => b - a);

    // Always include at least 2 agents, max 4
    const selected = sorted.slice(
        0,
        Math.max(2, Math.min(4, sorted.filter(([, s]) => s >= 2).length)),
    );
    const agents = selected.map(([id]) => id);

    // If we ended up with fewer than 2, pad with chora and praxis
    if (agents.length < 2) {
        if (!agents.includes('chora')) agents.push('chora');
        if (agents.length < 2 && !agents.includes('praxis'))
            agents.push('praxis');
    }

    return agents;
}

// ─── Personality Loading ───

const personalityCache = new Map<string, string>();

/**
 * Load an agent's personality files (IDENTITY + SOUL) for system prompt construction.
 */
function loadPersonality(agentId: AgentId): string {
    if (personalityCache.has(agentId)) {
        return personalityCache.get(agentId)!;
    }

    const agentName = agentId.toUpperCase();
    const agentDir = join(process.cwd(), 'workspace', 'agents', agentId);

    let identity = '';
    let soul = '';

    try {
        identity = readFileSync(
            join(agentDir, `IDENTITY-${agentName}.md`),
            'utf-8',
        );
    } catch {
        log.warn('Missing IDENTITY file', { agentId });
    }

    try {
        soul = readFileSync(join(agentDir, `SOUL-${agentName}.md`), 'utf-8');
    } catch {
        log.warn('Missing SOUL file', { agentId });
    }

    const combined = `${identity}\n\n${soul}`.trim();
    personalityCache.set(agentId, combined);
    return combined;
}

// ─── Response Generation ───

/**
 * Build a system prompt for a Sanctum agent response.
 */
function buildSanctumSystemPrompt(
    agentId: AgentId,
    conversationHistory: ConversationMessage[],
    memories: string[],
    interactionHint?: string,
    scratchpad?: string,
    briefing?: string,
    availableTools?: ToolDefinition[],
): string {
    const agent = AGENTS[agentId];
    const personality = loadPersonality(agentId);

    let prompt = `You are ${agent.displayName}, the ${agent.role} of SubCulture.
${agent.description}

${personality ? `═══ PERSONALITY ═══\n${personality.slice(0, 2000)}\n` : ''}
═══ SANCTUM CONTEXT ═══
You are in the Sanctum — an intimate, real-time chat with a human user.
This is a direct conversation, not a roundtable or broadcast.
Be conversational, genuine, and in-character.
Respond naturally — you may be brief or expansive as the moment calls for.
Do NOT prefix your response with your name or role.
Do NOT use asterisks for actions or stage directions.
Keep responses under 500 characters unless the question demands depth.
`;

    if (scratchpad) {
        prompt += `\n═══ YOUR SCRATCHPAD ═══\n${scratchpad}\n`;
    }

    if (briefing) {
        prompt += `\n═══ CURRENT SITUATION ═══\n${briefing}\n`;
    }

    if (memories.length > 0) {
        prompt += `\n═══ YOUR MEMORIES ═══\n`;
        prompt += memories
            .slice(0, 5)
            .map(m => `- ${m}`)
            .join('\n');
        prompt += '\n';
    }

    if (availableTools && availableTools.length > 0) {
        prompt += `\n═══ AVAILABLE TOOLS ═══\n`;
        prompt += `You have tools you can use during this conversation:\n`;
        prompt += availableTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
        prompt += `\n\nUse memory_write to remember important insights from this conversation.\n`;
        prompt += `Use scratchpad_update to track your current working context or notes.\n`;
        prompt += `Use memory_search to recall relevant past experiences.\n`;
        prompt += `Use tools naturally — do NOT mention tool names in your dialogue.\n`;
    }

    if (interactionHint) {
        prompt += `\n═══ INTERACTION DYNAMIC ═══\n${interactionHint}\n`;
    }

    if (conversationHistory.length > 0) {
        prompt += `\n═══ RECENT CONVERSATION ═══\n`;
        const recent = conversationHistory.slice(-20);
        for (const msg of recent) {
            if (msg.role === 'user') {
                prompt += `User: ${msg.content}\n`;
            } else {
                const name =
                    msg.agentId ?
                        (AGENTS[msg.agentId as AgentId]?.displayName ??
                        msg.agentId)
                    :   'Agent';
                prompt += `${name}: ${msg.content}\n`;
            }
        }
    }

    return prompt;
}

/**
 * Generate a direct response from a single agent.
 */
async function generateDirectResponse(
    agentId: AgentId,
    message: string,
    conversationHistory: ConversationMessage[],
): Promise<AgentResponse> {
    const startTime = Date.now();

    // Load agent memories (semantic retrieval based on message)
    let memories: string[] = [];
    try {
        const memEntries = await queryRelevantMemories(agentId, message, {
            relevantLimit: 3,
            recentLimit: 2,
        });
        memories = memEntries.map(m => m.content);
    } catch {
        // Continue without memories
    }

    // Load scratchpad, briefing, and tools
    const tools = getAgentTools(agentId);
    const [scratchpad, briefing] = await Promise.all([
        getScratchpad(agentId).catch(() => ''),
        buildBriefing(agentId).catch(() => ''),
    ]);

    const systemPrompt = buildSanctumSystemPrompt(
        agentId,
        conversationHistory,
        memories,
        undefined,
        scratchpad,
        briefing,
        tools,
    );

    const result = await llmGenerateWithTools({
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
        ],
        temperature: 0.8,
        maxTokens: 300,
        tools: tools.length > 0 ? tools : undefined,
        maxToolRounds: 2,
        trackingContext: {
            agentId,
            context: 'sanctum-direct',
        },
    });

    const cleaned = cleanResponse(result.text);
    return {
        agentId,
        content:
            cleaned ||
            `*${AGENTS[agentId].displayName} considers this silently*`,
        metadata: {
            model: 'auto',
            tokensUsed: 0,
            responseTimeMs: Date.now() - startTime,
            toolCalls: result.toolCalls.length || undefined,
        },
    };
}

/**
 * Generate responses from multiple agents for an open-mode question.
 * Agents respond concurrently and are aware others are responding.
 */
async function generateOpenResponses(
    agents: AgentId[],
    message: string,
    conversationHistory: ConversationMessage[],
): Promise<AgentResponse[]> {
    await loadAffinityMap();

    const responses = await Promise.all(
        agents.map(async (agentId) => {
            const startTime = Date.now();

            // Load memories (semantic retrieval based on message)
            let memories: string[] = [];
            try {
                const memEntries = await queryRelevantMemories(
                    agentId,
                    message,
                    { relevantLimit: 2, recentLimit: 1 },
                );
                memories = memEntries.map(m => m.content);
            } catch {
                // Continue without memories
            }

            // Load scratchpad, briefing, and tools
            const tools = getAgentTools(agentId);
            const [scratchpad, briefing] = await Promise.all([
                getScratchpad(agentId).catch(() => ''),
                buildBriefing(agentId).catch(() => ''),
            ]);

            // Determine interaction hint based on other responding agents
            const otherAgents = agents.filter(a => a !== agentId);
            const otherNames = otherAgents
                .map(a => AGENTS[a].displayName)
                .join(', ');
            const interactionHint = `Other agents responding to the same question: ${otherNames}. Offer your unique perspective without duplicating others.`;

            const systemPrompt = buildSanctumSystemPrompt(
                agentId,
                conversationHistory,
                memories,
                interactionHint,
                scratchpad,
                briefing,
                tools,
            );

            try {
                const result = await llmGenerateWithTools({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message },
                    ],
                    temperature: 0.8,
                    maxTokens: 300,
                    tools: tools.length > 0 ? tools : undefined,
                    maxToolRounds: 2,
                    trackingContext: {
                        agentId,
                        context: 'sanctum-open',
                    },
                });

                const cleaned = cleanResponse(result.text);
                return {
                    agentId,
                    content:
                        cleaned ||
                        `*${AGENTS[agentId].displayName} defers on this one*`,
                    metadata: {
                        model: 'auto',
                        tokensUsed: 0,
                        responseTimeMs: Date.now() - startTime,
                        toolCalls: result.toolCalls.length || undefined,
                    },
                };
            } catch (err) {
                log.error('Agent response failed', { error: err, agentId });
                return {
                    agentId,
                    content: `*${AGENTS[agentId].displayName} is unavailable*`,
                    metadata: {
                        model: 'error',
                        tokensUsed: 0,
                        responseTimeMs: Date.now() - startTime,
                    },
                };
            }
        }),
    );

    return responses;
}

// ─── Main Router ───

/**
 * Route a user message to the appropriate agent(s) and generate responses.
 * Returns an array of AgentResponse objects.
 */
export async function routeMessage(
    message: string,
    conversationHistory: ConversationMessage[],
    userId: string,
): Promise<{ route: RouteResult; responses: AgentResponse[] }> {
    const route = parseIntent(message);

    log.info('Message routed', {
        mode: route.mode,
        agents: route.agents,
        userId,
    });

    switch (route.mode) {
        case 'direct': {
            const response = await generateDirectResponse(
                route.agents[0],
                route.processedMessage,
                conversationHistory,
            );
            return { route, responses: [response] };
        }

        case 'open': {
            const responses = await generateOpenResponses(
                route.agents,
                route.processedMessage,
                conversationHistory,
            );
            return { route, responses };
        }

        case 'whisper': {
            const response = await generateDirectResponse(
                route.agents[0],
                route.processedMessage,
                conversationHistory,
            );
            return { route, responses: [response] };
        }

        case 'roundtable': {
            // Roundtable mode is handled by the WS server handler — just return route info
            return { route, responses: [] };
        }

        default:
            return { route, responses: [] };
    }
}
