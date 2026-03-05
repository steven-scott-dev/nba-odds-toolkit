export const metadata = {
  title: "NBA Odds Toolkit",
  description: "Line shopping dashboard"
}

export default function RootLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: 0, padding: 16 }}>
        {children}
      </body>
    </html>
  )
}
