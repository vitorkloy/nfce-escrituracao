'use client'

import type { ReactNode } from 'react'

type ManualSectionData = {
  titulo: string
  itens: ReactNode[]
}

function ManualSection({ titulo, itens, isLast = false }: { titulo: string; itens: ReactNode[]; isLast?: boolean }) {
  return (
    <section className={`${isLast ? '' : 'mb-5'} rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4`}>
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{titulo}</h3>
      <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
        {itens.map((item, i) => (
          <li key={`${titulo}-${i}`}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export function ManualPanel() {
  const secoes: ManualSectionData[] = [
    {
      titulo: '0) Módulo NFC-e ou NF-e',
      itens: [
        <>Ao abrir, o sistema entra no módulo <strong>NFC-e</strong>. Se precisar, troque para <strong>NF-e</strong> na barra lateral.</>,
        <>As telas e funções mudam de acordo com o módulo escolhido.</>,
      ],
    },
    {
      titulo: '1) Configurar certificado',
      itens: [
        <>Acesse a aba <strong>Certificado</strong>.</>,
        <>Escolha: certificado do Windows (recomendado) ou arquivo <code className="text-[11px]">.pfx</code>.</>,
        <>Se for <code className="text-[11px]">.pfx</code>, informe a senha.</>,
        <>O sistema trabalha em <strong>Produção</strong>.</>,
      ],
    },
    {
      titulo: '2) Listar chaves na SEFAZ',
      itens: [
        <>Vá para a aba <strong>Listagem</strong>.</>,
        <>Informe o período (data inicial e final).</>,
        <>Clique em <strong>Buscar</strong> para carregar as chaves de acesso.</>,
        <>A paginação é <strong>automática</strong> e continua até trazer tudo do período.</>,
        <>Durante a busca, aparece uma tela de progresso. Se precisar, use <strong>Cancelar busca</strong>.</>,
        <>Use filtros de emitente e texto para localizar o que precisa.</>,
      ],
    },
    {
      titulo: '3) Baixar XMLs em lote',
      itens: [
        <>Selecione as chaves desejadas.</>,
        <>Clique em <strong>Baixar XMLs</strong>.</>,
        <>Escolha a pasta de destino.</>,
        <>Escolha se o relatório XLSX será gerado <strong>agora</strong> ou <strong>depois</strong>.</>,
      ],
    },
    {
      titulo: '4) Baixar XML por chave única',
      itens: [
        <>Use a aba <strong>Download XML</strong>.</>,
        <>Digite a chave de 44 dígitos.</>,
        <>Faça o download do XML individual.</>,
      ],
    },
    {
      titulo: '5) Gerar relatório interno (XLSX)',
      itens: [
        <>Vá para a aba <strong>Relatório</strong>.</>,
        <>Selecione a pasta onde os XMLs da NFC-e estão salvos.</>,
        <>Veja a prévia dos arquivos e o total encontrado.</>,
        <>Clique em <strong>Gerar XLSX</strong> para criar os relatórios de aprovadas e canceladas.</>,
      ],
    },
  ]

  const observacoes: ReactNode[] = [
    <>Não feche o app durante busca ou download.</>,
    <>No módulo <strong>NF-e</strong>, a sincronização da <strong>Distribuição DFe</strong> baixa os XMLs em sequência e organiza em pastas por CNPJ/ano/mês.</>,
    <>O relatório XLSX já sai pronto para abrir no Excel, com dados de empresa, número, data e valor.</>,
    <>Se houver lentidão em períodos longos, aguarde a conclusão ou cancele e teste um intervalo menor.</>,
  ]

  return (
    <div className="fade-in h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Manual de uso</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Passo a passo rápido para usar o sistema sem complicação.
      </p>

      {secoes.map((secao) => (
        <ManualSection key={secao.titulo} titulo={secao.titulo} itens={secao.itens} />
      ))}
      <ManualSection titulo="Observações importantes" itens={observacoes} isLast />
    </div>
  )
}

