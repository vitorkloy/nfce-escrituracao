import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from './theme-provider'

export const metadata: Metadata = {
  title: 'Escrituração Fiscal — SEFAZ-SP',
  description: 'Aplicativo de escrituração fiscal com integração aos serviços da SEFAZ (NF-e, NFC-e e demais módulos).',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
