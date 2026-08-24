import './globals.css';

export const metadata = {
  title: "Who's on First",
  description: 'Batting order and field assignments',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#003831',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
