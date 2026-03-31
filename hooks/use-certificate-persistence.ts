'use client'

import { useEffect, useState } from 'react'
import { fileNameFromPath } from '@/lib/nfce-format'
import type { CertificateUiState } from '@/types/nfce-app'

const initialCertificateState: CertificateUiState = {
  pfxPath: '',
  thumbprint: undefined,
  origemStore: true,
  senha: '',
  ambiente: 'producao',
}

/**
 * Carrega configuração de certificado persistida e reconcilia nome/CNPJ com a loja do Windows quando possível.
 */
export function useCertificatePersistence(isElectron: boolean) {
  const [certificateState, setCertificateState] = useState<CertificateUiState>(initialCertificateState)

  useEffect(() => {
    if (!isElectron) return
    window.electron.cert
      .carregarConfig()
      .then(async (saved) => {
        if (!saved) return

        let certificadoNome: string | undefined
        let certificadoCnpj: string | undefined

        if (saved.origemStore && saved.thumbprint) {
          try {
            const listed = await window.electron.cert.listarSistema()
            if (listed.ok && listed.certs) {
              const match = listed.certs.find((c) => c.thumbprint === saved.thumbprint)
              if (match) {
                certificadoNome = match.nome
                const digits = match.cnpj.replace(/\D/g, '')
                certificadoCnpj = digits.length === 14 ? digits : undefined
              }
            }
          } catch {
            /* mantém sidebar com fallback por thumbprint */
          }
        } else if (!saved.origemStore && saved.pfxPath) {
          certificadoNome = fileNameFromPath(saved.pfxPath)
        }

        setCertificateState((prev) => ({
          ...prev,
          pfxPath: saved.pfxPath ?? '',
          thumbprint: saved.thumbprint,
          origemStore: saved.origemStore ?? false,
          ambiente: 'producao',
          certificadoNome,
          certificadoCnpj,
        }))
      })
      .catch((err) => console.warn('[App] Falha ao carregar config:', err))
  }, [isElectron])

  useEffect(() => {
    if (!isElectron) return
    if (!certificateState.origemStore || !certificateState.thumbprint || certificateState.certificadoNome) return

    let cancelled = false
    window.electron.cert.listarSistema().then((result) => {
      if (cancelled || !result.ok || !result.certs) return
      const match = result.certs.find((c) => c.thumbprint === certificateState.thumbprint)
      if (!match) return
      const digits = match.cnpj.replace(/\D/g, '')
      setCertificateState((prev) => ({
        ...prev,
        certificadoNome: match.nome,
        certificadoCnpj: digits.length === 14 ? digits : prev.certificadoCnpj,
      }))
    })
    return () => {
      cancelled = true
    }
  }, [isElectron, certificateState.origemStore, certificateState.thumbprint, certificateState.certificadoNome])

  return { certificateState, setCertificateState }
}
