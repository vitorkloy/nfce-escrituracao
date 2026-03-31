'use client'

import { useEffect, useState } from 'react'
import type { CertInfo } from '../../../electron/electron.d'
import { useIsElectron } from '@/hooks/useIsElectron'
import { getErrorMessage } from '@/lib/error-utils'
import {
  fileNameFromPath,
  formatCnpjForDisplay,
  formatDateOnlyPtBr,
} from '@/lib/nfce-format'
import type { CertificateSourceMode, CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { CertificateStorePicker } from '@/components/nfce/certificate-store-picker'
import { BUTTON_PRIMARY_CLASS, BUTTON_SUBTLE_CLASS, BUTTON_TEAL_GHOST_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'

const CERT_SOURCE_MODES: CertificateSourceMode[] = ['store', 'arquivo']

export interface ConfigPanelProps {
  certificateState: CertificateUiState
  onCertificateChange: (next: CertificateUiState) => void
  showToast: (variant: ToastVariant, message: string) => void
}

export function ConfigPanel({ certificateState, onCertificateChange, showToast }: ConfigPanelProps) {
  const { isElectron } = useIsElectron()
  const [sourceMode, setSourceMode] = useState<CertificateSourceMode>('store')
  const [selectedStoreCert, setSelectedStoreCert] = useState<CertInfo | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [passwordCheckOk, setPasswordCheckOk] = useState<boolean | null>(null)

  useEffect(() => {
    if (!isElectron) return
    if (!certificateState.origemStore || !certificateState.thumbprint) {
      setSelectedStoreCert(null)
      return
    }
    if (selectedStoreCert?.thumbprint === certificateState.thumbprint) return

    let cancelled = false
    window.electron.cert.listarSistema().then((result) => {
      if (cancelled || !result.ok || !result.certs) return
      const match = result.certs.find((c) => c.thumbprint === certificateState.thumbprint)
      if (match) setSelectedStoreCert(match)
    })
    return () => {
      cancelled = true
    }
  }, [isElectron, certificateState.origemStore, certificateState.thumbprint, selectedStoreCert?.thumbprint])

  function handleStoreCertSelected(cert: CertInfo) {
    setSelectedStoreCert(cert)
    const cnpjDigits = cert.cnpj.replace(/\D/g, '')
    onCertificateChange({
      ...certificateState,
      thumbprint: cert.thumbprint,
      pfxPath: '',
      origemStore: true,
      certificadoNome: cert.nome,
      certificadoCnpj: cnpjDigits.length === 14 ? cnpjDigits : undefined,
    })
    setPasswordCheckOk(null)
  }

  async function pickPfxFile() {
    if (!isElectron) return
    try {
      const path = await window.electron.cert.selecionarArquivo()
      if (path) {
        onCertificateChange({
          ...certificateState,
          pfxPath: path,
          thumbprint: undefined,
          origemStore: false,
          certificadoNome: fileNameFromPath(path),
          certificadoCnpj: undefined,
        })
        setPasswordCheckOk(null)
      }
    } catch (err) {
      showToast('erro', `Erro ao selecionar arquivo: ${getErrorMessage(err)}`)
    }
  }

  async function saveConfiguration() {
    if (!isElectron) return
    try {
      const saved = await window.electron.cert.salvarConfig({
        pfxPath: certificateState.pfxPath,
        thumbprint: certificateState.thumbprint,
        origemStore: certificateState.origemStore,
        ambiente: 'producao',
      })
      showToast(saved ? 'ok' : 'erro', saved ? 'Configuração salva.' : 'Falha ao salvar configuração.')
    } catch (err) {
      showToast('erro', `Erro ao salvar: ${getErrorMessage(err)}`)
    }
  }

  async function verifyCertificate() {
    if (!isElectron) {
      showToast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.')
      return
    }

    if (sourceMode === 'store') {
      if (!certificateState.thumbprint) {
        showToast('erro', 'Selecione um certificado da lista.')
        return
      }
      setIsVerifying(true)
      setPasswordCheckOk(null)
      try {
        const result = await window.electron.cert.testarStore(
          certificateState.thumbprint,
          certificateState.senha || ''
        )
        setPasswordCheckOk(result.ok)
        showToast(result.ok ? 'ok' : 'erro', result.mensagem)
      } catch (err) {
        setPasswordCheckOk(false)
        showToast('erro', `Erro ao testar: ${getErrorMessage(err)}`)
      } finally {
        setIsVerifying(false)
      }
    } else {
      if (!certificateState.senha) {
        showToast('erro', 'Informe a senha do certificado.')
        return
      }
      if (!certificateState.pfxPath) {
        showToast('erro', 'Selecione o arquivo .pfx.')
        return
      }
      setIsVerifying(true)
      setPasswordCheckOk(null)
      try {
        const result = await window.electron.cert.testar(certificateState.pfxPath, certificateState.senha)
        setPasswordCheckOk(result.ok)
        showToast(result.ok ? 'ok' : 'erro', result.mensagem)
      } catch (err) {
        setPasswordCheckOk(false)
        showToast('erro', `Erro ao testar: ${getErrorMessage(err)}`)
      } finally {
        setIsVerifying(false)
      }
    }
  }

  const certificateReady =
    sourceMode === 'store' ? Boolean(selectedStoreCert) : Boolean(certificateState.pfxPath)

  return (
    <div className="fade-in p-8 max-w-xl">
      <h2 className="text-xl font-semibold mb-1 text-[var(--text-primary)]">
        Certificado Digital
      </h2>
      <p className="text-sm mb-6 text-[var(--text-secondary)]">
        Use seu e-CNPJ para autenticar as consultas à SEFAZ-SP. A senha nunca é armazenada.
      </p>

      <div
        className={`flex gap-1 p-1 mb-6 ${INPUT_BASE_CLASS}`}
      >
        {CERT_SOURCE_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSourceMode(mode)}
            className={[
              'flex-1 py-2 rounded text-sm font-medium transition-all border',
              sourceMode === mode
                ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-hi)]'
                : 'bg-transparent text-[var(--text-muted)] border-transparent',
            ].join(' ')}
          >
            {mode === 'store' ? '🔑 Repositório do sistema' : '📁 Arquivo .pfx'}
          </button>
        ))}
      </div>

      {sourceMode === 'store' && (
        <div className="mb-5">
          {selectedStoreCert ? (
            <div
              className={`p-4 mb-3 ${SURFACE_CARD_CLASS} border-[var(--teal-dim)]`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm mb-1 text-[var(--text-primary)]">
                    {selectedStoreCert.nome}
                  </div>
                  {selectedStoreCert.cnpj && (
                    <div className="text-xs font-mono mb-1 text-[var(--teal)]">
                      CNPJ {formatCnpjForDisplay(selectedStoreCert.cnpj)}
                    </div>
                  )}
                  <div className="text-xs text-[var(--text-muted)]">
                    Válido até {formatDateOnlyPtBr(selectedStoreCert.validade)} ·{' '}
                    {selectedStoreCert.thumbprint.substring(0, 16)}…
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStoreCert(null)
                    onCertificateChange({
                      ...certificateState,
                      thumbprint: undefined,
                      certificadoNome: undefined,
                      certificadoCnpj: undefined,
                    })
                  }}
                  className={`text-xs px-2 py-1 ${BUTTON_SUBTLE_CLASS} text-[var(--text-muted)]`}
                >
                  Trocar
                </button>
              </div>
            </div>
          ) : (
            <CertificateStorePicker onSelect={handleStoreCertSelected} />
          )}
        </div>
      )}

      {sourceMode === 'arquivo' && (
        <div className="mb-5">
          <label
            className="block text-xs font-medium mb-2 uppercase tracking-widest text-[var(--text-muted)]"
          >
            Arquivo .pfx / .p12
          </label>
          <div className="flex gap-2">
            <div
              className={[
                `flex-1 flex items-center px-3 py-2.5 text-sm truncate cursor-pointer ${INPUT_BASE_CLASS}`,
                certificateState.pfxPath ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]',
              ].join(' ')}
              onClick={pickPfxFile}
            >
              {certificateState.pfxPath || 'Clique para selecionar…'}
            </div>
            <button
              type="button"
              onClick={pickPfxFile}
              className={`px-4 py-2.5 text-sm font-medium ${BUTTON_SUBTLE_CLASS} text-[var(--teal)]`}
            >
              Procurar
            </button>
          </div>
        </div>
      )}

      {sourceMode === 'store' ? (
        <div
          className={`mb-5 px-4 py-3 flex items-center justify-between gap-3 ${SURFACE_CARD_CLASS}`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🔑</span>
            <div>
              <p className="font-medium text-sm text-[var(--text-primary)]">
                Repositório do sistema
              </p>
              <p className="text-xs mt-0.5 text-[var(--text-muted)]">
                Senha não necessária — o certificado é acessado diretamente pelo Windows.
              </p>
            </div>
          </div>
          {certificateReady && (
            <button
              type="button"
              onClick={verifyCertificate}
              disabled={isVerifying}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium shrink-0 ${BUTTON_TEAL_GHOST_CLASS}`}
            >
              {isVerifying ? <Spinner size={3} /> : 'Verificar'}
            </button>
          )}
        </div>
      ) : (
        <div className="mb-5">
          <label
            className="block text-xs font-medium mb-2 uppercase tracking-widest text-[var(--text-muted)]"
          >
            Senha do Certificado
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={passwordVisible ? 'text' : 'password'}
                value={certificateState.senha}
                onChange={(e) => {
                  onCertificateChange({ ...certificateState, senha: e.target.value })
                  setPasswordCheckOk(null)
                }}
                placeholder="••••••••"
                className={[
                  `w-full px-3 py-2.5 pr-10 text-sm ${INPUT_BASE_CLASS}`,
                  passwordCheckOk === false ? 'border-[var(--red)]' : 'border-[var(--border)]',
                ].join(' ')}
                autoComplete="new-password"
                aria-label="Senha do certificado"
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-xs no-drag text-[var(--text-muted)]"
                title={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
                aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {passwordVisible ? '🙈' : '👁'}
              </button>
            </div>
            <button
              type="button"
              onClick={verifyCertificate}
              disabled={isVerifying || !certificateState.senha || !certificateReady}
              className={[
                `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium shrink-0 border border-[var(--teal-dim)]`,
                isVerifying
                  ? 'bg-[var(--bg-raised)] text-[var(--text-muted)]'
                  : 'bg-[var(--teal-glow)] text-[var(--teal)]',
              ].join(' ')}
            >
              {isVerifying ? <Spinner size={3} /> : 'Verificar'}
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-xs text-[var(--text-muted)]">
              A senha é usada apenas em memória e não é salva.
            </p>
            {passwordCheckOk === true && (
              <span className="text-xs text-[var(--green)]">
                ✓ Senha correta
              </span>
            )}
            {passwordCheckOk === false && (
              <span className="text-xs text-[var(--red)]">
                ✕ Senha incorreta
              </span>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={saveConfiguration}
          disabled={!certificateReady}
          className={[
            `flex-1 py-2.5 text-sm font-semibold transition-all ${BUTTON_PRIMARY_CLASS}`,
            certificateReady
              ? ''
              : 'bg-[var(--bg-raised)] text-[var(--text-muted)]',
          ].join(' ')}
        >
          Salvar configuração
        </button>
      </div>
    </div>
  )
}
