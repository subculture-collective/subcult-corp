// propose_mission tool — allows agents to create mission proposals during sessions
import type { NativeTool } from '../types';
import { createProposalAndMaybeAutoApprove } from '@/lib/ops/proposal-service';
import type { StepKind } from '@/lib/types';
import { logger } from '@/lib/logger';

const log = logger.child({ module: 'propose-mission' });

/**
 * Create a propose_mission execute function bound to a specific agentId.
 * The agentId is captured via closure to identify who is proposing.
 */
export function createProposeMissionExecute(agentId: string) {
    return async (params: Record<string, unknown>) => {
        const title = params.title as string;
        const description = (params.description as string) ?? '';
        const steps = params.steps as Array<{
            kind: string;
            payload?: Record<string, unknown>;
        }>;

        if (!title || !steps || !Array.isArray(steps) || steps.length === 0) {
            return {
                success: false,
                error: 'title and steps (non-empty array) are required',
            };
        }

        try {
            const result = await createProposalAndMaybeAutoApprove({
                agent_id: agentId,
                title,
                description,
                proposed_steps: steps.map(s => ({
                    kind: s.kind as StepKind,
                    payload: s.payload,
                })),
                source: 'agent',
            });

            log.info('Mission proposal created via tool', {
                proposalId: result.proposalId,
                missionId: result.missionId,
                agentId,
                autoApproved: !!result.missionId,
            });

            if (result.missionId) {
                return {
                    success: true,
                    proposal_id: result.proposalId,
                    mission_id: result.missionId,
                    message: `Mission proposal auto-approved and mission created. Steps will be executed by the worker.`,
                };
            }

            return {
                success: true,
                proposal_id: result.proposalId,
                message: `Mission proposal created and awaiting review. Step kinds not in the auto-approve list require manual approval.`,
            };
        } catch (err) {
            const error = err as Error;
            log.error('Failed to create mission proposal', {
                error: error.message,
                agentId,
                title,
            });

            return {
                success: false,
                error: error.message,
                message: `Failed to create proposal: ${error.message}`,
            };
        }
    };
}

export const proposeMissionTool: NativeTool = {
    name: 'propose_mission',
    description:
        'Propose a mission with concrete steps to execute. If all step kinds are in the auto-approve list, the mission will be created and executed immediately. Otherwise it goes to pending review. Use this to turn ideas and plans into actual work.',
    agents: ['praxis', 'primus', 'mux'],
    parameters: {
        type: 'object',
        properties: {
            title: {
                type: 'string',
                description:
                    'A clear, actionable mission title (e.g., "Build diagnostic engine MVP")',
            },
            description: {
                type: 'string',
                description: 'Why this mission matters and what it accomplishes',
            },
            steps: {
                type: 'array',
                description: 'Concrete steps to execute. Each step has a kind and optional payload.',
                items: {
                    type: 'object',
                    properties: {
                        kind: {
                            type: 'string',
                            description:
                                'Step kind: research_topic, scan_signals, draft_essay, draft_thread, patch_code, audit_system, critique_content, distill_insight, document_lesson, consolidate_memory, memory_archaeology',
                        },
                        payload: {
                            type: 'object',
                            description:
                                'Step-specific payload (e.g., { "topic": "..." } for research_topic, code change description for patch_code)',
                        },
                    },
                    required: ['kind'],
                },
            },
        },
        required: ['title', 'steps'],
    },
    // Execute will be bound per-agent via createProposeMissionExecute in registry
    execute: createProposeMissionExecute('system'),
};
