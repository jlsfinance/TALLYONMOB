import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BizSync Agent Admin',
  description: 'Multi-tenant AI file assistant admin dashboard'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
