'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { CertInfo } from '../electron/electron.d'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
type Aba       = 'config' | 'listagem' | 'download'
type Ambiente  = 'homologacao' | 'producao'
type ModosCert = 'store' | 'arquivo'

interface Config {
  pfxPath:     string
  thumbprint?: string
  origemStore: boolean
  senha:       string
  ambiente:    Ambiente
}

interface ChaveItem { chave: string; selecionada: boolean }
interface ToastInfo  { id: number; tipo: 'ok' | 'erro' | 'info'; msg: string }

// ---------------------------------------------------------------------------
// Verificação de contexto Electron
// ---------------------------------------------------------------------------

// Returns [isElectron, isMounted]
// isMounted = false means we haven't checked yet (first render)
// isMounted = true + isElectron = false means confirmed NOT in Electron
function useIsElectron(): [boolean, boolean] {
  const [isElectron, setIsElectron] = useState(false)
  const [isMounted,  setIsMounted]  = useState(false)
  useEffect(() => {
    const result = typeof window !== 'undefined' && typeof window.electron !== 'undefined'
    setIsElectron(result)
    setIsMounted(true)
  }, [])
  return [isElectron, isMounted]
}

// ---------------------------------------------------------------------------
// Utilitários de data — usa horário LOCAL, não UTC
// ---------------------------------------------------------------------------

function dataLocalParaInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  )
}

function inputParaSefaz(valor: string): string {
  // datetime-local retorna "AAAA-MM-DDTHH:MM"
  // NT 2026: dataHoraInicial/dataHoraFinal = AAAA-MM-DDThh:mm (16 caracteres, sem timezone)
  return valor
}

function formatarChave(chave: string): string {
  return chave.replace(
    /^(\d{4})(\d{2})(\d{8})(\d{6})(\d{9})(\d{9})(\d{6})$/,
    '$1 $2 $3 $4 $5 $6 $7'
  )
}

function formatarCNPJ(cnpj: string): string {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

/** Extrai o CNPJ do emitente da chave de acesso (posições 6–19). */
function extrairCNPJDaChave(chave: string): string {
  if (!chave || chave.length < 20) return ''
  return chave.substring(6, 20)
}

function formatarData(iso: string): string {
  if (!iso) return '–'
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return iso }
}

// ---------------------------------------------------------------------------
// Componentes base
// ---------------------------------------------------------------------------

function Spinner({ size = 4 }: { size?: number }) {
  return (
    <span
      className="inline-block border-2 border-current border-t-transparent rounded-full animate-spin"
      style={{ width: `${size * 4}px`, height: `${size * 4}px` }}
    />
  )
}

function Badge({ cor, texto }: { cor: 'green' | 'amber' | 'red' | 'teal' | 'gray'; texto: string }) {
  const cores: Record<string, string> = {
    green: 'bg-emerald-900/40 text-emerald-400 border-emerald-800/60',
    amber: 'bg-amber-900/40 text-amber-400 border-amber-800/60',
    red:   'bg-red-900/40 text-red-400 border-red-800/60',
    teal:  'bg-teal-900/40 text-teal-400 border-teal-800/60',
    gray:  'bg-zinc-800/60 text-zinc-400 border-zinc-700/60',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border ${cores[cor]}`}>
      {texto}
    </span>
  )
}

function LoadingOverlay({
  tipo,
  atual,
  total,
  label,
}: {
  tipo: 'listagem' | 'lote'
  atual?: number
  total?: number
  label?: string
}) {
  const pct = total && total > 0 && typeof atual === 'number' ? Math.round((atual / total) * 100) : 0
  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)', pointerEvents: 'auto' }}
    >
      <Spinner size={8} />
      <div className="flex flex-col items-center gap-2 min-w-[280px]">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {label ?? (tipo === 'listagem' ? 'Buscando chaves…' : 'Baixando XMLs…')}
        </span>
        {total != null && total > 0 && (
          <>
            <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-raised)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${pct}%`, background: 'var(--teal)' }}
              />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {atual ?? 0} / {total}
            </span>
          </>
        )}
      </div>
      <p className="text-xs max-w-xs text-center" style={{ color: 'var(--text-muted)' }}>
        Não feche a janela — o processo será interrompido.
      </p>
    </div>
  )
}

function Toast({ toasts, remover }: { toasts: ToastInfo[]; remover: (id: number) => void }) {
  const cores = {
    ok:   'border-l-[var(--green)] bg-[#0d1f16]',
    erro: 'border-l-[var(--red)] bg-[#1f0d11]',
    info: 'border-l-[var(--teal)] bg-[#0d1a1f]',
  }
  const icons = { ok: '✓', erro: '✕', info: '◈' }
  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50 no-drag" role="region" aria-label="Notificações">
      {toasts.map(t => (
        <div
          key={t.id}
          role="alert"
          className={`flex items-start gap-3 px-4 py-3 rounded shadow-xl min-w-72 max-w-sm fade-in cursor-pointer ${cores[t.tipo]}`}
          style={{ border: '1px solid var(--border)', borderLeftWidth: '4px' }}
          onClick={() => remover(t.id)}
        >
          <span className="mt-0.5 text-sm shrink-0" style={{ color: t.tipo === 'ok' ? 'var(--green)' : t.tipo === 'erro' ? 'var(--red)' : 'var(--teal)' }}>
            {icons[t.tipo]}
          </span>
          <span className="text-sm break-words" style={{ color: 'var(--text-primary)' }}>{t.msg}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Seletor de certificados do sistema
// ---------------------------------------------------------------------------

function CertStorePicker({ onSelecionar }: { onSelecionar: (cert: CertInfo) => void }) {
  const [isElectron, isMounted] = useIsElectron()
  const [certs,      setCerts]      = useState<CertInfo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro,       setErro]       = useState('')
  const [filtro,     setFiltro]     = useState('')

  useEffect(() => {
    // Ainda não sabemos se estamos no Electron — aguarda a montagem
    if (!isMounted) return

    if (!isElectron) {
      setCarregando(false)
      setErro('Use o modo "Arquivo .pfx" — repositório automático disponível apenas no app instalado.')
      return
    }

    // Resetar estados caso o efeito reexecute
    setErro('')
    setCarregando(true)

    let cancelado = false
    window.electron.cert.listarSistema()
      .then(r => {
        if (cancelado) return
        setCarregando(false)
        if (!r.ok || !r.certs) {
          setErro(r.erro ?? 'Erro ao listar certificados.')
          return
        }
        setCerts(r.certs)
      })
      .catch(err => {
        if (cancelado) return
        setCarregando(false)
        setErro(err instanceof Error ? err.message : 'Falha ao buscar certificados.')
      })

    return () => { cancelado = true }
  }, [isElectron, isMounted])

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
      <div className="py-4 px-4 rounded text-sm" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--red)' }}>
        <p className="font-medium mb-1">Não foi possível listar os certificados</p>
        <p style={{ color: 'var(--text-secondary)' }}>{erro}</p>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Use o modo "Arquivo .pfx" como alternativa.
        </p>
      </div>
    )
  }

  if (certs.length === 0) {
    return (
      <div className="py-8 text-sm text-center" style={{ color: 'var(--text-muted)' }}>
        <p>Nenhum certificado com chave privada encontrado.</p>
        <p className="mt-1 text-xs">Verifique em: certmgr.msc → Pessoal → Certificados</p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-3">
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Filtrar por nome, CNPJ ou thumbprint…"
          className="w-full px-3 py-2 rounded text-sm no-drag"
          style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
          aria-label="Filtrar certificados"
        />
      </div>

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
        {visiveis.map(cert => (
          <button
            key={cert.thumbprint}
            onClick={() => onSelecionar(cert)}
            disabled={cert.expirado}
            title={cert.expirado ? 'Certificado expirado — não pode ser usado' : undefined}
            className="w-full text-left px-4 py-3 rounded transition-all no-drag"
            style={{
              background: 'var(--bg-raised)',
              border: '1px solid var(--border)',
              opacity: cert.expirado ? 0.45 : 1,
              cursor: cert.expirado ? 'not-allowed' : 'pointer',
            }}
            onMouseEnter={e => { if (!cert.expirado) e.currentTarget.style.borderColor = 'var(--teal-dim)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
          >
            <div className="flex items-start justify-between gap-3">
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
              <div className="text-right shrink-0">
                <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                  {cert.thumbprint.substring(0, 8)}…
                </div>
                {!cert.expirado && (
                  <div className="mt-1.5 text-xs px-2 py-0.5 rounded" style={{ background: 'var(--teal-glow)', color: 'var(--teal)' }}>
                    Selecionar →
                  </div>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        {certs.length} certificado(s) encontrado(s).{' '}
        {certs.filter(c => c.expirado).length > 0 && (
          <span style={{ color: 'var(--red)' }}>
            {certs.filter(c => c.expirado).length} expirado(s) — não disponível para seleção.
          </span>
        )}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Painel: Configuração
// ---------------------------------------------------------------------------

function PainelConfig({
  config,
  setConfig,
  toast,
}: {
  config: Config
  setConfig: (c: Config) => void
  toast: (tipo: ToastInfo['tipo'], msg: string) => void
}) {
  const [isElectron] = useIsElectron()
  const [modo,           setModo]           = useState<ModosCert>('store')
  const [certSelecionado, setCertSelecionado] = useState<CertInfo | null>(null)
  const [testando,       setTestando]       = useState(false)
  const [senhaVisivel,   setSenhaVisivel]   = useState(false)
  const [senhaVerificada, setSenhaVerificada] = useState<boolean | null>(null)

  function handleSelecionarCert(cert: CertInfo) {
    setCertSelecionado(cert)
    setConfig({ ...config, thumbprint: cert.thumbprint, pfxPath: '', origemStore: true })
    setSenhaVerificada(null)
  }

  async function selecionarArquivo() {
    if (!isElectron) return
    try {
      const caminho = await window.electron.cert.selecionarArquivo()
      if (caminho) {
        setConfig({ ...config, pfxPath: caminho, thumbprint: undefined, origemStore: false })
        setSenhaVerificada(null)
      }
    } catch (err) {
      toast('erro', `Erro ao selecionar arquivo: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
    }
  }

  async function salvarConfig() {
    if (!isElectron) return
    try {
      const ok = await window.electron.cert.salvarConfig({
        pfxPath:     config.pfxPath,
        thumbprint:  config.thumbprint,
        origemStore: config.origemStore,
        ambiente:    config.ambiente,
      })
      toast(ok ? 'ok' : 'erro', ok ? 'Configuração salva.' : 'Falha ao salvar configuração.')
    } catch (err) {
      toast('erro', `Erro ao salvar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
    }
  }

  async function testar() {
    if (!isElectron) { toast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.'); return }

    if (modo === 'store') {
      if (!config.thumbprint) { toast('erro', 'Selecione um certificado da lista.'); return }
      setTestando(true)
      setSenhaVerificada(null)
      try {
        const r = await window.electron.cert.testarStore(config.thumbprint, config.senha || '')
        setSenhaVerificada(r.ok)
        toast(r.ok ? 'ok' : 'erro', r.mensagem)
      } catch (err) {
        setSenhaVerificada(false)
        toast('erro', `Erro ao testar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
      } finally {
        setTestando(false)
      }
    } else {
      if (!config.senha) { toast('erro', 'Informe a senha do certificado.'); return }
      if (!config.pfxPath) { toast('erro', 'Selecione o arquivo .pfx.'); return }
      setTestando(true)
      setSenhaVerificada(null)
      try {
        const r = await window.electron.cert.testar(config.pfxPath, config.senha)
        setSenhaVerificada(r.ok)
        toast(r.ok ? 'ok' : 'erro', r.mensagem)
      } catch (err) {
        setSenhaVerificada(false)
        toast('erro', `Erro ao testar: ${err instanceof Error ? err.message : 'Erro desconhecido'}`)
      } finally {
        setTestando(false)
      }
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
        {(['store', 'arquivo'] as ModosCert[]).map(m => (
          <button key={m} onClick={() => setModo(m)}
            className="flex-1 py-2 rounded text-sm font-medium transition-all"
            style={{
              background: modo === m ? 'var(--bg-surface)' : 'transparent',
              color:      modo === m ? 'var(--text-primary)' : 'var(--text-muted)',
              border:     modo === m ? '1px solid var(--border-hi)' : '1px solid transparent',
            }}>
            {m === 'store' ? '🔑 Repositório do sistema' : '📁 Arquivo .pfx'}
          </button>
        ))}
      </div>

      {modo === 'store' && (
        <div className="mb-5">
          {certSelecionado ? (
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
                  style={{ color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Trocar
                </button>
              </div>
            </div>
          ) : (
            <CertStorePicker onSelecionar={handleSelecionarCert} />
          )}
        </div>
      )}

      {modo === 'arquivo' && (
        <div className="mb-5">
          <label className="block text-xs font-medium mb-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Arquivo .pfx / .p12
          </label>
          <div className="flex gap-2">
            <div
              className="flex-1 flex items-center px-3 py-2.5 rounded text-sm truncate cursor-pointer"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: config.pfxPath ? 'var(--text-primary)' : 'var(--text-muted)' }}
              onClick={selecionarArquivo}>
              {config.pfxPath || 'Clique para selecionar…'}
            </div>
            <button onClick={selecionarArquivo}
              className="px-4 py-2.5 rounded text-sm font-medium no-drag"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--teal)' }}>
              Procurar
            </button>
          </div>
        </div>
      )}

      {/* Senha — apenas para modo arquivo .pfx */}
      {modo === 'store' ? (
        <div className="mb-5 px-4 py-3 rounded flex items-center justify-between gap-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <span className="text-lg">🔑</span>
            <div>
              <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Repositório do sistema</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                Senha não necessária — o certificado é acessado diretamente pelo Windows.
              </p>
            </div>
          </div>
          {certConfigOk && (
            <button
              onClick={testar}
              disabled={testando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium no-drag shrink-0"
              style={{ background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)', color: 'var(--teal)' }}
            >
              {testando ? <Spinner size={3} /> : 'Verificar'}
            </button>
          )}
        </div>
      ) : (
        <div className="mb-5">
          <label className="block text-xs font-medium mb-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
            Senha do Certificado
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type={senhaVisivel ? 'text' : 'password'}
                value={config.senha}
                onChange={e => { setConfig({ ...config, senha: e.target.value }); setSenhaVerificada(null) }}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-10 rounded text-sm no-drag"
                style={{
                  background: 'var(--bg-raised)',
                  border: `1px solid ${senhaVerificada === false ? 'var(--red)' : 'var(--border)'}`,
                }}
                autoComplete="new-password"
                aria-label="Senha do certificado"
              />
              <button
                type="button"
                onClick={() => setSenhaVisivel(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded text-xs no-drag"
                style={{ color: 'var(--text-muted)' }}
                title={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
                aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {senhaVisivel ? '🙈' : '👁'}
              </button>
            </div>
            <button
              onClick={testar}
              disabled={testando || !config.senha || !certConfigOk}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded text-sm font-medium no-drag shrink-0"
              style={{
                background: testando ? 'var(--bg-raised)' : 'var(--teal-glow)',
                border: '1px solid var(--teal-dim)',
                color: testando ? 'var(--text-muted)' : 'var(--teal)',
              }}
            >
              {testando ? <Spinner size={3} /> : 'Verificar'}
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              A senha é usada apenas em memória e não é salva.
            </p>
            {senhaVerificada === true && <span className="text-xs" style={{ color: 'var(--green)' }}>✓ Senha correta</span>}
            {senhaVerificada === false && <span className="text-xs" style={{ color: 'var(--red)' }}>✕ Senha incorreta</span>}
          </div>
        </div>
      )}

      {/* Ambiente */}
      <div className="mb-8">
        <label className="block text-xs font-medium mb-2 uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
          Ambiente
        </label>
        <div className="flex gap-3">
          {(['homologacao', 'producao'] as Ambiente[]).map(amb => (
            <button key={amb} onClick={() => setConfig({ ...config, ambiente: amb })}
              className="flex-1 py-2.5 rounded text-sm font-medium transition-all no-drag"
              style={{
                background: config.ambiente === amb ? 'var(--teal-glow)' : 'var(--bg-raised)',
                border:     `1px solid ${config.ambiente === amb ? 'var(--teal-dim)' : 'var(--border)'}`,
                color:      config.ambiente === amb ? 'var(--teal)' : 'var(--text-secondary)',
              }}>
              {amb === 'homologacao' ? '🔬 Homologação' : '🏭 Produção'}
            </button>
          ))}
        </div>
      </div>

      {/* Ações */}
      <div className="flex gap-3">
        <button onClick={salvarConfig} disabled={!certConfigOk}
          className="flex-1 py-2.5 rounded text-sm font-semibold transition-all no-drag"
          style={{ background: certConfigOk ? 'var(--teal)' : 'var(--bg-raised)', color: certConfigOk ? '#000' : 'var(--text-muted)' }}>
          Salvar configuração
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Painel: Listagem de Chaves
// ---------------------------------------------------------------------------

function PainelListagem({
  config,
  toast,
  setLoadingState,
}: {
  config: Config
  toast: (tipo: ToastInfo['tipo'], msg: string) => void
  setLoadingState: (s: { type: 'listagem' | 'lote' | null; atual?: number; total?: number }) => void
}) {
  const [isElectron] = useIsElectron()
  const hoje      = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  const [dtInicial, setDtInicial] = useState(dataLocalParaInput(inicioMes))
  const [dtFinal,   setDtFinal]   = useState(dataLocalParaInput(hoje))
  const [paginacao, setPaginacao] = useState(true)
  const [buscando,  setBuscando]  = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [chaves,    setChaves]    = useState<ChaveItem[]>([])
  const [filtro,    setFiltro]    = useState('')
  const [cnpjCertificado, setCnpjCertificado] = useState<string>('')
  const [filtroEmitente, setFiltroEmitente] = useState<'todos' | 'matriz' | 'filiais' | string>('todos')
  useEffect(() => {
    if (!isElectron) return
    const remover = window.electron.sefaz.onProgressoListagem((total) => {
      setProgresso(total)
      if (buscando) setLoadingState({ type: 'listagem', total })
    })
    return remover
  }, [isElectron, buscando, setLoadingState])

  useEffect(() => {
    if (!isElectron) return
    const remover = window.electron.sefaz.onProgressoLote((info) => {
      setLoadingState({ type: 'lote', atual: info.atual, total: info.total })
    })
    return remover
  }, [isElectron, setLoadingState])

  async function buscar() {
    if (!isElectron) { toast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.'); return }
    if (!config.origemStore && !config.senha) { toast('erro', 'Configure a senha do certificado primeiro.'); return }
    if (!config.thumbprint && !config.pfxPath) { toast('erro', 'Selecione um certificado na aba Configuração.'); return }
    if (!dtInicial) { toast('erro', 'Informe a data inicial.'); return }

    setBuscando(true)
    setProgresso(0)
    setChaves([])
    setLoadingState({ type: 'listagem', total: 0 })
    if (isElectron && window.electron?.app) window.electron.app.setBusy(true)

    try {
      const r = await window.electron.sefaz.listarChaves(
        config as never,
        inputParaSefaz(dtInicial),
        dtFinal ? inputParaSefaz(dtFinal) : undefined,
        paginacao
      )

      if (!r.ok) {
        toast('erro', r.xMotivo ?? 'Erro desconhecido ao consultar a SEFAZ.')
        return
      }

      const itens: ChaveItem[] = (r.chaves ?? []).map(ch => ({ chave: ch, selecionada: false }))
      setChaves(itens)
      setCnpjCertificado((r as { cnpj?: string }).cnpj ?? '')
      setFiltroEmitente('todos')

      if (itens.length === 0) {
        toast('info', 'Nenhuma NFC-e encontrada no período informado.')
      } else {
        toast('ok', `${itens.length} chave(s) encontrada(s).`)
      }
    } catch (err) {
      toast('erro', `Erro inesperado: ${err instanceof Error ? err.message : 'Tente novamente.'}`)
    } finally {
      setBuscando(false)
      setLoadingState({ type: null })
      if (isElectron && window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  function toggleSelecionada(chave: string) {
    setChaves(prev => prev.map(c => c.chave === chave ? { ...c, selecionada: !c.selecionada } : c))
  }

  function toggleTodas() {
    const todasVisiveisSelecionadas = visiveis.length > 0 && visiveis.every(c => c.selecionada)
    const visiveisSet = new Set(visiveis.map(v => v.chave))
    setChaves(prev => prev.map(c =>
      visiveisSet.has(c.chave) ? { ...c, selecionada: !todasVisiveisSelecionadas } : c
    ))
  }

  const selecionadas = chaves.filter(c => c.selecionada)
  const cnpjNorm     = cnpjCertificado.replace(/\D/g, '')

  // Contagem por emitente (Matriz vs Filiais)
  const contagemPorCNPJ = chaves.reduce<Record<string, number>>((acc, c) => {
    const cnpj = extrairCNPJDaChave(c.chave)
    if (cnpj) acc[cnpj] = (acc[cnpj] ?? 0) + 1
    return acc
  }, {})
  const cnpjsUnicos = Object.keys(contagemPorCNPJ).sort()
  const qtdMatriz  = cnpjNorm ? (contagemPorCNPJ[cnpjNorm] ?? 0) : 0
  const qtdFiliais = cnpjsUnicos.filter(c => c !== cnpjNorm).reduce((s, c) => s + (contagemPorCNPJ[c] ?? 0), 0)

  const passaFiltroEmitente = (chave: string) => {
    const cnpjChave = extrairCNPJDaChave(chave)
    if (filtroEmitente === 'todos') return true
    if (filtroEmitente === 'matriz') return cnpjNorm && cnpjChave === cnpjNorm
    if (filtroEmitente === 'filiais') return cnpjNorm && cnpjChave !== cnpjNorm
    return cnpjChave === filtroEmitente
  }

  const baseFiltro = filtro ? chaves.filter(c => c.chave.includes(filtro)) : chaves
  const visiveis   = baseFiltro.filter(c => passaFiltroEmitente(c.chave))

  async function downloadLote() {
    if (!isElectron) return
    if (selecionadas.length === 0) { toast('info', 'Selecione ao menos uma chave.'); return }

    let pasta: string | null = null
    try {
      pasta = await window.electron.fs.selecionarPasta()
    } catch (err) {
      toast('erro', `Erro ao selecionar pasta: ${err instanceof Error ? err.message : 'Erro'}`)
      return
    }

    if (!pasta) return

    toast('info', `Iniciando download de ${selecionadas.length} XMLs…`)
    setLoadingState({ type: 'lote', atual: 0, total: selecionadas.length })
    if (isElectron && window.electron?.app) window.electron.app.setBusy(true)

    try {
      const resultado = await window.electron.sefaz.downloadLote(
        config as never,
        selecionadas.map(c => c.chave),
        pasta
      )

      // downloadLote retorna { ok, resultados: { chave, ok, erro? }[], xMotivo? }
      const resultados = (resultado as { ok?: boolean; resultados?: { chave: string; ok: boolean; erro?: string }[]; xMotivo?: string }).resultados ?? []
      const comErro = resultados.filter(r => !r.ok)
      const erros = comErro.length

      if (erros === 0) {
        toast('ok', `${selecionadas.length} XML(s) salvos com sucesso.`)
        try { await window.electron.fs.abrirPasta(pasta) } catch { /* ignora */ }
      } else {
        const msgErro = (comErro[0]?.erro ?? 'Erro desconhecido').slice(0, 150)
        const sufixo = (comErro[0]?.erro?.length ?? 0) > 150 ? '…' : ''
        toast('erro', `${selecionadas.length - erros} OK · ${erros} com erro: ${msgErro}${sufixo}`)
      }
    } catch (err) {
      toast('erro', `Falha no download em lote: ${err instanceof Error ? err.message : 'Erro'}`)
    } finally {
      setLoadingState({ type: null })
      if (isElectron && window.electron?.app) window.electron.app.setBusy(false)
    }
  }

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Listagem de Chaves</h2>

        {!config.origemStore && !config.senha && config.pfxPath && (
          <div
            className="mb-4 px-4 py-3 rounded flex items-center gap-3"
            style={{ background: 'var(--amber)', color: '#000', border: '1px solid var(--amber)' }}
            role="alert"
          >
            <span className="text-lg">⚠</span>
            <div>
              <p className="font-medium">Senha do certificado não informada</p>
              <p className="text-sm opacity-90">
                Com arquivo .pfx, a senha é obrigatória. Vá na aba <strong>Certificado</strong>, informe a senha e clique em Verificar antes de buscar.
              </p>
            </div>
          </div>
        )}

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
          <button onClick={buscar} disabled={buscando}
            className="flex items-center gap-2 px-5 py-2 rounded text-sm font-semibold transition-all no-drag ml-auto"
            style={{ background: buscando ? 'var(--bg-raised)' : 'var(--teal)', color: buscando ? 'var(--text-muted)' : '#000' }}>
            {buscando
              ? <><Spinner /> {progresso > 0 ? `${progresso} chaves…` : 'Buscando…'}</>
              : '↗ Buscar'}
          </button>
        </div>
      </div>

      {chaves.length > 0 && (
        <div className="flex flex-col gap-2 px-6 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {chaves.length} chaves
              {selecionadas.length > 0 && <> · <span style={{ color: 'var(--teal)' }}>{selecionadas.length} selecionadas</span></>}
            </span>
            {cnpjNorm && (
              <select
                value={filtroEmitente}
                onChange={e => setFiltroEmitente(e.target.value)}
                className="px-3 py-1.5 rounded text-xs no-drag"
                style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                aria-label="Filtrar por emitente"
              >
                <option value="todos">Todas</option>
                <option value="matriz">Só Matriz</option>
                <option value="filiais">Só Filiais</option>
                {cnpjsUnicos.filter(c => c !== cnpjNorm).map(cnpj => (
                  <option key={cnpj} value={cnpj}>Filial {formatarCNPJ(cnpj)}</option>
                ))}
              </select>
            )}
            <input type="text" value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar chaves…"
              className="px-3 py-1.5 rounded text-xs no-drag w-56"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }} />
            {selecionadas.length > 0 && (
              <div className="flex items-center gap-3 ml-auto">
                {cnpjNorm && (() => {
                  const selMatriz = selecionadas.filter(c => extrairCNPJDaChave(c.chave) === cnpjNorm).length
                  const selFiliais = selecionadas.length - selMatriz
                  const partes: string[] = []
                  if (selMatriz > 0) partes.push(`${selMatriz} Matriz`)
                  if (selFiliais > 0) partes.push(`${selFiliais} Filiais`)
                  return partes.length > 0 ? (
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{partes.join(' · ')}</span>
                  ) : null
                })()}
                <button onClick={downloadLote}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded text-xs font-semibold no-drag"
                  style={{ background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)', color: 'var(--teal)' }}>
                  ↓ Baixar XMLs ({selecionadas.length})
                </button>
              </div>
            )}
          </div>
          {cnpjNorm && (
            <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {qtdMatriz > 0 && <span>{qtdMatriz} Matriz</span>}
              {cnpjsUnicos.filter(c => c !== cnpjNorm).map(cnpj => (
                <span key={cnpj}>{contagemPorCNPJ[cnpj] ?? 0} Filial {formatarCNPJ(cnpj)}</span>
              ))}
            </div>
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
                  <input type="checkbox" checked={visiveis.length > 0 && visiveis.every(c => c.selecionada)} onChange={toggleTodas} aria-label="Selecionar todas" />
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-widest w-12" style={{ color: 'var(--text-muted)' }}>#</th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Chave de Acesso</th>
                {cnpjNorm && (
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest w-40" style={{ color: 'var(--text-muted)' }}>Emitente</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item, i) => {
                const cnpjChave = extrairCNPJDaChave(item.chave)
                const ehMatriz = cnpjNorm && cnpjChave === cnpjNorm
                return (
                  <tr key={item.chave} className="transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--border)', background: item.selecionada ? 'var(--teal-glow)' : i % 2 === 0 ? 'transparent' : 'var(--bg-surface)' }}
                    onClick={() => toggleSelecionada(item.chave)}>
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={item.selecionada} onChange={() => {}} aria-label={`Selecionar chave ${item.chave}`} />
                    </td>
                    <td className="px-4 py-2.5 tabular-nums" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{i + 1}</td>
                    <td className="px-4 py-2.5 chave-acesso">{formatarChave(item.chave)}</td>
                    {cnpjNorm && (
                      <td className="px-4 py-2.5">
                        {ehMatriz ? (
                          <Badge cor="green" texto="Matriz" />
                        ) : (
                          <Badge cor="teal" texto={`Filial ${formatarCNPJ(cnpjChave)}`} />
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
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

function PainelDownload({ config, toast }: { config: Config; toast: (tipo: ToastInfo['tipo'], msg: string) => void }) {
  const [isElectron] = useIsElectron()
  const [chave,     setChave]     = useState('')
  const [carregando, setCarregando] = useState(false)
  const [resultado, setResultado] = useState<{
    cStat?: string
    xMotivo?: string
    nfeProc?: { versao: string; dhInc: string; nProt: string; nfeXml: string }
    eventos?: { versao: string; dhInc: string; nProt: string; eventoXml: string }[]
  } | null>(null)

  async function baixar() {
    const limpa = chave.replace(/\s/g, '')
    if (!/^\d{44}$/.test(limpa)) { toast('erro', 'A chave de acesso deve ter exatamente 44 dígitos numéricos.'); return }
    if (!config.origemStore && !config.senha) { toast('erro', 'Configure a senha do certificado primeiro.'); return }
    if (!isElectron)              { toast('erro', 'Funcionalidade disponível apenas no aplicativo desktop.'); return }

    setCarregando(true)
    setResultado(null)

    try {
      const r = await window.electron.sefaz.downloadXml(config as never, limpa)
      setResultado(r)

      if (!r.ok) {
        toast('erro', r.xMotivo ?? 'Erro ao baixar o XML.')
      } else {
        toast('ok', `XML obtido. Protocolo: ${r.nfeProc?.nProt ?? '–'}`)
      }
    } catch (err) {
      toast('erro', `Erro inesperado: ${err instanceof Error ? err.message : 'Tente novamente.'}`)
    } finally {
      setCarregando(false)
    }
  }

  async function salvarXml(xml: string, nome: string) {
    if (!isElectron) return
    try {
      const ok = await window.electron.fs.salvarXml(xml, nome)
      if (!ok) toast('info', 'Operação de salvar cancelada.')
    } catch (err) {
      toast('erro', `Erro ao salvar: ${err instanceof Error ? err.message : 'Erro'}`)
    }
  }

  return (
    <div className="fade-in flex flex-col h-full">
      <div className="p-6 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Download de XML</h2>

        {!config.origemStore && !config.senha && config.pfxPath && (
          <div
            className="mb-4 px-4 py-3 rounded flex items-center gap-3"
            style={{ background: 'var(--amber)', color: '#000', border: '1px solid var(--amber)' }}
            role="alert"
          >
            <span className="text-lg">⚠</span>
            <div>
              <p className="font-medium">Senha do certificado não informada</p>
              <p className="text-sm opacity-90">
                Com arquivo .pfx, a senha é obrigatória. Vá na aba <strong>Certificado</strong>, informe a senha e clique em Verificar antes de baixar.
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <input type="text" value={chave} onChange={e => setChave(e.target.value)}
            placeholder="Chave de acesso (44 dígitos)" maxLength={44}
            className="flex-1 px-3 py-2.5 rounded text-sm font-mono no-drag"
            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
            onKeyDown={e => e.key === 'Enter' && !carregando && baixar()}
            aria-label="Chave de acesso da NFC-e" />
          <button onClick={baixar} disabled={carregando}
            className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-semibold no-drag"
            style={{ background: carregando ? 'var(--bg-raised)' : 'var(--teal)', color: carregando ? 'var(--text-muted)' : '#000' }}>
            {carregando ? <><Spinner /> Baixando…</> : '↓ Baixar'}
          </button>
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Cole a chave de acesso de 44 dígitos ou copie da tela Listagem. Pressione Enter para baixar.
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
            {/* Status */}
            <div className="flex items-center gap-3 p-4 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <Badge cor={resultado.cStat === '200' ? 'green' : 'red'} texto={`cStat ${resultado.cStat ?? '?'}`} />
              <span style={{ color: 'var(--text-secondary)' }}>{resultado.xMotivo}</span>
            </div>

            {/* NFC-e */}
            {resultado.nfeProc && (
              <div className="p-4 rounded" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>NFC-e</span>
                  <button
                    onClick={() => salvarXml(resultado!.nfeProc!.nfeXml, `${resultado!.nfeProc!.nProt}_nfce.xml`)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium no-drag"
                    style={{ background: 'var(--teal-glow)', border: '1px solid var(--teal-dim)', color: 'var(--teal)' }}>
                    ↓ Salvar XML
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Protocolo</span>
                    <p className="font-mono mt-0.5" style={{ color: 'var(--teal)' }}>{resultado.nfeProc.nProt || '–'}</p>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Incluído em</span>
                    <p className="font-mono mt-0.5" style={{ color: 'var(--text-primary)' }}>{resultado.nfeProc.dhInc || '–'}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Eventos */}
            {(resultado.eventos?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
                  Eventos ({resultado.eventos!.length})
                </p>
                <div className="space-y-2">
                  {resultado.eventos!.map((ev, i) => (
                    <div key={ev.nProt || i} className="p-3 rounded flex items-center justify-between"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                      <div className="text-sm">
                        <span className="font-mono" style={{ color: 'var(--amber)' }}>{ev.nProt || '–'}</span>
                        <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>{ev.dhInc || '–'}</span>
                      </div>
                      <button
                        onClick={() => salvarXml(ev.eventoXml, `${ev.nProt}_evento.xml`)}
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
  const [isElectron] = useIsElectron()
  const [versaoApp, setVersaoApp] = useState<string>('')
  const [aba,    setAba]    = useState<Aba>('config')
  const [config, setConfig] = useState<Config>({
    pfxPath: '', thumbprint: undefined, origemStore: true, senha: '', ambiente: 'homologacao',
  })
  const [toasts,  setToasts]  = useState<ToastInfo[]>([])
  const [loadingState, setLoadingState] = useState<{ type: 'listagem' | 'lote' | null; atual?: number; total?: number }>({ type: null })
  const toastId = useRef(0)

  // Carrega configuração salva ao iniciar
  useEffect(() => {
    if (!isElectron) return
    window.electron.cert.carregarConfig()
      .then(cfg => {
        if (cfg) setConfig(prev => ({
          ...prev,
          pfxPath:     cfg.pfxPath     ?? '',
          thumbprint:  cfg.thumbprint,
          origemStore: cfg.origemStore ?? false,
          ambiente:    cfg.ambiente    ?? 'homologacao',
        }))
      })
      .catch(err => console.warn('[App] Falha ao carregar config:', err))
  }, [isElectron])

  useEffect(() => {
    if (!isElectron) return
    window.electron.app.getVersion()
      .then(setVersaoApp)
      .catch(() => setVersaoApp(''))
  }, [isElectron])

  const toast = useCallback((tipo: ToastInfo['tipo'], msg: string) => {
    const id = ++toastId.current
    setToasts(prev => [...prev.slice(-4), { id, tipo, msg }]) // máximo 5 toasts simultâneos
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const abas = [
    { id: 'config'   as Aba, label: 'Certificado',  icon: '⚙' },
    { id: 'listagem' as Aba, label: 'Listagem',      icon: '≡' },
    { id: 'download' as Aba, label: 'Download XML',  icon: '↓' },
  ]

  const configOk = (config.origemStore && !!config.thumbprint) || (!config.origemStore && !!config.pfxPath && !!config.senha)

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
            <span className="inline-block w-1.5 h-1.5 rounded-full transition-colors"
              style={{ background: configOk ? 'var(--green)' : 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {configOk ? config.ambiente : 'sem certificado'}
            </span>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 px-3 flex-1" aria-label="Navegação principal">
          {abas.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded text-sm transition-all text-left no-drag"
              aria-current={aba === a.id ? 'page' : undefined}
              style={{
                background:  aba === a.id ? 'var(--teal-glow)' : 'transparent',
                color:       aba === a.id ? 'var(--teal)' : 'var(--text-secondary)',
                fontWeight:  aba === a.id ? 500 : 400,
              }}>
              <span className="w-5 text-center text-base">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </nav>

        <div className="px-5 py-4" style={{ borderTop: '1px solid var(--border)' }}>
          {versaoApp && (
            <p className="text-xs font-mono mb-1" style={{ color: 'var(--teal)' }} title="Versão do aplicativo">
              App v{versaoApp}
            </p>
          )}
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>SAE-NFC-e v1.0.0</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>SEFAZ-SP · NT 2026</p>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 overflow-hidden flex flex-col" style={{ background: 'var(--bg-base)' }}>
        <div className="drag-region h-8 shrink-0" style={{ background: 'var(--bg-base)' }} />
        <div className="flex-1 overflow-hidden">
          {aba === 'config'   && <div className="h-full overflow-auto"><PainelConfig  config={config} setConfig={setConfig} toast={toast} /></div>}
          {aba === 'listagem' && <div className="h-full flex flex-col overflow-hidden"><PainelListagem config={config} toast={toast} setLoadingState={setLoadingState} /></div>}
          {aba === 'download' && <div className="h-full flex flex-col overflow-hidden"><PainelDownload config={config} toast={toast} /></div>}
        </div>
      </main>

      <Toast toasts={toasts} remover={id => setToasts(prev => prev.filter(t => t.id !== id))} />

      {loadingState.type && (
        <LoadingOverlay
          tipo={loadingState.type}
          atual={loadingState.atual}
          total={loadingState.total}
          label={loadingState.type === 'listagem' ? 'Buscando chaves…' : 'Baixando XMLs…'}
        />
      )}
    </div>
  )
}