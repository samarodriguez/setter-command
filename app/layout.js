import "./globals.css";

export const metadata = {
  title: "Setter Command",
  description: "Door-knocking field app: RepCard-style dispositions, end-of-day exports, texting CRM, live door training.",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Setter" },
};
export const viewport = { width: "device-width", initialScale: 1, maximumScale: 1, themeColor: "#0f172a" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
