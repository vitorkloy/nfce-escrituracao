'use client'

import { useState, useEffect, useRef } from 'react'
import type { CertInfo } from '../electron/electron.d'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type Aba      = 'config' | 'listagem' | 'download'
type Ambiente = 'homologacao' | 'producao'
type ModosCert = 'store' | 'arquivo'

interface Config {
  pfxPath: string
  thumbprint?: string
  origemStore: boolean
  senha: string
  ambiente: Ambiente
}

interface ChaveItem { chave: string; selecionada: boolean }
interface ToastInfo  { id: number; tipo: 'ok' | 'erro' | 'info'; msg: string }

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
function formatarChave(chave: string) {
  return chave.replace(
    /^(\d{4})(\d{2})(\d{8})(\d{6})(\d{9})(\d{9})(\d{6})$/,
    '$1 $2 $3 $4 $5 $6 $7'
  )
}

function formatarCNPJ(cnpj: string) {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

function formatarData(iso: string) {
  if (!iso) return '–'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return iso }
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <span
      className={`inline-block border-2 border-current border-t-transparent rounded-full animate-spin`}
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    />
  )
}

function Badge({ cor, texto }: { cor: 'green' | 'amber' | 'red' | 'teal' | 'gray'; texto: string }) {
  const cores: Record<string, string> = {
    green: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/60',
    amber: 'bg-amber-900/40 text-amber-400 border-amber-800/60',
    red:   'bg-red-900/40   text-red-400   border-red-800/60',
    teal:  'bg-teal-900/40  text-teal-400  border-teal-800/60',
    gray:  'bg-zinc-800/60  text-zinc-400  border-zinc-700/60',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${cores[cor]}`}>
      {texto}
    </span>
  )
}

function Toast({ toasts, remover }: { toasts: ToastInfo[]; remover: (id: number) => void }) {
  const cores = { ok: 'border-l-[var(--green)] bg-[#0d1f16]', erro: 'border-l-[var(--red)] bg-[#1f0d11]', info: 'border-l-[var(--teal)] bg-[#0d1a1f]' }
  const icons = { ok: '✓', erro: '✕', info: '◈' }
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 no-drag">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 px-4 py-3 rounded shadow-xl min-w-72 max-w-sm fade-in cursor-pointer ${cores[t.tipo]}`}
          style={{ border: '1px solid var(--border)', borderLeftWidth: '4px' }}
          onClick={() => remover(t.id)}
        >
          <span className="mt-0.5 text-sm" style={{ color: t.tipo === 'ok' ? 'var(--green)' : t.tipo === 'erro' ? 'var(--red)' : 'var(--teal)' }}>
            {icons[t.tipo]}
          </span>
          <span className="text-sm" style={{ color: 'var(--text-primary)' }}>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seletor de certificados do sistema
// ---------------------------------------------------------------------------

function CertStorePicker({
  onSelecionar,
}: {
  onSelecionar: (cert: CertInfo) => void
}) {
  const [certs, setCerts]       = useState<CertInfo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro]         = useState('')
  const [filtro, setFiltro]     = useState('')

  const isElectron = typeof window !== 'undefined' && !!window.electron

  useEffect(() => {
    if (!isElectron) { setCarregando(false); return }
    window.electron.cert.listarSistema().then(r => {
      setCarregando(false)
      if (!r.ok || !r.certs) { setErro(r.erro ?? 'Erro ao listar certificados.'); return }
      setCerts(r.certs)
    })
  }, [isElectron])

  const visiveis = filtro
    ? certs.filter(c =>
        c.nome.toLowerCase().includes(filtro.toLowerCase()) ||
        c.cnpj.includes(filtro) ||
        c.thumbprint.toLowerCase().includes(filtro.toLowerCase())
      )
    : certs

  if (carregando) {
    return (
      <div className="flex items-center gap-3 py-8 justify-center" style={{ color: 'var(--text-muted)' }}>
        <Spinner /> Lendo repositório de certificados…
      </div>
    )
  }

  if (erro) {
    return (
      <div className="py-6 text-sm rounded px-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--red)' }}>
        {erro}
      </div>
    )
  }

  if (certs.length === 0) {
    return (
      <div className="py-8 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
        Nenhum certificado com chave privada encontrado no repositório pessoal.
      </div>
    )
  }

  return (
    <div>
      {/* Busca */}
      <div className="mb-3">
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Filtrar por nome, CNPJ ou thumbprint…"
          className="w-full px-3 py-2 rounded text-sm no-drag"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
        />
      </div>

      {/* Lista de certificados */}
      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {visiveis.map(cert => (
          <button
            key={cert.thumbprint}
            onClick={() => onSelecionar(cert)}
            className="w-full text-left px-4 py-3 rounded transition-all no-drag"
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              opacity: cert.expirado ? 0.5 : 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--teal-dim)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <div className="flex items-start justify-between gap-3">
              {/* Info principal */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                    {cert.nome}
                  </span>
                  {cert.expirado && <Badge cor="red" texto="Expirado" />}
                </div>
                {cert.cnpj && (
                  <div className="text-xs font-mono mb-1" style={{ color: 'var(--teal)' }}>
                    CNPJ {formatarCNPJ(cert.cnpj)}
                  </div>
                )}
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Válido até {formatarData(cert.validade)}
                </div>
              </div>

              {/* Thumbprint curto */}
              <div className="text-right shrink-0">
                <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  {cert.thumbprint.substring(0, 8)}…
                </div>
                <div className="mt-1.5 text-xs px-2 py-0.5 rounded" style={{ background: 'var(--teal-glow)', color: 'var(--teal)' }}>
                  Selecionar →
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {certs.length} certificado(s) encontrado(s) no repositório pessoal.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Painel: Configuração
// ---------------------------------------------------------------------------
function PainelConfig({ config, setConfig, toast }: {
  config: Config
  setConfig: (c: Config) => void
  toast: (tipo: ToastInfo['tipo'], msg: string) => void
}) {
  const [modo, setModo]         = useState<ModosCert>('store')
  const [certSelecionado, setCertSelecionado] = useState<CertInfo | null>(null)
  const [testando, setTestando] = useState(false)
  const isElectron = typeof window !== 'undefined' && !!window.electron

  function handleSelecionarCert(cert: CertInfo) {
    setCertSelecionado(cert)
    setConfig({ ...config, thumbprint: cert.thumbprint, pfxPath: '', origemStore: true })
  }

  async function selecionarArquivo() {
    if (!isElectron) return
    const caminho = await window.electron.cert.selecionarArquivo()
    if (caminho) setConfig({ ...config, pfxPath: caminho, thumbprint: undefined, origemStore: false })
  }

  async function salvarConfig() {
    if (!isElectron) return
    await window.electron.cert.salvarConfig({
      pfxPath: config.pfxPath,
      thumbprint: config.thumbprint,
      origemStore: config.origemStore,
      ambiente: config.ambiente,
    })
    toast('ok', 'Configuração salva.')
  }

  async function testar() {
    if (!isElectron) return
    if (!config.senha) { toast('erro', 'Informe a senha do certificado.'); return }

    if (modo === 'store') {
      if (!config.thumbprint) { toast('erro', 'Selecione um certificado.'); return }
      setTestando(true)
      const r = await window.electron.cert.testarStore(config.thumbprint, config.senha)
      setTestando(false)
      toast(r.ok ? 'ok' : 'erro', r.mensagem)
    } else {
      if (!config.pfxPath) { toast('erro', 'Selecione o arquivo .pfx.'); return }
      setTestando(true)
      const r = await window.electron.cert.testar(config.pfxPath, config.senha)
      setTestando(false)
      toast(r.ok ? 'ok' : 'erro', r.mensagem)
    }
  }

  const certConfigOk = modo === 'store' ? !!certSelecionado : !!config.pfxPath

  return (
    <div className="fade-in p-8 max-w-xl">
      <h2 className="text-xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
        Certificado Digital
      </h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        Use seu e-CNPJ para autenticar as consultas à SEFAZ-SP. A senha nunca é armazenada.
      </p>

      {/* Toggle modo */}
      <div className="flex gap-1 p-1 rounded mb-6 no-drag" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
        {([['store', '🔑 Repositório do sistema'], ['arquivo', '📁 Arquivo .pfx']] as [ModosCert, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className="flex-1 py-2 rounded text-sm font-medium transition-all"
            style={{
              background: modo === m ? 'var(--bg-surface)' : 'transparent',
              color: modo === m ? 'var(--text-primary)' : 'var(--text-muted)',
              border: modo === m ? '1px solid var(--border-hi)' : '1px solid transparent',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Modo: Repositório do sistema */}
      {modo === 'store' && (
        <div className="mb-5">
          {certSelecionado ? (
            /* Cert já selecionado — mostra resumo */
            <div className="p-4 rounded mb-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--teal-dim)' }}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-sm mb-1" style={{ color: 'var(--text-primary)' }}>
                    {certSelecionado.nome}
                  </div>
                  {certSelecionado.cnpj && (
                    <div className="text-xs font-mono mb-1" style={{ color: 'var(--teal)' }}>
                      CNPJ {formatarCNPJ(certSelecionado.cnpj)}
                    </div>
                  )}
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Válido até {formatarData(certSelecionado.validade)} · {certSelecionado.thumbprint.substring(0, 16)}…
                  </div>
                </div>
                <button
                  onClick={() => { setCertSelecionado(null); setConfig({ ...config, thumbprint: undefined }) }}
                  className="text-xs no-drag px-2 py-1 rounded"
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                >
                  Trocar
                </button>
              </div>
            </div>
          ) : (
            /* Lista para selecionar */
            <CertStorePicker onSelecionar={handleSelecionarCert} />
          )}
        </div>
      )}

      {/* Modo: Arquivo .pfx */}
      {modo === 'arquivo' && (
        <div className="mb-5">
          <label className="block text-xs font-medium mb-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Arquivo .pfx / .p12
          </label>
          <div className="flex gap-2">
            <div
              className="flex-1 flex items-center px-3 py-2.5 rounded text-sm truncate cursor-pointer"
              style={{
                background: 'var(--bg-raised)',
                border: '1px solid var(--border)',
                color: config.pfxPath ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={selecionarArquivo}
            >
              {config.pfxPath || 'Clique para selecionar…'}
            </div>
            <button
              onClick={selecionarArquivo}
              className="px-4 py-2.5 rounded text-sm font-medium no-drag"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--teal)' }}
            >
              Procurar
            </button>
          </div>
        </div>
      )}

      {/* Senha */}
      <div className="mb-5">
        <label className="block text-xs font-medium mb-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Senha do Certificado
        </label>
        <input
          type="password"
          value={config.senha}
          onChange={e => setConfig({ ...config, senha: e.target.value })}
          placeholder="••••••••"
          className="w-full px-3 py-2.5 rounded text-sm no-drag"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
          autoComplete="new-password"
        />
        <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
          A senha é usada apenas em memória e não é salva em nenhum momento.
        </p>
      </div>

      {/* Ambiente */}
      <div className="mb-8">
        <label className="block text-xs font-medium mb-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Ambiente
        </label>
        <div className="flex gap-3">
          {(['homologacao', 'producao'] as Ambiente[]).map(amb => (
            <button
              key={amb}
              onClick={() => setConfig({ ...config, ambiente: amb })}
              className="flex-1 py-2.5 rounded text-sm font-medium transition-all no-drag"
              style={{
                background: config.ambiente === amb ? 'var(--teal-glow)' : 'var(--bg-raised)',
                border: `1px solid ${config.ambiente === amb ? 'var(--teal-dim)' : 'var(--border)'}`,
                color: config.ambiente === amb ? 'var(--teal)' : 'var(--text-secondary)',
              }}
            >
              {amb === 'homologacao' ? '🔬 Homologação' : '🏭 Produção'}
            </button>
          ))}
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-3">
        <button
          onClick={testar}
          disabled={testando || !certConfigOk}
          className="flex items-center gap-2 px-4 py-2.5 rounded text-sm font-medium transition-all no-drag"
          style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
            color: certConfigOk ? 'var(--text-primary)' : 'var(--text-muted)',
          }}
        >
          {testando ? <Spinner /> : '◈'} Testar
        </button>
        <button
          onClick={salvarConfig}
          disabled={!certConfigOk}
          className="flex-1 py-2.5 rounded text-sm font-semibold transition-all no-drag"
          style={{
            background: certConfigOk ? 'var(--teal)' : 'var(--bg-raised)',
            color: certConfigOk ? '#000' : 'var(--text-muted)',
          }}
        >
          Salvar configuração
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Painel: Listagem de Chaves
// ---------------------------------------------------------------------------
function PainelListagem({ config, toast }: {
  config: Config
  toast: (tipo: ToastInfo['tipo'], msg: string) => void
}) {
  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  const fmt = (d: Date) => d.toISOString().substring(0, 16)

  const [dtInicial, setDtInicial] = useState(fmt(inicioMes))
  const [dtFinal,   setDtFinal]   = useState(fmt(hoje))
  const [paginacao, setPaginacao] = useState(true)
  const [buscando,  setBuscando]  = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [chaves, setChaves] = useState<ChaveItem[]>([])
  const [filtro, setFiltro] = useState('')
  const isElectron = typeof window !== 'undefined' && !!window.electron

  useEffect(() => {
    if (!isElectron) return
    const remover = window.electron.sefaz.onProgressoListagem((total) => setProgresso(total))
    return remover
  }, [isElectron])

  async function buscar() {
    if (!config.senha) { toast('erro', 'Configure o certificado e a senha primeiro.'); return }
    if (!config.thumbprint && !config.pfxPath) { toast('erro', 'Selecione um certificado.'); return }

    setBuscando(true)
    setProgresso(0)
    setChaves([])

    const r = await window.electron.sefaz.listarChaves(
      config as never,
      dtInicial,
      dtFinal || undefined,
      paginacao
    )

    setBuscando(false)

    if (!r.ok) { toast('erro', r.xMotivo ?? 'Erro.'); return }

    const itens: ChaveItem[] = (r.chaves ?? []).map(ch => ({ chave: ch, selecionada: false }))
    setChaves(itens)
    toast('ok', `${itens.length} chave(s) encontrada(s).`)
  }

  function toggleSelecionada(chave: string) {
    setChaves(prev => prev.map(c => c.chave === chave ? { ...c, selecionada: !c.selecionada } : c))
  }

  function toggleTodas() {
    const todas = chaves.every(c => c.selecionada)
    setChaves(prev => prev.map(c => ({ ...c, selecionada: !todas })))
  }

  const selecionadas = chaves.filter(c => c.selecionada)
  const visiveis = filtro ? chaves.filter(c => c.chave.includes(filtro)) : chaves

  async function downloadLote() {
    if (selecionadas.length === 0) { toast('info', 'Selecione ao menos uma chave.'); return }
    const pasta = await window.electron.fs.selecionarPasta()
    if (!pasta) return
    toast('info', `Baixando ${selecionadas.length} XMLs…`)
    const resultados = await window.electron.sefaz.downloadLote(
      config as never,
      selecionadas.map(c => c.chave),
      pasta
    )
    const erros = resultados.filter(r => !r.ok)
    if (erros.length === 0) {
      toast('ok', `${selecionadas.length} XML(s) salvos em ${pasta}`)
      window.electron.fs.abrirPasta(pasta)
    } else {
      toast('info', `${selecionadas.length - erros.length} OK, ${erros.length} com erro.`)
    }
  }

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Listagem de Chaves
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Data inicial</label>
            <input type="datetime-local" value={dtInicial} onChange={e => setDtInicial(e.target.value)}
              className="px-3 py-2 rounded text-sm no-drag"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', colorScheme: 'dark' }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Data final</label>
            <input type="datetime-local" value={dtFinal} onChange={e => setDtFinal(e.target.value)}
              className="px-3 py-2 rounded text-sm no-drag"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', colorScheme: 'dark' }} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none no-drag" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={paginacao} onChange={e => setPaginacao(e.target.checked)} className="w-4 h-4 accent-teal-500" />
            <span className="text-sm">Paginação automática</span>
          </label>
          <button
            onClick={buscar}
            disabled={buscando}
            className="flex items-center gap-2 px-5 py-2 rounded text-sm font-semibold transition-all no-drag ml-auto"
            style={{ background: buscando ? 'var(--bg-raised)' : 'var(--teal)', color: buscando ? 'var(--text-muted)' : '#000' }}
          >
            {buscando ? <><Spinner /> {progresso > 0 ? `${progresso} chaves…` : 'Buscando…'}</> : '↗ Buscar'}
          </button>
        </div>
      </div>

      {chaves.length > 0 && (
        <div className="flex items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {chaves.length} chaves
            {selecionadas.length > 0 && <> · <span style={{ color: 'var(--teal)' }}>{selecionadas.length} selecionadas</span></>}
          </span>
          <input type="text" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar chaves…"
            className="px-3 py-1.5 rounded text-xs no-drag w-56"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }} />
          {selecionadas.length > 0 && (
            <button onClick={downloadLote}
              className="flex items-center gap-1.5 ml-auto px-4 py-1.5 rounded text-xs font-semibold no-drag"
              style={{ background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)', color: 'var(--teal)' }}>
              ↓ Baixar XMLs ({selecionadas.length})
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {chaves.length === 0 && !buscando && (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--text-muted)' }}>
            <span className="text-4xl">◫</span>
            <span className="text-sm">Nenhuma busca realizada</span>
          </div>
        )}
        {chaves.length > 0 && (
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}>
                <th className="px-4 py-3 text-left w-10">
                  <input type="checkbox" checked={chaves.every(c => c.selecionada)} onChange={toggleTodas} className="no-drag" />
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>#</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Chave de Acesso</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item, i) => (
                <tr key={item.chave} className="transition-colors cursor-pointer"
                  style={{ borderBottom: '1px solid var(--border)', background: item.selecionada ? 'var(--teal-glow)' : i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}
                  onClick={() => toggleSelecionada(item.chave)}>
                  <td className="px-4 py-2.5"><input type="checkbox" checked={item.selecionada} onChange={() => {}} className="no-drag" /></td>
                  <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{i + 1}</td>
                  <td className="px-4 py-2.5 chave-acesso">{formatarChave(item.chave)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Painel: Download de XML
// ---------------------------------------------------------------------------
function PainelDownload({ config, toast }: {
  config: Config
  toast: (tipo: ToastInfo['tipo'], msg: string) => void
}) {
  const [chave,     setChave]     = useState('')
  const [carregando, setCarregando] = useState(false)
  const [resultado, setResultado] = useState<{
    cStat?: string; xMotivo?: string
    nfeProc?: { versao: string; dhInc: string; nProt: string; nfeXml: string }
    eventos?: { versao: string; dhInc: string; nProt: string; eventoXml: string }[]
  } | null>(null)

  async function baixar() {
    const limpa = chave.replace(/\s/g, '')
    if (!/^\d{44}$/.test(limpa)) { toast('erro', 'Chave deve ter exatamente 44 dígitos numéricos.'); return }
    if (!config.senha) { toast('erro', 'Configure a senha do certificado primeiro.'); return }
    setCarregando(true)
    setResultado(null)
    const r = await window.electron.sefaz.downloadXml(config as never, limpa)
    setCarregando(false)
    if (!r.ok) { toast('erro', r.xMotivo ?? 'Erro.'); setResultado(r); return }
    setResultado(r)
    toast('ok', `XML obtido. Protocolo: ${r.nfeProc?.nProt ?? '–'}`)
  }

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Download de XML</h2>
        <div className="flex gap-3">
          <input type="text" value={chave} onChange={e => setChave(e.target.value)}
            placeholder="Chave de acesso (44 dígitos)" maxLength={44}
            className="flex-1 px-3 py-2.5 rounded text-sm font-mono no-drag"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
            onKeyDown={e => e.key === 'Enter' && baixar()} />
          <button onClick={baixar} disabled={carregando}
            className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold no-drag"
            style={{ background: carregando ? 'var(--bg-raised)' : 'var(--teal)', color: carregando ? 'var(--text-muted)' : '#000' }}>
            {carregando ? <><Spinner /> Baixando…</> : '↓ Baixar'}
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Cole a chave de acesso de 44 dígitos ou copie da tela Listagem.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {!resultado && !carregando && (
          <div className="flex flex-col items-center justify-center h-full gap-3" style={{ color: 'var(--text-muted)' }}>
            <span className="text-4xl">⬡</span>
            <span className="text-sm">Informe uma chave para baixar o XML</span>
          </div>
        )}
        {resultado && (
          <div className="space-y-4 fade-in">
            <div className="flex items-center gap-3 p-4 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <Badge cor={resultado.cStat === '200' ? 'green' : 'red'} texto={`cStat ${resultado.cStat}`} />
              <span style={{ color: 'var(--text-secondary)' }}>{resultado.xMotivo}</span>
            </div>
            {resultado.nfeProc && (
              <div className="p-4 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>NFC-e</span>
                  <button
                    onClick={() => window.electron.fs.salvarXml(resultado!.nfeProc!.nfeXml, `${resultado!.nfeProc!.nProt}_nfce.xml`)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium no-drag"
                    style={{ background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)', color: 'var(--teal)' }}>
                    ↓ Salvar XML
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Protocolo</span>
                    <p className="font-mono mt-0.5" style={{ color: 'var(--teal)' }}>{resultado.nfeProc.nProt}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Incluído em</span>
                    <p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{resultado.nfeProc.dhInc}</p>
                  </div>
                </div>
              </div>
            )}
            {(resultado.eventos?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                  Eventos ({resultado.eventos!.length})
                </p>
                <div className="space-y-2">
                  {resultado.eventos!.map((ev, i) => (
                    <div key={i} className="p-3 rounded flex items-center justify-between"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                      <div className="text-sm">
                        <span className="font-mono" style={{ color: 'var(--amber)' }}>{ev.nProt}</span>
                        <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>{ev.dhInc}</span>
                      </div>
                      <button
                        onClick={() => window.electron.fs.salvarXml(ev.eventoXml, `${ev.nProt}_evento.xml`)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs no-drag"
                        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        ↓ XML
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// App principal
// ---------------------------------------------------------------------------
export default function Home() {
  const [aba, setAba] = useState<Aba>('config')
  const [config, setConfig] = useState<Config>({
    pfxPath: '', thumbprint: undefined, origemStore: true, senha: '', ambiente: 'homologacao',
  })
  const [toasts, setToasts] = useState<ToastInfo[]>([])
  const toastId = useRef(0)

  useEffect(() => {
    const isElectron = typeof window !== 'undefined' && !!window.electron
    if (!isElectron) return
    window.electron.cert.carregarConfig().then(cfg => {
      if (cfg) setConfig(prev => ({
        ...prev,
        pfxPath: cfg.pfxPath,
        thumbprint: cfg.thumbprint,
        origemStore: cfg.origemStore ?? false,
        ambiente: cfg.ambiente,
      }))
    })
  }, [])

  function toast(tipo: ToastInfo['tipo'], msg: string) {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, tipo, msg }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  const abas: { id: Aba; label: string; icon: string }[] = [
    { id: 'config',   label: 'Certificado', icon: '⚙' },
    { id: 'listagem', label: 'Listagem',    icon: '≡' },
    { id: 'download', label: 'Download XML', icon: '↓' },
  ]

  const configOk = !!(config.senha && (config.thumbprint || config.pfxPath))

  return (
    <div className="flex h-screen" style={{ background: 'var(--bg-deep)', userSelect: 'none' }}>

      {/* Sidebar */}
      <aside className="flex flex-col w-56 shrink-0" style={{ background: 'var(--bg-base)', borderRight: '1px solid var(--border)' }}>
        <div className="drag-region h-8 shrink-0" />
        <div className="px-5 pb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <span className="text-2xl" style={{ color: 'var(--teal)' }}>⬡</span>
            <span className="font-semibold text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
              Escrituração<br />NFC-e
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: configOk ? 'var(--green)' : 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {configOk ? config.ambiente : 'sem certificado'}
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 flex-1">
          {abas.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all text-left no-drag"
              style={{
                background: aba === a.id ? 'var(--teal-glow)' : 'transparent',
                color: aba === a.id ? 'var(--teal)' : 'var(--text-secondary)',
                fontWeight: aba === a.id ? 500 : 400,
              }}>
              <span className="w-5 text-center text-base">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>SAE-NFC-e v1.0.0</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>SEFAZ-SP · NT 2026</p>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg-base)' }}>
        <div className="drag-region h-8 shrink-0" style={{ background: 'var(--bg-base)' }} />
        <div className="flex-1 overflow-hidden">
          {aba === 'config'   && <div className="h-full overflow-auto"><PainelConfig config={config} setConfig={setConfig} toast={toast} /></div>}
          {aba === 'listagem' && <div className="h-full flex flex-col overflow-hidden"><PainelListagem config={config} toast={toast} /></div>}
          {aba === 'download' && <div className="h-full flex flex-col overflow-hidden"><PainelDownload config={config} toast={toast} /></div>}
        </div>
      </main>

      <Toast toasts={toasts} remover={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </div>
  )
}
