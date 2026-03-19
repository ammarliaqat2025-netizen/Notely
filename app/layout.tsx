import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Notely — Just Write',
  description: 'No-bullshit personal note taking.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;1,400&family=Playfair+Display:wght@700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  )
}
