// /api/ops/newspaper — List newspaper editions (public)
import { NextRequest, NextResponse } from 'next/server';
import { listEditions } from '@/lib/ops/newspaper';
import { withRequestContext } from '@/middleware';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    return withRequestContext(req, async () => {
        const limit = Math.min(
            parseInt(req.nextUrl.searchParams.get('limit') ?? '30', 10),
            100,
        );
        const editions = await listEditions(limit);
        return NextResponse.json({ editions });
    });
}
