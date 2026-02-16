import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: {
        template: '%s | SUBCULT Learn',
        default: 'Learn | SUBCULT OPS',
    },
    description:
        'Guides, comparisons, and a directory of tools for building AI agent systems — autonomous agents, multi-agent orchestration, LLM routing, and more.',
};

export default function LearnLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className='min-h-screen bg-[#11111b] text-zinc-100'>
            {/* Nav */}
            <header className='border-b border-zinc-800'>
                <div className='max-w-4xl mx-auto px-4 py-4 flex items-center justify-between'>
                    <Link
                        href='/learn'
                        className='text-sm font-semibold text-zinc-300 hover:text-white transition-colors'
                    >
                        SUBCULT{' '}
                        <span className='text-zinc-600'>Learn</span>
                    </Link>
                    <nav className='flex items-center gap-4 text-xs text-zinc-500'>
                        <Link
                            href='/learn/glossary'
                            className='hover:text-zinc-300 transition-colors'
                        >
                            Glossary
                        </Link>
                        <Link
                            href='/learn/compare'
                            className='hover:text-zinc-300 transition-colors'
                        >
                            Compare
                        </Link>
                        <Link
                            href='/learn/directory'
                            className='hover:text-zinc-300 transition-colors'
                        >
                            Directory
                        </Link>
                        <span className='text-zinc-800'>|</span>
                        <Link
                            href='/'
                            className='hover:text-zinc-300 transition-colors'
                        >
                            Home
                        </Link>
                    </nav>
                </div>
            </header>

            {/* Content */}
            <main className='max-w-4xl mx-auto px-4 py-10'>
                {children}
            </main>

            {/* Footer */}
            <footer className='border-t border-zinc-800 py-6'>
                <p className='text-center text-[10px] text-zinc-700'>
                    SUBCULT OPS &middot; multi-agent command center
                </p>
            </footer>
        </div>
    );
}
