import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'NutriPack — Intelligent Food Packaging Recommendation & Optimization',
  description:
    'From food properties to intelligent packaging decisions: requirement translation, AI recommendation engine, packaging simulation model, route intelligence, failure prediction and multi-criteria optimization.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
