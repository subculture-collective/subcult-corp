// TranscriptViewer — click-to-read conversation transcripts
'use client';

import { useConversationTurns } from './hooks';
import { AGENTS } from '@/lib/agents';
import type { AgentId, RoundtableSession, RoundtableTurn } from '@/lib/types';

// ─── Agent voice symbols ───

const VOICE_SYMBOLS: Record<string, string> = {
    chora: '\u{1F300}',    // 🌀
    subrosa: '\u{1F339}',  // 🌹
    thaum: '\u{2728}',     // ✨
    praxis: '\u{1F6E0}',   // 🛠️
    mux: '\u{1F5C2}',      // 🗂️
    primus: '\u{265B}',    // ♛
};

// ─── Helpers ───

function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
}

function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}

const STATUS_STYLES: Record<string, string> = {
    pending: 'text-accent-yellow',
    running: 'text-accent-blue',
    completed: 'text-accent-green',
    failed: 'text-accent-red',
};

// ─── Single Turn Bubble ───

function TurnBubble({ turn }: { turn: RoundtableTurn }) {
    const agentId = turn.speaker as AgentId;
    const agent = AGENTS[agentId];
    const textColor = agent?.tailwindTextColor ?? 'text-zinc-400';
    const borderBg = agent?.tailwindBorderBg ?? 'border-zinc-700/40 bg-zinc-800/5';
    const symbol = VOICE_SYMBOLS[turn.speaker] ?? '';

    return (
        <div className='flex gap-3 items-start'>
            {/* Speaker icon */}
            <div className='shrink-0 w-8 pt-1 text-center'>
                <span className='text-base leading-none'>{symbol}</span>
            </div>

            {/* Bubble */}
            <div className={`flex-1 rounded-lg border px-3 py-2 ${borderBg}`}>
                <div className='flex items-center gap-2 mb-0.5'>
                    <span className={`text-xs font-semibold ${textColor}`}>
                        {agent?.displayName ?? turn.speaker}
                    </span>
                    <span className='text-[10px] text-zinc-600 font-mono tabular-nums'>
                        #{turn.turn_number + 1}
                    </span>
                    <span className='text-[10px] text-zinc-600 font-mono tabular-nums'>
                        {formatTime(turn.created_at)}
                    </span>
                </div>
                <p className='text-sm text-zinc-200 leading-relaxed'>
                    {turn.dialogue}
                </p>
            </div>
        </div>
    );
}

// ─── Transcript Header ───

function TranscriptHeader({
    session,
    onClose,
}: {
    session: RoundtableSession;
    onClose: () => void;
}) {
    const statusColor = STATUS_STYLES[session.status] ?? 'text-zinc-400';

    return (
        <div className='flex items-start justify-between gap-3 px-4 py-3 border-b border-zinc-800'>
            <div className='min-w-0 flex-1'>
                <h3 className='text-sm font-medium text-zinc-200 leading-snug'>
                    {session.topic}
                </h3>
                <div className='flex items-center gap-2 mt-1 flex-wrap'>
                    <span className='text-[10px] text-zinc-500 font-mono uppercase'>
                        {session.format.replace('_', ' ')}
                    </span>
                    <span className='text-[10px] text-zinc-600'>&middot;</span>
                    <span className='text-[10px] text-zinc-500 tabular-nums'>
                        {session.turn_count} turns
                    </span>
                    <span className='text-[10px] text-zinc-600'>&middot;</span>
                    <span className={`text-[10px] font-medium ${statusColor}`}>
                        {session.status}
                    </span>
                    {session.created_at && (
                        <>
                            <span className='text-[10px] text-zinc-600'>&middot;</span>
                            <span className='text-[10px] text-zinc-600 font-mono'>
                                {formatDateTime(session.created_at)}
                            </span>
                        </>
                    )}
                </div>
            </div>
            <button
                onClick={onClose}
                className='shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded hover:bg-zinc-800'
                aria-label='Close transcript'
            >
                <svg className='h-4 w-4' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2}>
                    <path strokeLinecap='round' strokeLinejoin='round' d='M6 18L18 6M6 6l12 12' />
                </svg>
            </button>
        </div>
    );
}

// ─── Participant Bar ───

function ParticipantBar({ participants }: { participants: string[] }) {
    return (
        <div className='px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/40'>
            <div className='flex items-center gap-3 flex-wrap'>
                {participants.map(p => {
                    const agent = AGENTS[p as AgentId];
                    const color = agent?.tailwindTextColor ?? 'text-zinc-400';
                    const symbol = VOICE_SYMBOLS[p] ?? '';
                    return (
                        <span
                            key={p}
                            className={`text-[11px] font-medium ${color}`}
                        >
                            {symbol} {agent?.displayName ?? p}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Loading Skeleton ───

function TranscriptSkeleton() {
    return (
        <div className='px-4 py-3 space-y-3'>
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className='flex gap-3 items-start'>
                    <div className='w-8 h-8 rounded bg-zinc-800/60 animate-pulse' />
                    <div className='flex-1 h-14 rounded-lg bg-zinc-800/40 animate-pulse' />
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ───

export function TranscriptViewer({
    session,
    onClose,
}: {
    session: RoundtableSession;
    onClose: () => void;
}) {
    const { turns, loading } = useConversationTurns(session.id);

    return (
        <div className='rounded-xl border border-zinc-700/50 bg-zinc-900/80 overflow-hidden'>
            <TranscriptHeader session={session} onClose={onClose} />
            <ParticipantBar participants={session.participants} />

            {/* Transcript body */}
            <div className='max-h-[32rem] overflow-y-auto scrollbar-thin scrollbar-track-zinc-900 scrollbar-thumb-zinc-700'>
                {loading ? (
                    <TranscriptSkeleton />
                ) : turns.length === 0 ? (
                    <div className='px-4 py-8 text-center'>
                        <p className='text-sm text-zinc-500'>
                            No turns recorded for this conversation.
                        </p>
                    </div>
                ) : (
                    <div className='px-4 py-3 space-y-2'>
                        {turns.map(turn => (
                            <TurnBubble key={turn.id} turn={turn} />
                        ))}

                        {/* End marker */}
                        <div className='flex items-center gap-2 pt-2'>
                            <div className='flex-1 h-px bg-zinc-800' />
                            <span className='text-[10px] text-zinc-600 font-mono'>
                                end of transcript
                            </span>
                            <div className='flex-1 h-px bg-zinc-800' />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
