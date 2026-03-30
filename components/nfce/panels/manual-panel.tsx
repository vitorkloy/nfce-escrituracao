'use client'

export function ManualPanel() {
  return (
    <div className="fade-in h-full overflow-auto p-6">
      <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">Manual de uso</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6">
        Guia prático do aplicativo Escrituração Fiscal, do início ao fim.
      </p>

      <section className="mb-5 rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">0) Escolher módulo</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>
            A cada abertura do aplicativo você escolhe <strong>NFC-e</strong> ou <strong>NF-e</strong> — a opção{' '}
            <strong>não é gravada</strong> no disco.
          </li>
          <li>Durante o uso, o seletor na barra lateral permite alternar entre os dois módulos.</li>
          <li>A navegação e as funções mudam conforme o módulo ativo.</li>
        </ul>
      </section>

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
          <li>No modal, selecione se o relatório XLSX deve ser gerado <strong>agora</strong> ou <strong>depois</strong>.</li>
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
          <li>Selecione a pasta onde os `*_nfce.xml` estão salvos.</li>
          <li>Veja a prévia dos arquivos e o total encontrado.</li>
          <li>
            Clique em <strong>Gerar XLSX</strong> para criar `comparativo_aprovado.xlsx` e
            `comparativo_cancelamento.xlsx`.
          </li>
        </ul>
      </section>

      <section className="rounded border border-[var(--border)] bg-[var(--bg-surface)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Observações importantes</h3>
        <ul className="list-disc pl-5 text-sm text-[var(--text-secondary)] space-y-1">
          <li>Não feche o app durante buscas ou downloads em andamento.</li>
          <li>
            No módulo <strong>NF-e</strong> há <strong>NFeDistribuicaoDFe</strong> e{' '}
            <strong>NFeRecepcaoEvento4</strong> (produção AN). Em <strong>Distribuição DFe</strong>, use{' '}
            <strong>Sincronização automática</strong> para baixar XMLs em loop (NSU), gravar em{' '}
            <code className="text-[11px]">pasta/CNPJ/ano/mês/chave.xml</code>, pular arquivos já existentes e guardar o
            último NSU em <code className="text-[11px]">.nfe-dist-state.json</code>. Há também consulta única por NSU, XML
            livre e a aba <strong>Arquivos salvos</strong> para listar e abrir XMLs locais.
          </li>
          <li>
            O XLSX inclui uma linha inicial com <strong>EMPRESA</strong> e <strong>CNPJ</strong> (extraídos do XML),
            cabeçalho estilizado e colunas número do documento, data de emissão e valor do cupom.
          </li>
          <li>O arquivo já abre formatado no Excel, sem precisar importar como texto.</li>
        </ul>
      </section>
    </div>
  )
}

