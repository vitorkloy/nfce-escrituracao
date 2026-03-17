# Manual do Usuário — SAE-NFC-e

Sistema de Apoio à Escrituração da NFC-e · SEFAZ-SP · v1.0.0

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Instalação](#2-instalação)
3. [Configuração do certificado](#3-configuração-do-certificado)
4. [Listagem de chaves](#4-listagem-de-chaves)
5. [Download de XML](#5-download-de-xml)
6. [Códigos de retorno (cStat)](#6-códigos-de-retorno-cstat)
7. [Solução de problemas](#7-solução-de-problemas)

---

## 1. Visão geral

O **SAE-NFC-e** é um aplicativo desktop que permite:

- Consultar as chaves das NFC-e emitidas no período
- Baixar os XMLs das notas e dos eventos
- Fazer download em lote de várias NFC-e de uma vez

Toda a comunicação com a SEFAZ-SP usa o seu **certificado digital e-CNPJ**, que permanece no seu computador.

### Limites da SEFAZ

| Limite | Valor |
|-------|-------|
| Chaves por consulta | Máx. 2.000 (cStat 101 = lista incompleta) |
| Histórico | Máx. 100 dias |
| Rate limit | cStat 656 — aguarde e tente novamente |

---

## 2. Instalação

### Requisitos

- Windows 10 ou 11
- Node.js 20 ou superior
- Certificado e-CNPJ A1 instalado como **exportável**

### Passos

1. **Descompacte** ou clone o projeto na pasta `nfce-escrituracao/`.

2. **Instale as dependências:**
   ```bash
   cd nfce-escrituracao
   npm install
   ```

3. **Execute o aplicativo:**
   ```bash
   npm run dev
   ```
   Aguarde cerca de 5 segundos para o Next.js compilar. O Electron abrirá automaticamente.

4. **Para gerar o instalador .exe:**
   ```bash
   npm run build
   ```
   O instalador ficará na pasta `release/`.

---

## 3. Configuração do certificado

Antes de usar a listagem ou o download, configure o certificado na aba **Certificado**.

### Modo A: Repositório do sistema (recomendado)

1. Na aba **Certificado**, selecione **Repositório do sistema**.
2. O aplicativo lista os certificados do repositório pessoal do Windows.
3. **Clique** no certificado desejado.
4. **Digite a senha** do certificado.
5. Clique em **Testar** para validar.
6. Selecione o **ambiente** (Homologação ou Produção).
7. Clique em **Salvar configuração**.

> **Importante:** O certificado precisa estar marcado como **exportável**.  
> Para verificar: `certmgr.msc` → Pessoal → Certificados → duplo clique no certificado → aba Detalhes → Propriedades da chave privada.

### Modo B: Arquivo .pfx

1. Na aba **Certificado**, selecione **Arquivo .pfx**.
2. Clique em **Procurar** e escolha o arquivo `.pfx` ou `.p12`.
3. Digite a senha.
4. Selecione o ambiente e clique em **Salvar configuração**.

### Segurança

- A senha **nunca é salva** em disco.
- O arquivo `.pfx` temporário é apagado logo após cada consulta à SEFAZ.

---

## 4. Listagem de chaves

Na aba **Listagem**:

1. Informe **Data inicial** e **Data final** (máximo 100 dias de intervalo).
2. Mantenha **Paginação automática** ativada para buscar mais de 2.000 chaves.
3. Clique em **Buscar**.
4. Selecione as chaves desejadas (checkbox ou selecionar todas).
5. Clique em **Baixar XMLs (N)** para download em lote.
6. Escolha a pasta de destino.

### Dicas

- Use o filtro de texto para localizar chaves específicas.
- A paginação automática busca todas as chaves do período, mesmo acima de 2.000.

---

## 5. Download de XML

Na aba **Download XML**:

1. Cole a **chave de acesso** de 44 dígitos.
2. Pressione **Enter** ou clique em **Baixar**.
3. Após o retorno, clique em **Salvar XML** para gravar o arquivo em disco.

Você pode copiar a chave da tela de Listagem ou de outro sistema.

---

## 6. Códigos de retorno (cStat)

### NFCeListagemChaves

| cStat | Significado |
|-------|-------------|
| 100 | Consulta realizada com sucesso |
| 101 | Lista incompleta — ative a paginação automática |
| 102 | Versão do layout não suportada |
| 103 | Tipo de ambiente inválido |
| 104 | Data inicial anterior ao limite de 100 dias |
| 107 | Sem registros no período |
| 108 | Serviço paralisado momentaneamente |
| 109 | Serviço paralisado sem previsão |
| 110 | Data final anterior à data inicial |
| 282 | Certificado sem CNPJ |
| 285 | Certificado difere ICP-Brasil |
| 656 | Rate limit — aguarde e tente novamente |
| 999 | Erro não catalogado |

### NFCeDownloadXML

| cStat | Significado |
|-------|-------------|
| 200 | Download realizado com sucesso |
| 201 | Versão do layout não suportada |
| 202 | Tipo de ambiente inválido |
| 203 | CNPJ da chave difere do CNPJ do certificado |
| 204 | Chave inválida (formato incorreto) |
| 205 | Chave não encontrada na SEFAZ |
| 207 | NFC-e anterior ao limite de 100 dias |
| 282 | Certificado sem CNPJ |
| 285 | Certificado difere ICP-Brasil |
| 656 | Rate limit — aguarde e tente novamente |
| 999 | Erro não catalogado |

---

## 7. Solução de problemas

### Certificado não aparece na lista

- Verifique se está em **Repositório Pessoal** (não em Computador Local).
- Abra `certmgr.msc` → Pessoal → Certificados.

### Erro ao exportar certificado

- Reinstale o e-CNPJ marcando **"Marcar esta chave como exportável"**.
- Ou use o modo **Arquivo .pfx**.

### cStat 203 — CNPJ diferente

- O CNPJ do certificado deve ser o mesmo emissor das NFC-e consultadas.

### cStat 656 — Rate limit

- Aguarde alguns minutos e tente novamente.
- A SEFAZ limita o número de consultas por IP.

### Lista incompleta (cStat 101)

- Ative **Paginação automática** — o app busca automaticamente as demais chaves.

### npm run dev não abre o Electron

- Aguarde cerca de 5 segundos para o Next.js compilar em `localhost:3000`.

### Build falha

Execute em etapas:

```bash
npm run build:next
node node_modules/typescript/bin/tsc -p tsconfig.electron.json
npx electron-builder
```

---

*SAE-NFC-e v1.0.0 · SEFAZ-SP · Nota Técnica 2026*
