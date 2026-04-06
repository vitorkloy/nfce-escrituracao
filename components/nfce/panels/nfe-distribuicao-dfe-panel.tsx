'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CertificateUiState, ToastVariant } from '@/types/nfce-app'
import { useIsElectron } from '@/hooks/useIsElectron'
import { BUTTON_PRIMARY_CLASS, INPUT_BASE_CLASS, SURFACE_CARD_CLASS } from '@/components/nfce/ui/classes'
import { Spinner } from '@/components/nfce/ui/spinner'
import { formatarUltNsu } from '@/lib/nfe-dist-dfe-xml'

type NfeDistribuicaoDfePanelProps = {
  certificateState: CertificateUiState
  showToast: (variant: ToastVariant, message: string) => void
}

type ModoPainel = 'xml-livre' | 'sincronizacao' | 'arquivos-salvos'

type FiltroPapelDistDfe = 'todos' | 'emitente' | 'destinatario'

type NfeBlockTimer = {
  certId: string
  cnpj14?: string
  blockedAtMs: number
  retryAtMs: number
  cStat: '656'
}

function formatarTempoRestante(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const s = String(totalSec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function formatarProgressoSync(p: {
  tipo: string
  cStat?: string
  ultNSU?: string
  maxNSU?: string
  loteSalvos?: number
  loteIgnorados?: number
  loteFiltrados?: number
  totalSalvos?: number
  totalIgnorados?: number
  totalFiltrados?: number
  mensagem?: string
}): string {
  const ts = new Date().toLocaleTimeString('pt-BR')
  if (p.tipo === 'lote') {
    const filtroLote = (p.loteFiltrados ?? 0) > 0 ? `, ${p.loteFiltrados} filtrados (não gravados)` : ''
    const filtroTot =
      (p.totalFiltrados ?? 0) > 0 ? `, ${p.totalFiltrados} filtrados no acumulado` : ''
    return `[${ts}] Lote cStat=${p.cStat ?? '—'} +${p.loteSalvos ?? 0} novos, ${p.loteIgnorados ?? 0} já existentes${filtroLote} | ultNSU=${p.ultNSU ?? '—'} | acumulado: ${p.totalSalvos ?? 0} salvos${filtroTot}`
  }
  if (p.tipo === 'concluido') {
    const filtroFim = (p.totalFiltrados ?? 0) > 0 ? `, ${p.totalFiltrados} filtrados (não gravados)` : ''
    return `[${ts}] Concluído — total ${p.totalSalvos ?? 0} novos, ${p.totalIgnorados ?? 0} ignorados${filtroFim}. ${p.mensagem ?? ''}`
  }
  const msgErro = `[${ts}] Erro: ${p.mensagem ?? '—'}`
  if (p.cStat === '656') {
    return `${msgErro} — Aguarde cerca de 1 h antes de nova tentativa; não use “reiniciar NSU” sem necessidade e use o ultNSU da última resposta.`
  }
  return msgErro
}

export function NfeDistribuicaoDfePanel({ certificateState, showToast }: NfeDistribuicaoDfePanelProps) {
  const { isElectron } = useIsElectron()
  const [modo, setModo] = useState<ModoPainel>('sincronizacao')
  const [xml, setXml] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [cUFAutor, setCUFAutor] = useState('35')
  const [resposta, setResposta] = useState<string | null>(null)
  const [resumoDist, setResumoDist] = useState<{
    cStat: string
    xMotivo: string
    ultNSU: string
    maxNSU: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [pastaRaiz, setPastaRaiz] = useState('')
  const [filtroPapel, setFiltroPapel] = useState<FiltroPapelDistDfe>('todos')
  const [reiniciarNsu, setReiniciarNsu] = useState(false)
  const [ultNsuPersistido, setUltNsuPersistido] = useState<string | null>(null)
  const [logSync, setLogSync] = useState<string[]>([])
  const [syncRodando, setSyncRodando] = useState(false)

  const [filtroAno, setFiltroAno] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [listaArquivos, setListaArquivos] = useState<Array<{ chave: string; caminho: string; ano: string; mes: string }>>([])
  const [previewXml, setPreviewXml] = useState<string | null>(null)
  const [previewTitulo, setPreviewTitulo] = useState('')
  const [nfeBlockTimer, setNfeBlockTimer] = useState<NfeBlockTimer | null>(null)
  const [agoraMs, setAgoraMs] = useState(() => Date.now())

  const certId = useMemo(() => {
    if (certificateState.thumbprint) return `thumb:${certificateState.thumbprint}`
    if (certificateState.pfxPath) return `pfx:${certificateState.pfxPath.toLowerCase()}`
    return ''
  }, [certificateState.thumbprint, certificateState.pfxPath])

  useEffect(() => {
    if (certificateState.certificadoCnpj?.length === 14) {
      setCnpj(certificateState.certificadoCnpj)
    }
  }, [certificateState.certificadoCnpj])

  useEffect(() => {
    if (!isElectron) return
    const off = window.electron.nfe.onSyncDistProgress((p) => {
      setLogSync((prev) => [...prev.slice(-120), formatarProgressoSync(p)])
    })
    return off
  }, [isElectron])

  useEffect(() => {
    if (!isElectron || !certId) {
      setNfeBlockTimer(null)
      return
    }
    let cancelled = false
    window.electron.app.getNfeBlockTimer(certId).then((timer) => {
      if (cancelled) return
      setNfeBlockTimer(timer)
    }).catch(() => {
      if (cancelled) return
      // Compatibilidade em dev quando o processo main ainda não reiniciou com novos IPCs.
      setNfeBlockTimer(null)
    })
    return () => {
      cancelled = true
    }
  }, [isElectron, certId])

  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const certOk =
    (certificateState.thumbprint || certificateState.pfxPath) &&
    (certificateState.origemStore || certificateState.senha)

  const bloqueioAtivo = Boolean(nfeBlockTimer && nfeBlockTimer.retryAtMs > agoraMs)

  async function registrarBloqueio656() {
    if (!isElectron || !certId) return
    const payload: NfeBlockTimer = {
      certId,
      cnpj14: certificateState.certificadoCnpj,
      blockedAtMs: Date.now(),
      retryAtMs: Date.now() + 60 * 60 * 1000,
      cStat: '656',
    }
    try {
      await window.electron.app.setNfeBlockTimer(payload)
    } catch {
      return
    }
    setNfeBlockTimer(payload)
  }

  async function limparBloqueioSeHouver() {
    if (!isElectron || !certId) return
    try {
      await window.electron.app.clearNfeBlockTimer(certId)
    } catch {
      return
    }
    setNfeBlockTimer(null)
  }

  async function enviarPayload(xmlPayload: string) {
    if (!isElectron) return
    if (!certOk) {
      showToast('erro', 'Configure o certificado na aba Certificado.')
      return
    }

    const texto = xmlPayload.trim()
    if (!texto) {
      showToast('erro', 'Nada para enviar.')
      return
    }

    setIsLoading(true)
    setResposta(null)
    setResumoDist(null)
    try {
      const resp = await window.electron.nfe.distribuicaoDfe(certificateState as never, texto)
      if (!resp.ok) {
        showToast('erro', resp.xMotivo ?? 'Falha na Distribuição DFe.')
        return
      }
      setResposta(resp.xmlResposta ?? '')
      const d = resp.resumoDistribuicao
      setResumoDist(d ?? null)
      if (d?.cStat === '656') {
        await registrarBloqueio656()
        showToast('erro', `SEFAZ: [656] ${d.xMotivo || 'Consumo indevido'} · aguarde cerca de 1h para nova tentativa.`)
        return
      }
      await limparBloqueioSeHouver()
      showToast(
        'ok',
        d
          ? `SEFAZ: [${d.cStat}] ${d.xMotivo || 'OK'} · ultNSU ${d.ultNSU} · maxNSU ${d.maxNSU}`
          : 'Resposta recebida da SEFAZ.',
      )
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro ao chamar Distribuição DFe.')
    } finally {
      setIsLoading(false)
    }
  }

  const escolherPasta = useCallback(async () => {
    if (!isElectron) return
    const p = await window.electron.fs.selecionarPasta()
    if (p) setPastaRaiz(p)
  }, [isElectron])

  const atualizarEstadoNsu = useCallback(async () => {
    if (!isElectron || !pastaRaiz.trim() || cnpj.replace(/\D/g, '').length !== 14) {
      setUltNsuPersistido(null)
      return
    }
    const r = await window.electron.nfe.distDfeEstado(pastaRaiz.trim(), cnpj)
    if (r.ok && r.ultNSU) setUltNsuPersistido(r.ultNSU)
    else setUltNsuPersistido(null)
  }, [isElectron, pastaRaiz, cnpj])

  useEffect(() => {
    if (modo === 'sincronizacao' || modo === 'arquivos-salvos') {
      void atualizarEstadoNsu()
    }
  }, [modo, atualizarEstadoNsu])

  async function executarSincronizacao() {
    if (!isElectron) return
    if (!certOk) {
      showToast('erro', 'Configure o certificado.')
      return
    }
    if (!pastaRaiz.trim()) {
      showToast('erro', 'Selecione a pasta raiz onde os XMLs serão gravados.')
      return
    }
    if (cnpj.replace(/\D/g, '').length !== 14) {
      showToast('erro', 'Informe o CNPJ com 14 dígitos.')
      return
    }
    const cnpjInformado = cnpj.replace(/\D/g, '')
    const cnpjCert = (certificateState.certificadoCnpj ?? '').replace(/\D/g, '')
    if (cnpjCert.length === 14 && cnpjInformado !== cnpjCert) {
      showToast(
        'erro',
        'O CNPJ informado difere do CNPJ do certificado selecionado. Use o mesmo CNPJ do certificado para sincronizar.'
      )
      return
    }
    if (!/^\d{2}$/.test(cUFAutor.replace(/\D/g, ''))) {
      showToast('erro', 'cUFAutor inválido.')
      return
    }

    setLogSync([])
    setSyncRodando(true)
    window.electron.app.setBusy(true)
    try {
      const r = await window.electron.nfe.syncDistDfe(certificateState as never, {
        pastaRaiz: pastaRaiz.trim(),
        cnpj14: cnpj.replace(/\D/g, ''),
        cUFAutor: cUFAutor.replace(/\D/g, ''),
        reiniciarNsu,
        filtroPapel,
      })
      if (r.ok) {
        await limparBloqueioSeHouver()
        const partFiltrados =
          r.totalFiltrados > 0 ? `, ${r.totalFiltrados} não gravados (filtro)` : ''
        showToast(
          'ok',
          `Sincronização concluída: ${r.totalSalvos} XML(s) novos, ${r.totalIgnorados} já existentes${partFiltrados} (${r.lotes} lote(s)).`,
        )
      } else {
        const base = r.xMotivo ?? 'Falha na sincronização.'
        if (base.includes('656')) await registrarBloqueio656()
        showToast(
          'erro',
          base.includes('656')
            ? `${base} Se apareceu consumo indevido, aguarde ~1 h e evite “reiniciar NSU” sem motivo.`
            : base
        )
      }
      await atualizarEstadoNsu()
    } catch (err) {
      showToast('erro', err instanceof Error ? err.message : 'Erro na sincronização.')
    } finally {
      window.electron.app.setBusy(false)
      setSyncRodando(false)
    }
  }

  async function carregarListaArquivos() {
    if (!isElectron || !pastaRaiz.trim() || cnpj.replace(/\D/g, '').length !== 14) {
      showToast('erro', 'Pasta raiz e CNPJ são obrigatórios.')
      return
    }
    const r = await window.electron.nfe.listarXmlsSalvos(pastaRaiz.trim(), cnpj.replace(/\D/g, ''), {
      ano: filtroAno.trim() || undefined,
      mes: filtroMes.trim() || undefined,
    })
    if (!r.ok) {
      showToast('erro', r.xMotivo ?? 'Falha ao listar arquivos.')
      return
    }
    setListaArquivos(r.arquivos ?? [])
    showToast('info', `${r.total ?? 0} arquivo(s) encontrado(s).`)
  }

  async function abrirPreview(caminho: string, chave: string) {
    if (!isElectron) return
    const r = await window.electron.fs.lerArquivoUtf8(caminho)
    if (!r.ok || r.conteudo === undefined) {
      showToast('erro', r.xMotivo ?? 'Não foi possível ler o arquivo.')
      return
    }
    setPreviewTitulo(chave)
    setPreviewXml(r.conteudo)
  }

  const btnModo = (id: ModoPainel, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setModo(id)}
      className={[
        'px-3 py-1.5 rounded text-xs font-medium no-drag border transition-colors',
        modo === id
          ? 'border-[var(--teal-dim)] bg-[var(--teal-glow)] text-[var(--teal)]'
          : 'border-[var(--border)] bg-[var(--bg-raised)] text-[var(--text-secondary)]',
      ].join(' ')}
    >
      {label}
    </button>
  )

  return (
    <div className="fade-in h-full overflow-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-1">NFeDistribuicaoDFe</h2>
      </div>

      <div className="flex flex-wrap gap-2">
        {btnModo('sincronizacao', 'Sincronização automática')}
        {btnModo('arquivos-salvos', 'Arquivos salvos')}
        {btnModo('xml-livre', 'XML livre')}
      </div>

      {certId && (
        <div className={`p-3 ${SURFACE_CARD_CLASS} ${bloqueioAtivo ? 'border border-amber-500/40' : ''}`}>
          {bloqueioAtivo ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-amber-700 dark:text-amber-300/90">
                cStat 656 registrado para este certificado. Tempo restante estimado:
                {' '}
                <strong>{formatarTempoRestante((nfeBlockTimer?.retryAtMs ?? 0) - agoraMs)}</strong>
              </span>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Timer de bloqueio (656): sem bloqueio ativo para o certificado atual.
            </p>
          )}
        </div>
      )}

      {modo === 'sincronizacao' && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-3`}>
          <p className="text-xs text-[var(--text-secondary)]">
            Esta opção busca automaticamente novas notas e eventos e salva os arquivos na pasta escolhida, organizados por
            CNPJ, ano e mês. O sistema continua de onde parou na última sincronização e não sobrescreve arquivos já salvos.
          </p>

          <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-[var(--text-secondary)] space-y-1.5 max-w-3xl">
            <p>
              <strong className="text-[var(--text-primary)]">Atenção:</strong> se tentar sincronizar muitas vezes em
              sequência, a consulta pode ser bloqueada temporariamente. Se isso acontecer, aguarde cerca de{' '}
              <strong>1 hora</strong> para tentar novamente.
            </p>
            <p>
              <strong className="text-[var(--text-primary)]">“Reiniciar do NSU zero”:</strong> use apenas quando for
              realmente necessário, pois pode aumentar a chance de bloqueio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void escolherPasta()} className={`px-3 py-2 text-sm no-drag ${BUTTON_PRIMARY_CLASS}`}>
              Escolher pasta raiz
            </button>
            <span className="text-xs text-[var(--text-muted)] truncate max-w-[min(100%,320px)]" title={pastaRaiz || undefined}>
              {pastaRaiz || 'Nenhuma pasta selecionada'}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">CNPJ</label>
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
              <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">cUFAutor</label>
              <input
                type="text"
                inputMode="numeric"
                value={cUFAutor}
                onChange={(e) => setCUFAutor(e.target.value.replace(/\D/g, '').slice(0, 2))}
                className={INPUT_BASE_CLASS}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">
              O que gravar na pasta
            </label>
            <select
              value={filtroPapel}
              onChange={(e) => setFiltroPapel(e.target.value as FiltroPapelDistDfe)}
              disabled={syncRodando}
              className={`${INPUT_BASE_CLASS} max-w-xl`}
            >
              <option value="todos">Todos os documentos retornados na fila</option>
              <option value="emitente">Apenas saída (CNPJ consultado como emitente da NF-e)</option>
              <option value="destinatario">Apenas entrada (CNPJ consultado como destinatário)</option>
            </select>
            <p className="text-[10px] text-[var(--text-muted)] mt-1 max-w-2xl">
              Eventos (ex.: manifestação) só entram se o CNPJ consultado for o autor do evento no XML. Resumos{' '}
              <code className="text-[10px]">resNFe</code> sem tag <code className="text-[10px]">dest</code> não servem
              para o filtro “entrada”.
            </p>
          </div>

          <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)] cursor-pointer no-drag">
            <input
              type="checkbox"
              checked={reiniciarNsu}
              onChange={(e) => setReiniciarNsu(e.target.checked)}
              className="rounded border-[var(--border)] mt-0.5"
            />
            <span>
              Reiniciar do NSU zero (ignora <code className="text-[10px]">.nfe-dist-state.json</code>). Só use se
              precisar reprocessar do início; caso contrário mantém risco de <strong>656</strong>.
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
            <span>Último NSU no disco: {ultNsuPersistido ?? '— (ainda não há estado ou pasta inválida)'}</span>
            <button type="button" onClick={() => void atualizarEstadoNsu()} className="text-[var(--teal)] underline no-drag">
              Atualizar leitura
            </button>
          </div>

          <button
            type="button"
            onClick={() => void executarSincronizacao()}
            disabled={syncRodando}
            className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
          >
            {syncRodando ? (
              <>
                <Spinner /> Sincronizando…
              </>
            ) : (
              'Sincronizar agora'
            )}
          </button>

          {logSync.length > 0 && (
            <div className="mt-2">
              <p className="text-[10px] uppercase text-[var(--text-muted)] mb-1">Log</p>
              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all max-h-56 overflow-auto p-2 rounded border border-[var(--border)] bg-[var(--bg-deep)] text-[var(--text-secondary)]">
                {logSync.join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

      {modo === 'arquivos-salvos' && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} space-y-3`}>
          <p className="text-xs text-[var(--text-secondary)]">
            Lista XMLs já salvos na estrutura <code className="text-[11px]">CNPJ/ano/mês/*.xml</code>. Filtre por ano e/ou mês (opcional).
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <button type="button" onClick={() => void escolherPasta()} className={`px-3 py-2 text-sm no-drag ${BUTTON_PRIMARY_CLASS}`}>
              Pasta raiz
            </button>
            <div>
              <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Ano</label>
              <input
                value={filtroAno}
                onChange={(e) => setFiltroAno(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={`${INPUT_BASE_CLASS} w-24`}
                placeholder="2025"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-[var(--text-muted)] mb-1">Mês</label>
              <input
                value={filtroMes}
                onChange={(e) => setFiltroMes(e.target.value.replace(/\D/g, '').slice(0, 2))}
                className={`${INPUT_BASE_CLASS} w-20`}
                placeholder="03"
              />
            </div>
            <button type="button" onClick={() => void carregarListaArquivos()} className={`px-3 py-2 text-sm no-drag ${BUTTON_PRIMARY_CLASS}`}>
              Listar
            </button>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{pastaRaiz || 'Selecione a pasta raiz'} · CNPJ {cnpj.replace(/\D/g, '').length === 14 ? cnpj : '—'}</p>

          <div className="max-h-64 overflow-auto border border-[var(--border)] rounded">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--bg-raised)] text-[var(--text-muted)]">
                <tr>
                  <th className="text-left p-2">Ano/Mês</th>
                  <th className="text-left p-2">Chave / arquivo</th>
                  <th className="p-2 w-24"> </th>
                </tr>
              </thead>
              <tbody>
                {listaArquivos.slice(0, 200).map((a) => (
                  <tr key={a.caminho} className="border-t border-[var(--border)]">
                    <td className="p-2 text-[var(--text-secondary)]">
                      {a.ano}/{a.mes}
                    </td>
                    <td className="p-2 font-mono text-[10px] break-all text-[var(--text-primary)]">{a.chave}</td>
                    <td className="p-2">
                      <button
                        type="button"
                        onClick={() => void abrirPreview(a.caminho, a.chave)}
                        className="text-[var(--teal)] underline no-drag"
                      >
                        Ver XML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {listaArquivos.length > 200 && (
              <p className="p-2 text-[10px] text-[var(--text-muted)]">Mostrando 200 de {listaArquivos.length}.</p>
            )}
          </div>

          {previewXml !== null && (
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <p className="text-xs text-[var(--text-muted)]">Prévia: {previewTitulo}</p>
                <button type="button" onClick={() => setPreviewXml(null)} className="text-xs text-[var(--teal)] no-drag">
                  Fechar
                </button>
              </div>
              <pre className="text-[10px] font-mono whitespace-pre-wrap break-all max-h-80 overflow-auto p-2 rounded border border-[var(--border)] bg-[var(--bg-deep)]">
                {previewXml}
              </pre>
            </div>
          )}
        </div>
      )}

      {modo === 'xml-livre' && (
        <>
          <p className="text-xs text-[var(--text-secondary)]">
            Cole o XML de <code className="text-[11px]">nfeDadosMsg</code> (ex. <code className="text-[11px]">distDFeInt</code>).
          </p>
          <textarea
            value={xml}
            onChange={(e) => setXml(e.target.value)}
            className={`${INPUT_BASE_CLASS} min-h-[180px] font-mono text-xs w-full resize-y`}
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void enviarPayload(xml)}
            disabled={isLoading}
            className={`flex items-center gap-2 px-4 py-2 no-drag ${BUTTON_PRIMARY_CLASS}`}
          >
            {isLoading ? (
              <>
                <Spinner /> Enviando…
              </>
            ) : (
              'Enviar'
            )}
          </button>
        </>
      )}

      {resumoDist !== null && modo === 'xml-livre' && (
        <div className={`p-3 ${SURFACE_CARD_CLASS} border-l-2 border-[var(--teal-dim)]`}>
          <p className="text-[10px] uppercase text-[var(--text-muted)] mb-1">retDistDFeInt (resumo)</p>
          <p className="text-sm text-[var(--text-primary)]">
            <strong>cStat {resumoDist.cStat}</strong>
            {' · '}
            <span className="font-mono text-[11px]">ultNSU {resumoDist.ultNSU}</span>
            {' · '}
            <span className="font-mono text-[11px]">maxNSU {resumoDist.maxNSU}</span>
          </p>
          <p className="text-xs text-[var(--text-secondary)] mt-1">{resumoDist.xMotivo || '—'}</p>
        </div>
      )}

      {resposta !== null && modo === 'xml-livre' && (
        <div className={`p-4 ${SURFACE_CARD_CLASS} flex-1 min-h-0 flex flex-col`}>
          <p className="text-xs text-[var(--text-muted)] mb-2">Resposta (XML bruto SOAP)</p>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all overflow-auto max-h-[420px] text-[var(--text-primary)]">
            {resposta || '—'}
          </pre>
        </div>
      )}
    </div>
  )
}
