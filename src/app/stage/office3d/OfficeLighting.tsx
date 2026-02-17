// office3d/OfficeLighting.tsx — ambient + ceiling lights for 40x24 office
'use client';

import * as THREE from 'three';
import { COLORS } from './constants';

// Shared fixture geometries (8 instances each)
const FIXTURE_HOUSING = new THREE.BoxGeometry(1.2, 0.08, 0.4);
const FIXTURE_GLOW = new THREE.BoxGeometry(0.8, 0.04, 0.2);

// 4 ceiling lights — one per quadrant, wider spacing to reduce overlap
// Each covers ~16 unit radius, enough for a 40x24 room without redundancy
const LIGHT_POSITIONS: [number, number][] = [
    [-10, -4], [10, -4],
    [-10, 5],  [10, 5],
];

// All 8 fixture positions (visual meshes at ceiling, even where no point light)
const FIXTURE_POSITIONS: [number, number][] = [
    [-14, -4], [-6, -4], [6, -4], [14, -4],
    [-14, 4],  [-6, 4],  [6, 4],  [14, 4],
];

const PERIOD_CONFIG = {
    day:   { ambient: 0.35, spot: 0.9,  hemi: 0.3,  dirFill: 0.2,  glowEmissive: 0.3, hemiSky: '#1e3a5f', hemiGround: '#1e1e2e' },
    dusk:  { ambient: 0.25, spot: 0.7,  hemi: 0.2,  dirFill: 0.1,  glowEmissive: 0.6, hemiSky: '#3d1f5e', hemiGround: '#1a0a2e' },
    night: { ambient: 0.15, spot: 0.5,  hemi: 0.1,  dirFill: 0.03, glowEmissive: 0.9, hemiSky: '#0a0a1a', hemiGround: '#050510' },
} as const;

export function OfficeLighting({
    period,
}: {
    period: 'day' | 'dusk' | 'night';
}) {
    const cfg = PERIOD_CONFIG[period];

    return (
        <group>
            {/* Ambient base */}
            <ambientLight intensity={cfg.ambient} color='#b4befe' />

            {/* Hemisphere — sky/ground shift with time of day */}
            <hemisphereLight args={[cfg.hemiSky, cfg.hemiGround, cfg.hemi]} />

            {/* Visual fixture meshes on ceiling (all 8) */}
            {FIXTURE_POSITIONS.map(([x, z], i) => (
                <group key={`fixture-${i}`}>
                    {/* Light fixture housing */}
                    <mesh position={[x, 3.85, z]} geometry={FIXTURE_HOUSING}>
                        <meshStandardMaterial color={COLORS.surface1} />
                    </mesh>
                    {/* Light bulb glow — brighter at night */}
                    <mesh position={[x, 3.78, z]} geometry={FIXTURE_GLOW}>
                        <meshStandardMaterial
                            color={COLORS.yellow}
                            emissive={COLORS.yellow}
                            emissiveIntensity={cfg.glowEmissive}
                        />
                    </mesh>
                </group>
            ))}

            {/* 4 point lights — one per quadrant */}
            {LIGHT_POSITIONS.map(([x, z], i) => (
                <pointLight
                    key={`light-${i}`}
                    position={[x, 3.5, z]}
                    intensity={cfg.spot}
                    distance={18}
                    decay={2}
                    color={COLORS.yellow}
                />
            ))}

            {/* Directional fill — simulates indirect window light, dims at night */}
            <directionalLight
                position={[10, 12, 10]}
                intensity={cfg.dirFill}
                color='#cdd6f4'
            />
        </group>
    );
}
