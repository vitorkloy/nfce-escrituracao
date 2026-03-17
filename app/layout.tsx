import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Escrituração NFC-e — SEFAZ-SP',
  description: 'Serviços de Apoio à Escrituração da NFC-e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
