import "./globals.css";

export const metadata = {
  title: "Setter Command",
  description: "Door-knocking field app: log knocks, book next-day appointments, train live, export to RepCard.",
};
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
