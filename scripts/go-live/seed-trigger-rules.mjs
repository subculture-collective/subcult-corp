// Seed trigger rules into ops_trigger_rules
// Run: node scripts/go-live/seed-trigger-rules.mjs

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const triggers = [
    // ─── Reactive Triggers (Chora: Analysis) ───
    {
        name: 'Mission failure diagnosis (Chora)',
        trigger_event: 'mission_failed',
        conditions: { lookback_minutes: 60 },
        action_config: { target_agent: 'chora', action: 'diagnose' },
        cooldown_minutes: 120,
        enabled: true,
    },
    {
        name: 'Content published review (Chora)',
        trigger_event: 'content_published',
        conditions: { lookback_minutes: 60 },
        action_config: { target_agent: 'chora', action: 'analyze_reception' },
        cooldown_minutes: 120,
        enabled: true,
    },

    // ─── Subrosa: Risk Assessment ───
    {
        name: 'Public content risk check (Subrosa)',
        trigger_event: 'content_marked_public',
        conditions: { lookback_minutes: 5 },
        action_config: { target_agent: 'subrosa', action: 'risk_assessment' },
        cooldown_minutes: 60,
        enabled: true,
    },

    // ─── Thaum: Creative Disruption ───
    {
        name: 'Proactive signal scan (Thaum)',
        trigger_event: 'proactive_scan_signals',
        conditions: {
            topics: [
                'AI trends',
                'emerging tech',
                'startup ecosystem',
                'developer tools',
                'cultural shifts',
                'platform politics',
            ],
            skip_probability: 0.1,
            jitter_min_minutes: 25,
            jitter_max_minutes: 45,
        },
        action_config: { target_agent: 'thaum', action: 'surface_patterns' },
        cooldown_minutes: 180,
        enabled: true,
    },
    {
        name: 'Creativity unlock (Thaum)',
        trigger_event: 'work_stalled',
        conditions: { stall_minutes: 120 },
        action_config: {
            target_agent: 'thaum',
            action: 'propose_reframe',
        },
        cooldown_minutes: 240,
        enabled: true,
    },

    // ─── Praxis: Execution & Commitment ───
    {
        name: 'Auto-proposal acceptance (Praxis)',
        trigger_event: 'proposal_ready',
        conditions: { auto_approved: true },
        action_config: { target_agent: 'praxis', action: 'commit' },
        cooldown_minutes: 0,
        enabled: true,
    },
    {
        name: 'Milestone reached (Praxis)',
        trigger_event: 'mission_milestone_hit',
        conditions: { lookback_minutes: 30 },
        action_config: { target_agent: 'praxis', action: 'log_completion' },
        cooldown_minutes: 60,
        enabled: true,
    },

    // ─── Coordination ───
    {
        name: 'Roundtable convening (Mux dispatch)',
        trigger_event: 'daily_roundtable',
        conditions: {
            participants: ['chora', 'subrosa', 'thaum', 'praxis'],
            topic_source: 'recent_events',
        },
        action_config: { target_agent: 'mux', action: 'convene_roundtable' },
        cooldown_minutes: 1440,
        enabled: true,
    },
    {
        name: 'Memory consolidation (Chora)',
        trigger_event: 'memory_consolidation_due',
        conditions: { lookback_days: 1 },
        action_config: {
            target_agent: 'chora',
            action: 'distill_and_tag',
        },
        cooldown_minutes: 1440,
        enabled: true,
    },
];

async function seed() {
    console.log('Seeding ops_trigger_rules...');

    // Clear existing rules
    const { error: deleteError } = await sb
        .from('ops_trigger_rules')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all

    if (deleteError) {
        console.error(
            '  ✗ Failed to clear existing rules:',
            deleteError.message,
        );
    }

    for (const trigger of triggers) {
        const { error } = await sb.from('ops_trigger_rules').insert(trigger);

        if (error) {
            console.error(`  ✗ ${trigger.name}: ${error.message}`);
        } else {
            console.log(`  ✓ ${trigger.name}`);
        }
    }

    console.log(`Done. Seeded ${triggers.length} trigger rules.`);
}

seed().catch(console.error);
