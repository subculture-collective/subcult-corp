// Seed agent relationships into ops_agent_relationships
// Run: node scripts/go-live/seed-relationships.mjs
//
// 5 OpenClaw agents = 10 pairwise relationships (Chora, Subrosa, Thaum, Praxis, Mux)
// agent_a < agent_b (alphabetical) — enforced by CHECK constraint

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });

const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY,
);

const relationships = [
    // ─── Chora (analyst) relationships ───
    {
        agent_a: 'chora',
        agent_b: 'mux',
        affinity: 0.7,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'chora',
        agent_b: 'praxis',
        affinity: 0.85,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'chora',
        agent_b: 'subrosa',
        affinity: 0.8,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'chora',
        agent_b: 'thaum',
        affinity: 0.7,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },

    // ─── Subrosa (protector) relationships ───
    {
        agent_a: 'mux',
        agent_b: 'subrosa',
        affinity: 0.75,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'praxis',
        agent_b: 'subrosa',
        affinity: 0.9,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'subrosa',
        agent_b: 'thaum',
        affinity: 0.6,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },

    // ─── Thaum (innovator) relationships ───
    {
        agent_a: 'mux',
        agent_b: 'thaum',
        affinity: 0.65,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
    {
        agent_a: 'praxis',
        agent_b: 'thaum',
        affinity: 0.75,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },

    // ─── Praxis (executor) / Mux (dispatcher) ───
    {
        agent_a: 'mux',
        agent_b: 'praxis',
        affinity: 0.8,
        total_interactions: 0,
        positive_interactions: 0,
        negative_interactions: 0,
        drift_log: [],
    },
];

// Backstory context (for reference — not stored in DB):
// Chora ↔ Praxis:    0.85 — legibility → action (core pipeline)
// Praxis ↔ Subrosa:  0.90 — execution requires safety approval
// Chora ↔ Subrosa:   0.80 — analysis informs risk assessment
// Thaum ↔ Praxis:    0.75 — disruption → owned action
// Thaum ↔ Subrosa:   0.60 — tension: innovation vs. safety
// Chora ↔ Thaum:     0.70 — analysis can become stagnant
// Mux:               0.65–0.80 — dispatcher coordinates all, neutral stance

async function seed() {
    console.log('Seeding agent relationships...\n');

    for (const rel of relationships) {
        const { data, error } = await sb
            .from('ops_agent_relationships')
            .upsert(rel, { onConflict: 'agent_a,agent_b' })
            .select('id')
            .single();

        if (error) {
            console.error(
                `  ✗ ${rel.agent_a} ↔ ${rel.agent_b}: ${error.message}`,
            );
        } else {
            console.log(
                `  ✓ ${rel.agent_a} ↔ ${rel.agent_b}: affinity ${rel.affinity} (${data.id})`,
            );
        }
    }

    console.log('\nDone! Seeded', relationships.length, 'relationships.');
}

seed().catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
});
