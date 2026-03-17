# SAE-NFC-e — Sistema de Apoio à Escrituração da NFC-e

Aplicativo desktop para consultar e baixar os XMLs das NFC-e emitidas junto à SEFAZ-SP, usando certificado digital e-CNPJ instalado na máquina do usuário.

**SEFAZ-SP · Nota Técnica 2026 · v1.0.0**

---

## Funcionalidades

- **Leitura automática** dos certificados instalados no Windows
- **Autenticação mTLS** — o certificado nunca sai do computador
- **Listagem de chaves** (NFCeListagemChaves) com paginação automática
- **Download de XML** + eventos (NFCeDownloadXML)
- **Download em lote** de múltiplas NFC-e de uma vez
- **Suporte** a Homologação e Produção

## Tecnologias

| Camada      | Stack              |
|------------|--------------------|
| Interface  | Next.js 14, React, Tailwind CSS |
| Desktop    | Electron 31        |
| Linguagem  | TypeScript         |
| Serviços   | SOAP mTLS (SEFAZ-SP) |

## Pré-requisitos

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Windows 10/11** (para leitura do repositório de certificados)
- **Certificado e-CNPJ A1** instalado como exportável no repositório pessoal

## Instalação

```bash
# 1. Clonar ou descompactar o projeto
cd nfce-escrituracao

# 2. Instalar dependências
npm install

# 3. Rodar em desenvolvimento
npm run dev

# 4. Gerar instalador .exe
npm run build
```

O instalador NSIS ficará em `release/`.

## Estrutura do Projeto

```
nfce-escrituracao/
├── electron/           # Processo principal Electron
│   ├── main.ts         # Janela + IPC handlers
│   ├── preload.ts      # contextBridge
│   ├── sefaz.ts        # Cliente SOAP mTLS
│   └── electron.d.ts   # Tipos TypeScript
├── app/                # Interface Next.js
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── package.json
├── next.config.mjs
├── electron-builder.yml
└── MANUAL.md           # Manual do usuário
```

## Segurança

- O arquivo `.pfx` temporário existe apenas durante a chamada à SEFAZ
- A **senha nunca é salva** em disco
- O renderer não tem acesso ao certificado ou à senha

## Licença

Uso conforme regulamentação da SEFAZ-SP.
