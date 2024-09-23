// app/layout.tsx

import '@/app/globals.css';

export const metadata = {
  title: 'Voice Notes App',
  description: 'An app for taking voice notes',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
