'use client'

export function ManualPanel() {
  return (
    <div className="fade-in h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Manual de uso</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Passo a passo rápido para usar o sistema sem complicação.
      </p>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">0) Módulo NFC-e ou NF-e</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>
            Ao abrir, o sistema entra no módulo <strong>NFC-e</strong>. Se precisar, troque para <strong>NF-e</strong> na barra lateral.
          </li>
          <li>As telas e funções mudam de acordo com o módulo escolhido.</li>
        </ul>
      </section>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">1) Configurar certificado</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Acesse a aba <strong>Certificado</strong>.</li>
          <li>Escolha: certificado do Windows (recomendado) ou arquivo <code className="text-[11px]">.pfx</code>.</li>
          <li>Se for <code className="text-[11px]">.pfx</code>, informe a senha.</li>
          <li>O sistema trabalha em <strong>Produção</strong>.</li>
        </ul>
      </section>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">2) Listar chaves na SEFAZ</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Vá para a aba <strong>Listagem</strong>.</li>
          <li>Informe o período (data inicial e final).</li>
          <li>Clique em <strong>Buscar</strong> para carregar as chaves de acesso.</li>
          <li>
            A paginação é <strong>automática</strong> e continua até trazer tudo do período.
          </li>
          <li>
            Durante a busca, aparece uma tela de progresso. Se precisar, use <strong>Cancelar busca</strong>.
          </li>
          <li>Use filtros de emitente e texto para localizar o que precisa.</li>
        </ul>
      </section>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">3) Baixar XMLs em lote</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Selecione as chaves desejadas.</li>
          <li>Clique em <strong>Baixar XMLs</strong>.</li>
          <li>Escolha a pasta de destino.</li>
          <li>Escolha se o relatório XLSX será gerado <strong>agora</strong> ou <strong>depois</strong>.</li>
        </ul>
      </section>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">4) Baixar XML por chave única</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Use a aba <strong>Download XML</strong>.</li>
          <li>Digite a chave de 44 dígitos.</li>
          <li>Faça o download do XML individual.</li>
        </ul>
      </section>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">5) Gerar relatório interno (XLSX)</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Vá para a aba <strong>Relatório</strong>.</li>
          <li>Selecione a pasta onde os XMLs da NFC-e estão salvos.</li>
          <li>Veja a prévia dos arquivos e o total encontrado.</li>
          <li>
            Clique em <strong>Gerar XLSX</strong> para criar os relatórios de aprovadas e canceladas.
          </li>
        </ul>
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Observações importantes</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Não feche o app durante busca ou download.</li>
          <li>
            No módulo <strong>NF-e</strong>, a sincronização da <strong>Distribuição DFe</strong> baixa os XMLs em sequência
            e organiza em pastas por CNPJ/ano/mês.
          </li>
          <li>
            O relatório XLSX já sai pronto para abrir no Excel, com dados de empresa, número, data e valor.
          </li>
          <li>Se houver lentidão em períodos longos, aguarde a conclusão ou cancele e teste um intervalo menor.</li>
        </ul>
      </section>
    </div>
  )
}

