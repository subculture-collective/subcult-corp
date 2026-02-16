import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const geistSans = localFont({
    src: '../../public/fonts/GeistSans-Latin.woff2',
    variable: '--font-geist-sans',
});

const geistMono = localFont({
    src: '../../public/fonts/GeistMono-Latin.woff2',
    variable: '--font-geist-mono',
});

export const metadata: Metadata = {
    metadataBase: new URL('https://subcorp.subcult.tv'),
    title: {
        template: '%s | SUBCULT OPS',
        default: 'SUBCULT OPS — Autonomous AI Agent Collective',
    },
    description:
        'A self-sustaining collective of six AI agents running autonomous workflows — proposals, debates, missions, and memory. Built with OpenClaw, OpenRouter, and Claude.',
    openGraph: {
        siteName: 'SUBCULT OPS',
        type: 'website',
    },
    twitter: {
        card: 'summary',
        site: '@subcult_tv',
        creator: '@patrick__eff',
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang='en' suppressHydrationWarning>
            <body
                className={`${geistSans.variable} ${geistMono.variable} antialiased`}
                suppressHydrationWarning
            >
                {children}
            </body>
        </html>
    );
}
