import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
    generateState,
    getOAuthRedirectUrl,
    type OAuthProvider,
} from '@/lib/auth/oauth';

export const dynamic = 'force-dynamic';

const VALID_PROVIDERS = new Set<OAuthProvider>(['github', 'discord']);
const STATE_COOKIE = 'oauth_state';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ provider: string }> },
) {
    const { provider } = await params;

    if (!VALID_PROVIDERS.has(provider as OAuthProvider)) {
        return NextResponse.json(
            { error: `Unknown provider: ${provider}` },
            { status: 400 },
        );
    }

    const state = generateState();
    const redirectUrl = getOAuthRedirectUrl(provider as OAuthProvider, state);

    if (!redirectUrl) {
        return NextResponse.json(
            { error: `${provider} OAuth not configured` },
            { status: 500 },
        );
    }

    // Store state in cookie for verification in callback
    const jar = await cookies();
    jar.set(STATE_COOKIE, state, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 600, // 10 minutes
        secure: process.env.NODE_ENV === 'production',
    });

    return NextResponse.redirect(redirectUrl);
}
