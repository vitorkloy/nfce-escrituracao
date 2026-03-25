'use client'

import { useState } from 'react'
import type { CertInfo } from '../../../electron/electron.d'
import { useIsElectron } from '@/hooks/useIsElectron'
import { getErrorMessage } from '@/lib/error-utils'
import {
  formatCnpjForDisplay,
  formatDateOnlyPtBr,
} from '@/lib/nfce-format'
import type { CertificateSourceMode, CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { CertificateStorePicker } from '@/components/nfce/certificate-store-picker'
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

  function handleStoreCertSelected(cert: CertInfo) {
    setSelectedStoreCert(cert)
    onCertificateChange({
      ...certificateState,
      thumbprint: cert.thumbprint,
      pfxPath: '',
      origemStore: true,
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
        ambiente: certificateState.ambiente,
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
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Certificado Digital
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Use seu e-CNPJ para autenticar as consultas à SEFAZ-SP. A senha nunca é armazenada.
      </p>

      <div
        className="flex gap-1 p-1 rounded mb-6 no-drag"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
      >
        {CERT_SOURCE_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setSourceMode(mode)}
            className="flex-1 py-2 rounded text-sm font-medium transition-all"
            style={{
              background: sourceMode === mode ? 'var(--bg-surface)' : 'transparent',
              color: sourceMode === mode ? 'var(--text-primary)' : 'var(--text-muted)',
              border: sourceMode === mode ? '1px solid var(--border-hi)' : '1px solid transparent',
            }}
          >
            {mode === 'store' ? '🔑 Repositório do sistema' : '📁 Arquivo .pfx'}
          </button>
        ))}
      </div>

      {sourceMode === 'store' && (
        <div className="mb-5">
          {selectedStoreCert ? (
            <div
              className="p-4 rounded mb-3"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--teal-dim)' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                    {selectedStoreCert.nome}
                  </div>
                  {selectedStoreCert.cnpj && (
                    <div className="text-xs font-mono mb-1" style={{ color: 'var(--teal)' }}>
                      CNPJ {formatCnpjForDisplay(selectedStoreCert.cnpj)}
                    </div>
                  )}
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Válido até {formatDateOnlyPtBr(selectedStoreCert.validade)} ·{' '}
                    {selectedStoreCert.thumbprint.substring(0, 16)}…
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStoreCert(null)
                    onCertificateChange({ ...certificateState, thumbprint: undefined })
                  }}
                  className="text-xs no-drag px-2 py-1 rounded"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
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
            className="block text-xs font-medium mb-2 uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            Arquivo .pfx / .p12
          </label>
          <div className="flex gap-2">
            <div
              className="flex-1 flex items-center px-3 py-2.5 rounded text-sm truncate cursor-pointer"
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                color: certificateState.pfxPath ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={pickPfxFile}
            >
              {certificateState.pfxPath || 'Clique para selecionar…'}
            </div>
            <button
              type="button"
              onClick={pickPfxFile}
              className="px-4 py-2.5 rounded text-sm font-medium no-drag"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--teal)' }}
            >
              Procurar
            </button>
          </div>
        </div>
      )}

      {sourceMode === 'store' ? (
        <div
          className="mb-5 px-4 py-3 rounded flex items-center justify-between gap-3"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🔑</span>
            <div>
              <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                Repositório do sistema
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Senha não necessária — o certificado é acessado diretamente pelo Windows.
              </p>
            </div>
          </div>
          {certificateReady && (
            <button
              type="button"
              onClick={verifyCertificate}
              disabled={isVerifying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium no-drag shrink-0"
              style={{ background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)', color: 'var(--teal)' }}
            >
              {isVerifying ? <Spinner size={3} /> : 'Verificar'}
            </button>
          )}
        </div>
      ) : (
        <div className="mb-5">
          <label
            className="block text-xs font-medium mb-2 uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
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
                className="w-full px-3 py-2.5 pr-10 rounded text-sm no-drag"
                style={{
                  background: 'var(--bg-raised)',
                  border: `1px solid ${passwordCheckOk === false ? 'var(--red)' : 'var(--border)'}`,
                }}
                autoComplete="new-password"
                aria-label="Senha do certificado"
              />
              <button
                type="button"
                onClick={() => setPasswordVisible((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-xs no-drag"
                style={{ color: 'var(--text-muted)' }}
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
              className="flex items-center gap-1.5 px-4 py-2.5 rounded text-sm font-medium no-drag shrink-0"
              style={{
                background: isVerifying ? 'var(--bg-raised)' : 'var(--teal-glow)',
                border: '1px solid var(--teal-dim)',
                color: isVerifying ? 'var(--text-muted)' : 'var(--teal)',
              }}
            >
              {isVerifying ? <Spinner size={3} /> : 'Verificar'}
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              A senha é usada apenas em memória e não é salva.
            </p>
            {passwordCheckOk === true && (
              <span className="text-xs" style={{ color: 'var(--green)' }}>
                ✓ Senha correta
              </span>
            )}
            {passwordCheckOk === false && (
              <span className="text-xs" style={{ color: 'var(--red)' }}>
                ✕ Senha incorreta
              </span>
            )}
          </div>
        </div>
      )}

      <div className="mb-8">
        <label
          className="block text-xs font-medium mb-2 uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          Ambiente
        </label>
        <div className="flex gap-3">
          {(['homologacao', 'producao'] as const).map((ambiente) => (
            <button
              key={ambiente}
              type="button"
              onClick={() => onCertificateChange({ ...certificateState, ambiente })}
              className="flex-1 py-2.5 rounded text-sm font-medium transition-all no-drag"
              style={{
                background: certificateState.ambiente === ambiente ? 'var(--teal-glow)' : 'var(--bg-raised)',
                border: `1px solid ${certificateState.ambiente === ambiente ? 'var(--teal-dim)' : 'var(--border)'}`,
                color: certificateState.ambiente === ambiente ? 'var(--teal)' : 'var(--text-secondary)',
              }}
            >
              {ambiente === 'homologacao' ? '🔬 Homologação' : '🏭 Produção'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={saveConfiguration}
          disabled={!certificateReady}
          className="flex-1 py-2.5 rounded text-sm font-semibold transition-all no-drag"
          style={{
            background: certificateReady ? 'var(--teal)' : 'var(--bg-raised)',
            color: certificateReady ? '#000' : 'var(--text-muted)',
          }}
        >
          Salvar configuração
        </button>
      </div>
    </div>
  )
}
