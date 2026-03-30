'use client'

import {
  fileNameFromPath,
  formatCnpjForDisplay,
  storeCertificateSidebarFallback,
} from '@/lib/nfce-format'
import type { CertificateUiState } from '@/types/nfce-app'

type SidebarCertificatePreviewProps = {
  certificateState: CertificateUiState
}

export function SidebarCertificatePreview({ certificateState }: SidebarCertificatePreviewProps) {
  const hasStoreCert = certificateState.origemStore && Boolean(certificateState.thumbprint)
  const hasPfxFile = !certificateState.origemStore && Boolean(certificateState.pfxPath)

  if (!hasStoreCert && !hasPfxFile) {
    return (
      <p className="text-xs text-[var(--text-muted)]">Nenhum</p>
    )
  }

  const fallbackStore = storeCertificateSidebarFallback(certificateState.thumbprint)
  const nomeExibicao = certificateState.certificadoNome
    ? certificateState.certificadoNome
    : hasPfxFile
      ? fileNameFromPath(certificateState.pfxPath)
      : fallbackStore.primary
  const tituloLinha = certificateState.certificadoNome
    ? certificateState.certificadoNome
    : hasPfxFile
      ? certificateState.pfxPath
      : fallbackStore.title
  const cnpjDigits = certificateState.certificadoCnpj

  return (
    <div className="min-w-0">
      <p
        className="text-xs font-medium truncate leading-snug text-[var(--text-primary)]"
        title={tituloLinha}
      >
        {nomeExibicao}
      </p>
      {cnpjDigits && cnpjDigits.length === 14 && (
        <p className="text-xs font-mono mt-1 leading-tight break-all text-[var(--text-secondary)]">
          {formatCnpjForDisplay(cnpjDigits)}
        </p>
      )}
    </div>
  )
}
