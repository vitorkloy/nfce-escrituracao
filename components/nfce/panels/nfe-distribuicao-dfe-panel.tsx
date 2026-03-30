'use client'

import { useEffect, useState } from 'react'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'
import { formatarUltNsu, montarDistDfeIntListagemNsu } from '@/lib/nfe-dist-dfe-xml'

type NfeDistribuicaoDfePanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

const ENDPOINT_INFO =
  'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx — produção (AN). Método: nfeDistDFeInteresse.'

type ModoPainel = 'listagem-nsu' | 'xml-livre'

export function NfeDistribuicaoDfePanel({ certificateState, showToast }: NfeDistribuicaoDfePanelProps) {
  const { isElectron } = useIsElectron()
  const [modo, setModo] = useState<ModoPainel>('listagem-nsu')
  const [xml, setXml] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [cUFAutor, setCUFAutor] = useState('35')
  const [ultNSU, setUltNSU] = useState('0')
  const [resposta, setResposta] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (certificateState.certificadoCnpj?.length === 14) {
      setCnpj(certificateState.certificadoCnpj)
    }
  }, [certificateState.certificadoCnpj])

  async function enviarPayload(xmlPayload: string) {
    if (!isElectron) return
    if (!certificateState.thumbprint && !certificateState.pfxPath) {
      showToast('erro', 'Selecione um certificado na aba Certificado.')
      return
    }
    if (!certificateState.origemStore && !certificateState.senha) {
      showToast('erro', 'Informe a senha do certificado.')
      return
    }

    const texto = xmlPayload.trim()
    if (!texto) {
      showToast('erro', 'Nada para enviar.')
      return
    }

    setIsLoading(true)
    setResposta(null)
    try {
      const resp = await window.electron.nfe.distribuicaoDfe(certificateState as never, texto)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha na Distribuição DFe.')
        return
      }
      setResposta(resp.xmlResposta ?? '')
      showToast('ok', 'Resposta recebida da SEFAZ.')
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao chamar Distribuição DFe.')
    } finally {
      setIsLoading(false)
    }
  }

  function enviarListagem() {
    try {
      const montado = montarDistDfeIntListagemNsu({
        cnpj14: cnpj,
        cUFAutor,
        ultNSU,
      })
      void enviarPayload(montado)
    } catch (e) {
      showToast('erro', e instanceof Error ? e.message : 'Dados inválidos.')
    }
  }

  function enviarXmlLivre() {
    void enviarPayload(xml)
  }

  const ultNsuFormatado = formatarUltNsu(ultNSU)

  return (
    <div className="fade-in h-full overflow-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">NFeDistribuicaoDFe</h2>
        <p className="text-xs text-[var(--text-muted)]">{ENDPOINT_INFO}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setModo('listagem-nsu')}
          className={[
            'px-3 py-1.5 rounded text-xs font-medium no-drag border transition-colors',
            modo === 'listagem-nsu'
              ? 'border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)]'
              : 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]',
          ].join(' ')}
        >
          Modo 1 — Listagem (distNSU)
        </button>
        <button
          type="button"
          onClick={() => setModo('xml-livre')}
          className={[
            'px-3 py-1.5 rounded text-xs font-medium no-drag border transition-colors',
            modo === 'xml-livre'
              ? 'border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)]'
              : 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]',
          ].join(' ')}
        >
          XML livre (nfeDadosMsg)
        </button>
      </div>

      {modo === 'listagem-nsu' && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-3`}>
          <p className="text-xs text-[var(--text-secondary)]">
            Consulta por <strong>NSU</strong>: cada retorno pode trazer até <strong>50 XMLs</strong>. Na{' '}
            <strong>primeira consulta</strong>, use <code className="text-[11px]">ultNSU = 0</code>{' '}
            (<code className="text-[11px]">000000000000000</code>). Nas seguintes, informe o último NSU recebido.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Estrutura enviada: <code className="text-[11px]">distDFeInt</code> com{' '}
            <code className="text-[11px]">&lt;distNSU&gt;&lt;ultNSU&gt;…&lt;/ultNSU&gt;&lt;/distNSU&gt;</code>.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                CNPJ (14 dígitos)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={cnpj}
                onChange={(e) => setCnpj(e.target.value.replace(/\D/g, '').slice(0, 14))}
                className={INPUT_BASE_CLASS}
                placeholder="00000000000000"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                cUFAutor (IBGE, 2 dígitos)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={cUFAutor}
                onChange={(e) => setCUFAutor(e.target.value.replace(/\D/g, '').slice(0, 2))}
                className={INPUT_BASE_CLASS}
                placeholder="35"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
                ultNSU (até 15 dígitos — exibido normalizado: {ultNsuFormatado})
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={ultNSU}
                onChange={(e) => setUltNSU(e.target.value.replace(/\D/g, '').slice(0, 15))}
                className={INPUT_BASE_CLASS}
                placeholder="0"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void enviarListagem()}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
          >
            {isLoading ? (
              <>
                <Spinner /> Enviando…
              </>
            ) : (
              'Montar distDFeInt e enviar (nfeDistDFeInteresse)'
            )}
          </button>
        </div>
      )}

      {modo === 'xml-livre' && (
        <>
          <p className="text-xs text-[var(--text-secondary)]">
            Cole apenas o XML que vai dentro de <code className="text-[11px]">nfeDadosMsg</code> (ex.{' '}
            <code className="text-[11px]">distDFeInt</code>), sem o envelope SOAP.
          </p>
          <textarea
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            className={`${INPUT_BASE_CLASS} min-h-[180px] font-mono text-xs w-full resize-y`}
            placeholder="<distDFeInt xmlns=&quot;http://www.portalfiscal.inf.br/nfe&quot; versao=&quot;1.01&quot;>...</distDFeInt>"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void enviarXmlLivre()}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
          >
            {isLoading ? (
              <>
                <Spinner /> Enviando…
              </>
            ) : (
              'Enviar nfeDistDFeInteresse'
            )}
          </button>
        </>
      )}

      {resposta !== null && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} flex-1 min-h-0 flex flex-col`}>
          <p className="text-xs text-[var(--text-muted)] mb-2">Resposta (XML)</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[420px] text-[var(--text-primary)]">
            {resposta || '—'}
          </pre>
        </div>
      )}
    </div>
  )
}
