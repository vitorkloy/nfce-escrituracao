# ⬡ Escrituração NFC-e — SEFAZ-SP

> Cliente desktop para os **Serviços de Apoio à Escrituração da NFC-e**, conforme a Nota Técnica 2026 (SAE-NFC-e v1.0.0).  
> Construído com **Electron + Next.js + TypeScript**.

---

## ✨ Funcionalidades

- 🔑 **Leitura automática** de certificados instalados no Windows (repositório pessoal) — **sem senha**
- 📁 **Arquivo .pfx** — modo alternativo com senha obrigatória
- 🔒 **Autenticação mTLS** — o e-CNPJ nunca sai da máquina do usuário
- 📋 **Listagem de chaves** (NFCeListagemChaves) com paginação automática para listas > 2.000
- ⬇️ **Download de XML** completo + eventos (NFCeDownloadXML)
- 📦 **Download em lote** — selecione N chaves e baixe todos os XMLs de uma vez
- 📊 **Barra de progresso** durante busca e download — bloqueia interação e avisa ao fechar
- 🌍 Suporte a **Homologação** e **Produção**

---

## 🏗️ Arquitetura

```
Renderer (Next.js)              Processo Principal (Node.js)
──────────────────              ─────────────────────────────────────
app/page.tsx                    electron/main.ts
  │                               ├─ IPC handlers
  └─ window.electron.*  ──────►  electron/preload.ts  (contextBridge)
       (IPC seguro)              electron/sefaz.ts
                                   ├─ PowerShell → lista certs Windows
                                   ├─ Export-PfxCertificate → /tmp/*.pfx
                                   ├─ axios.post mTLS → SEFAZ-SP
                                   └─ fs.unlink → apaga .pfx imediatamente
```

> O renderer **nunca** tem acesso direto ao certificado, sistema de arquivos ou rede.  
> A senha do certificado **nunca** é salva em disco.

---

## 📁 Estrutura de arquivos

```
nfce-escrituracao/
├── electron/
│   ├── main.ts                # Janela Electron + todos os IPC handlers
│   ├── preload.ts             # contextBridge — API segura para o renderer
│   ├── sefaz.ts               # Cliente SOAP: mTLS, XML, paginação
│   └── electron.d.ts          # Tipos TypeScript para window.electron
│
├── app/
│   ├── layout.tsx             # Layout raiz Next.js
│   ├── page.tsx               # UI: sidebar + Certificado / Listagem / Download
│   └── globals.css            # Design tokens (IBM Plex, CSS variables)
│
├── package.json
├── next.config.mjs            # output: export (estático para Electron)
├── tsconfig.json              # TypeScript → Next.js
├── tsconfig.electron.json     # TypeScript → Electron (CommonJS)
├── electron-builder.yml       # Config do instalador .exe
├── tailwind.config.js
└── postcss.config.js
```

---

## 🚀 Início rápido

### Pré-requisitos

| Requisito | Versão |
|-----------|--------|
| Node.js | 20+ |
| npm | 10+ |
| Windows | 10 / 11 |
| Certificado e-CNPJ A1 | Instalado como **exportável** |

### Instalar

```bash
npm install
```

### Desenvolver

```bash
npm run dev
```

Abre o Next.js em `localhost:3000` e o Electron apontando para ele. DevTools abre automaticamente.

Para ver logs detalhados das requisições SOAP à SEFAZ (envelope enviado e resposta):

```bash
# Linux/macOS
DEBUG=sefaz npm run dev

# Windows (PowerShell)
$env:DEBUG="sefaz"; npm run dev
```

**Em caso de HTTP 500:** O app exibe a mensagem de erro retornada pela SEFAZ (quando disponível em XML). Rode com `DEBUG=sefaz` e verifique no console do Electron o envelope enviado e a resposta completa para diagnóstico.

### Versão do aplicativo

A versão exibida no app e no nome do `.exe` vem só do campo **`version`** em `package.json`. Fluxo completo: [docs/VERSIONAMENTO.md](docs/VERSIONAMENTO.md).

### Gerar instalador `.exe`

**Passo a passo completo:** [docs/GUIA-BUILD-EXE.md](docs/GUIA-BUILD-EXE.md)

**Ícones:** obrigatórios em `public/` — `icon.ico` e `icon.png`, ou arquivos com `nfc` no nome (ex.: `NFC·e.ico` / `NFC·e.png`) que o build copia para esses nomes. Ver `public/README.md`.

```bash
npm run build
# → release/Escrituração NFC-e Setup x.x.x.exe
```

**Requisitos:** Node 20+, Windows x64 para o instalador NSIS. Ícones: veja `public/README.md`.

---

## 🔐 Certificado Digital

### Modo A — Repositório do Sistema *(recomendado)*

O app lista os certificados com chave privada do repositório do Windows. **Senha não necessária** — o certificado é acessado diretamente pelo sistema.

> ⚠️ O certificado precisa ter sido instalado como **exportável**.  
> Verifique em: `certmgr.msc → Pessoal → Certificados`

### Modo B — Arquivo `.pfx`

Selecione o arquivo manualmente. **Senha obrigatória** — use o botão Verificar para validar antes de buscar ou baixar.

---

## 📡 Serviços SEFAZ-SP

| Serviço | Homologação | Produção |
|---------|-------------|----------|
| NFCeListagemChaves | `homologacao.nfce.fazenda.sp.gov.br/ws/...` | `nfce.fazenda.sp.gov.br/ws/...` |
| NFCeDownloadXML | `homologacao.nfce.fazenda.sp.gov.br/ws/...` | `nfce.fazenda.sp.gov.br/ws/...` |

**Limites:**
- Máximo **2.000 chaves** por consulta (app pagina automaticamente com `cStat 101`)
- Máximo **100 dias** de histórico
- Rate limit por IP → `cStat 656`

---

## 📊 Códigos de retorno

### NFCeListagemChaves

| cStat | Descrição |
|-------|-----------|
| `100` | ✅ Sucesso |
| `101` | ⚠️ Lista incompleta — paginação automática ativada |
| `107` | ℹ️ Sem registros no período |
| `104` | ❌ dataHoraInicial anterior a 100 dias |
| `110` | ❌ dataHoraFinal anterior a dataHoraInicial |
| `656` | ❌ Rate limit (consumo indevido) |

### NFCeDownloadXML

| cStat | Descrição |
|-------|-----------|
| `200` | ✅ Sucesso |
| `203` | ❌ CNPJ da chave ≠ CNPJ do certificado |
| `204` | ❌ Chave inválida |
| `205` | ❌ Chave não encontrada |
| `207` | ❌ NFC-e anterior a 100 dias |

---

## 🔧 Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento (Next.js + Electron juntos) |
| `npm run icons` | Gera `public/icon.ico` e `public/icon.png` |
| `npm run build` | Ícones + Next + Electron + instalador .exe |
| `npm run build:next` | Build apenas do Next.js |
| `npm run build:electron` | Compila apenas os arquivos Electron |
| `npm run wsdl` | Busca WSDL com certificado (diagnóstico): `npm run wsdl -- "caminho.pfx" "senha" producao` |

---

## 🛡️ Segurança

- O arquivo `.pfx` temporário é **criado e apagado na mesma operação** (pasta `%TEMP%`)
- A **senha nunca é gravada** em nenhum arquivo ou banco de dados
- **Repositório:** senha não é necessária (certificado acessado pelo Windows)
- **Arquivo .pfx:** senha obrigatória e validada antes do uso
- O renderer (Next.js) opera em **sandbox** — sem acesso a Node.js, rede ou disco
- Toda comunicação com a SEFAZ usa **mTLS** com o certificado do próprio usuário

---

## 📎 Referências

- [Nota Técnica 2026 — SAE-NFC-e v1.0.0](https://www.nfe.fazenda.gov.br)
- [Manual de Orientação do Contribuinte v7.00](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BOg6sgVDdeQ=)
- [Portal NFC-e SEFAZ-SP](https://nfce.fazenda.sp.gov.br)
