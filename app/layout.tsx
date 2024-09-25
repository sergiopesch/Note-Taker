// app/layout.tsx

import '@/app/globals.css';

export const metadata = {
  title: 'Note Taker',
  description: 'An app to help you take notes of your ideas',
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
