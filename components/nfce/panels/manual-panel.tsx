'use client'

export function ManualPanel() {
  return (
    <div className="fade-in h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Manual de uso</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Guia prático para usar o app de Escrituração NFC-e do início ao fim.
      </p>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">1) Configurar certificado</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Acesse a aba <strong>Certificado</strong>.</li>
          <li>Escolha a origem: repositório do sistema ou arquivo `.pfx`.</li>
          <li>Defina o ambiente: <strong>Homologação</strong> ou <strong>Produção</strong>.</li>
          <li>Se for arquivo, informe a senha do certificado.</li>
        </ul>
      </section>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">2) Listar chaves na SEFAZ</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Vá para a aba <strong>Listagem</strong>.</li>
          <li>Informe o período (data inicial e final).</li>
          <li>Clique em <strong>Buscar</strong> para carregar as chaves de acesso.</li>
          <li>Use filtros de emitente e texto para localizar o que precisa.</li>
        </ul>
      </section>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">3) Baixar XMLs em lote</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Selecione as chaves desejadas.</li>
          <li>Clique em <strong>Baixar XMLs</strong>.</li>
          <li>Escolha a pasta de destino.</li>
          <li>No modal, selecione se o relatório CSV deve ser gerado <strong>agora</strong> ou <strong>depois</strong>.</li>
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
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">5) Gerar relatório interno (CSV)</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Vá para a aba <strong>Relatório</strong>.</li>
          <li>Selecione a pasta onde os `*_nfce.xml` estão salvos.</li>
          <li>Veja a prévia dos arquivos e o total encontrado.</li>
          <li>Clique em <strong>Gerar CSV</strong> para criar `comparativo_nfce.csv`.</li>
        </ul>
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Observações importantes</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Não feche o app durante buscas ou downloads em andamento.</li>
          <li>O CSV contém: número do documento, data de emissão e valor do cupom.</li>
          <li>Para evitar problemas no Excel, abra o CSV preferencialmente como UTF-8.</li>
        </ul>
      </section>
    </div>
  )
}

