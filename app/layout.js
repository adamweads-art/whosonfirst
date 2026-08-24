import './globals.css';

export const metadata = {
  title: 'Lineup',
  description: 'Batting order and field assignments',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#edebe3',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
