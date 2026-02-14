// Recovery — reclaim stale steps and finalize missions
import { sql } from '@/lib/db';
import { emitEvent } from './events';
import { getPolicy } from './policy';

export async function recoverStaleSteps(): Promise<{ recovered: number }> {
    const policy = await getPolicy('recovery_policy');
    const staleThresholdMinutes = (policy.stale_threshold_minutes as number) ?? 30;
    const cutoff = new Date(Date.now() - staleThresholdMinutes * 60_000);

    const staleRows = await sql<{ id: string; mission_id: string }[]>`
        SELECT id, mission_id FROM ops_mission_steps
        WHERE status = 'running'
        AND updated_at < ${cutoff.toISOString()}
    `;

    if (staleRows.length === 0) return { recovered: 0 };

    const ids = staleRows.map(r => r.id);
    const reason = `Recovered: step exceeded ${staleThresholdMinutes} minute timeout`;
    await sql`
        UPDATE ops_mission_steps
        SET status = 'failed',
            failure_reason = ${reason},
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = ANY(${ids})
    `;

    // Finalize affected missions
    const missionIds = [...new Set(staleRows.map(r => r.mission_id))];
    for (const missionId of missionIds) {
        await maybeFinalializeMission(missionId);
    }

    await emitEvent({
        agent_id: 'mux',
        kind: 'stale_steps_recovered',
        title: `Recovered ${staleRows.length} stale step(s)`,
        summary: `Steps exceeded ${staleThresholdMinutes}min timeout`,
        tags: ['recovery', 'stale'],
        metadata: { stepIds: ids, missionIds },
    });

    return { recovered: staleRows.length };
}

export async function maybeFinalializeMission(
    missionId: string,
): Promise<void> {
    // Count pending steps (queued or running)
    const [{ count: pendingCount }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_mission_steps
        WHERE mission_id = ${missionId}
        AND status IN ('queued', 'running')
    `;

    if (pendingCount > 0) return; // Still has work to do

    // All steps done — determine outcome
    const [{ count: failedCount }] = await sql<[{ count: number }]>`
        SELECT COUNT(*)::int as count FROM ops_mission_steps
        WHERE mission_id = ${missionId}
        AND status = 'failed'
    `;

    const [mission] = await sql<[{ created_by: string; title: string }]>`
        SELECT created_by, title FROM ops_missions WHERE id = ${missionId}
    `;

    if (!mission) return;

    if (failedCount > 0) {
        const failReason = `${failedCount} step(s) failed`;
        await sql`
            UPDATE ops_missions
            SET status = 'failed',
                failure_reason = ${failReason},
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${missionId}
        `;

        await emitEvent({
            agent_id: mission.created_by,
            kind: 'mission_failed',
            title: `Mission failed: ${mission.title}`,
            tags: ['mission', 'failed'],
            metadata: { missionId, failedSteps: failedCount },
        });
    } else {
        await sql`
            UPDATE ops_missions
            SET status = 'succeeded',
                completed_at = NOW(),
                updated_at = NOW()
            WHERE id = ${missionId}
        `;

        await emitEvent({
            agent_id: mission.created_by,
            kind: 'mission_succeeded',
            title: `Mission completed: ${mission.title}`,
            tags: ['mission', 'succeeded'],
            metadata: { missionId },
        });
    }
}
