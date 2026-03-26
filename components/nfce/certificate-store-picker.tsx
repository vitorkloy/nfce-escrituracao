'use client'

import { useEffect, useState } from 'react'
import type { CertInfo } from '../../electron/electron.d'
import { useIsElectron } from '@/hooks/useIsElectron'
import {
  formatCnpjForDisplay,
  formatDateOnlyPtBr,
} from '@/lib/nfce-format'
import { Badge } from '@/components/nfce/ui/badge'
import { Spinner } from '@/components/nfce/ui/spinner'

export interface CertificateStorePickerProps {
  onSelect: (cert: CertInfo) => void
}

export function CertificateStorePicker({ onSelect }: CertificateStorePickerProps) {
  const { isElectron, isMounted } = useIsElectron()
  const [certificates, setCertificates] = useState<CertInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [filterText, setFilterText] = useState('')

  useEffect(() => {
    if (!isMounted) return

    if (!isElectron) {
      setIsLoading(false)
      setErrorMessage('Use o modo "Arquivo .pfx" — repositório automático disponível apenas no app instalado.')
      return
    }

    setErrorMessage('')
    setIsLoading(true)

    let cancelled = false
    window.electron.cert
      .listarSistema()
      .then((result) => {
        if (cancelled) return
        setIsLoading(false)
        if (!result.ok || !result.certs) {
          setErrorMessage(result.erro ?? 'Erro ao listar certificados.')
          return
        }
        setCertificates(result.certs)
      })
      .catch((err) => {
        if (cancelled) return
        setIsLoading(false)
        setErrorMessage(err instanceof Error ? err.message : 'Falha ao buscar certificados.')
      })

    return () => {
      cancelled = true
    }
  }, [isElectron, isMounted])

  const visibleCertificates = filterText
    ? certificates.filter(
        (cert) =>
          cert.nome.toLowerCase().includes(filterText.toLowerCase()) ||
          cert.cnpj.includes(filterText) ||
          cert.thumbprint.toLowerCase().includes(filterText.toLowerCase())
      )
    : certificates

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 py-8 justify-center text-[var(--text-muted)]">
        <Spinner /> Lendo repositório de certificados…
      </div>
    )
  }

  if (errorMessage) {
    return (
      <div
        className="py-4 px-4 rounded text-sm bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--red)]"
      >
        <p className="font-medium mb-1">Não foi possível listar os certificados</p>
        <p className="text-[var(--text-secondary)]">{errorMessage}</p>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Use o modo "Arquivo .pfx" como alternativa.
        </p>
      </div>
    )
  }

  if (certificates.length === 0) {
    return (
      <div className="py-8 text-sm text-center text-[var(--text-muted)]">
        <p>Nenhum certificado com chave privada encontrado.</p>
        <p className="mt-1 text-xs">Verifique em: certmgr.msc → Pessoal → Certificados</p>
      </div>
    )
  }

  const expiredCount = certificates.filter((c) => c.expirado).length

  return (
    <div>
      <div className="mb-3">
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filtrar por nome, CNPJ ou thumbprint…"
          className="w-full px-3 py-2 rounded text-sm no-drag bg-[var(--bg-raised)] border border-[var(--border)]"
          aria-label="Filtrar certificados"
        />
      </div>

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {visibleCertificates.map((cert) => (
          <button
            key={cert.thumbprint}
            type="button"
            onClick={() => onSelect(cert)}
            disabled={cert.expirado}
            title={cert.expirado ? 'Certificado expirado — não pode ser usado' : undefined}
            className={[
              'w-full text-left px-4 py-3 rounded transition-all no-drag border',
              'bg-[var(--bg-raised)] border-[var(--border)]',
              cert.expirado ? 'opacity-45 cursor-not-allowed' : 'opacity-100 cursor-pointer hover:border-[var(--teal-dim)]',
            ].join(' ')}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate text-[var(--text-primary)]">
                    {cert.nome}
                  </span>
                  {cert.expirado && <Badge tone="red" label="Expirado" />}
                </div>
                {cert.cnpj && (
                  <div className="text-xs font-mono mb-1 text-[var(--teal)]">
                    CNPJ {formatCnpjForDisplay(cert.cnpj)}
                  </div>
                )}
                <div className="text-xs text-[var(--text-muted)]">
                  Válido até {formatDateOnlyPtBr(cert.validade)}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-mono text-[var(--text-muted)]">
                  {cert.thumbprint.substring(0, 8)}…
                </div>
                {!cert.expirado && (
                  <div
                    className={[
                      'mt-1.5 text-xs px-2 py-0.5 rounded bg-[var(--teal-glow)] text-[var(--teal)]',
                    ].join(' ')}
                  >
                    Selecionar →
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        {certificates.length} certificado(s) encontrado(s).{' '}
        {expiredCount > 0 && (
          <span className="text-[var(--red)]">
            {expiredCount} expirado(s) — não disponível para seleção.
          </span>
        )}
      </p>
    </div>
  )
}
