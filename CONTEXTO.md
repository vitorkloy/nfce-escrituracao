# CONTEXTO COMPLETO — Escrituração Fiscal (SEFAZ-SP)

> Para alimentar o Cursor AI e continuar o desenvolvimento

---

## 1. VISÃO GERAL DO PROJETO

Aplicativo desktop (.exe) de escrituração fiscal com dois módulos: **NFC-e** e **NF-e**.
Stack: Electron + Next.js 14 + TypeScript
Escopo atual:
- **NFC-e (SEFAZ-SP):** listagem, download individual, download em lote e relatório XLSX.
- **NF-e (Ambiente Nacional):** Distribuição DFe, Recepção de Evento, sincronização por NSU e listagem de XMLs salvos.

---

## 2. ESTRUTURA DE ARQUIVOS

```
nfce-escrituracao/
├── electron/
│   ├── main.ts                 # Processo principal: janela, IPC handlers, certificados, NFC-e e NF-e
│   ├── preload.ts              # contextBridge — expõe window.electron ao renderer
│   ├── sefaz.ts                # Cliente SOAP NFC-e (SEFAZ-SP)
│   ├── nfe.ts                  # Cliente SOAP NF-e (AN): DistDFe + Recepção Evento
│   ├── nfe-dist-dfe-sync.ts    # Sincronização automática por NSU (NF-e)
│   ├── nfe-dist-dfe-parser.ts  # Parser de retDistDFeInt
│   ├── nfe-recepcao-evento-parser.ts
│   └── nfe-list-xmls-local.ts  # Leitura de XMLs salvos em disco
├── app/
│   ├── layout.tsx              # Layout raiz Next.js
│   ├── page.tsx                # Shell da UI com troca de módulo
│   └── globals.css             # CSS variables, IBM Plex fonts
├── components/nfce/
│   ├── shell/                  # Sidebar, seletor de módulo e navegação por módulo
│   └── panels/                 # Painéis NFC-e e NF-e (Dist DFe / Recepção evento / etc.)
├── package.json
├── next.config.mjs       # output: export
├── tsconfig.json
├── tsconfig.electron.json
├── electron-builder.yml
├── tailwind.config.js
└── postcss.config.js
```

---

## 3. ARQUITETURA / FLUXO

```
Renderer (Next.js)         Preload (contextBridge)      Main Process (Node.js)
──────────────────         ──────────────────────       ─────────────────────────
page.tsx                   window.electron.*      ───►  main.ts IPC handlers
  └─ useIsElectron()                                      └─ sefaz.ts
     retorna [bool, bool]                                   ├─ PowerShell (cert list)
     [isElectron, isMounted]                                ├─ Export-PfxCertificate
                                                            │   → /tmp/nfce_xxx.pfx
                                                            ├─ axios SOAP 1.2 mTLS
                                                            └─ fs.unlink (limpa pfx)
```

**Segurança:**
- **Repositório (store):** senha não necessária — certificado acessado pelo Windows; usa senha placeholder na exportação
- **Arquivo .pfx:** senha obrigatória via `$env:CERT_PASS`, nunca no script
- .pfx temporário existe apenas durante a chamada e é apagado imediatamente
- `rejectUnauthorized: false` — ICP-Brasil não está no bundle do Node.js
- Renderer não tem acesso ao Node.js, só ao que o preload expõe

---

## 4. SERVIÇOS SEFAZ-SP

**IMPORTANTE: Os webservices usam SOAP 1.2 (não 1.1)**

| Serviço | Produção |
|---------|----------|
| NFCeListagemChaves | nfce.fazenda.sp.gov.br/ws/NFCeListagemChaves.asmx |
| NFCeDownloadXML | nfce.fazenda.sp.gov.br/ws/NFCeDownloadXML.asmx |

---

## 5. ENVELOPE SOAP 1.2 CORRETO

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"
                 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/{acao}">
      {xml_dados}
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>
```

**Content-Type (SOAP 1.2):**
```
application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/{acao}/nfeDadosMsg"
```

Não usar SOAPAction como header separado — no SOAP 1.2 vai dentro do Content-Type.

---

## 6. XML DE ENTRADA (dados dentro do nfeDadosMsg)

### NFCeListagemChaves
```xml
<nfceListagemChaves versao="1.00">
  <tpAmb>1</tpAmb>                          <!-- Produção (fixo no app) -->
  <dataHoraInicial>2026-03-01T00:00</dataHoraInicial>   <!-- NT 2026: 16 chars AAAA-MM-DDThh:mm -->
  <dataHoraFinal>2026-03-18T23:59</dataHoraFinal>       <!-- opcional -->
</nfceListagemChaves>
```

**IMPORTANTE:** Não declarar xmlns dentro desse XML — o namespace já está no nfeDadosMsg pai.

### NFCeDownloadXML
```xml
<nfceDownloadXML versao="1.00">
  <tpAmb>1</tpAmb>
  <chNFCe>44 dígitos da chave de acesso</chNFCe>
</nfceDownloadXML>
```

---

## 7. CONFIGURAÇÃO DO CERTIFICADO

### Modo Repositório Windows (PowerShell)
- **Senha não necessária** — certificado desbloqueado pelo Windows
- Na exportação temporária, usa senha placeholder (não a do usuário)
- `configOk` para store = apenas `thumbprint`

```powershell
# Lista certificados com chave privada
Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.HasPrivateKey }

# Exporta com cadeia completa (ICP-Brasil intermediários)
Export-PfxCertificate -Cert $cert -FilePath "C:\tmp\cert.pfx" `
  -Password $pwd -Force -ChainOption BuildChain
```

**CRÍTICO:** Usar `-ChainOption BuildChain` para incluir CAs intermediárias da ICP-Brasil.
Se o Windows não suportar a flag, fallback sem ela.

### Modo Arquivo .pfx
- **Senha obrigatória** — validada antes de buscar/baixar
- `configOk` = `pfxPath` + `senha`

### Agente HTTPS (Node.js)
```typescript
new https.Agent({
  pfx: pfxBuffer,
  passphrase: senha,
  rejectUnauthorized: false, // ICP-Brasil não está no bundle do Node
  minVersion: 'TLSv1.2',
})
```

---

## 8. PROBLEMAS JÁ RESOLVIDOS (histórico)

1. **`dist-electron/main.js` não encontrado** → script `dev` precisava compilar TS antes: `tsc -p tsconfig.electron.json && concurrently ...`

2. **Erros TypeScript:**
   - `store.get('cert', null)` → `store.has("cert") ? store.get("cert") : null`
   - `parsed?.Envelope?.['Body']` → navegar em dois passos com cast explícito

3. **"API do Electron não disponível"** → `useIsElectron()` retornava `false` na primeira renderização (useEffect ainda não rodou). Solução: hook retorna `[isElectron, isMounted]` — só mostrar erro quando `isMounted=true`

4. **Senha aparecendo no toast de erro** → senha embutida no script PowerShell ia para `err.message`. Solução: passar senha via `$env:CERT_PASS` no `env` do execFileAsync

5. **Erro TLS ao conectar** → Node.js não tem CAs da ICP-Brasil. Solução: `rejectUnauthorized: false` + `-ChainOption BuildChain` na exportação

6. **HTTP 500 da SEFAZ** → estava usando SOAP 1.1. A SEFAZ-SP usa SOAP 1.2. Solução: mudar namespace, prefixo e Content-Type

7. **Conflito de namespace no XML** → XML interno declarava `xmlns` novamente. Solução: remover xmlns do elemento filho, pois herda do nfeDadosMsg

8. **Repositório vs arquivo** → No modo store, senha não é necessária (certificado desbloqueado pelo Windows). No modo .pfx, senha obrigatória. Campo de senha oculto quando store; `configOk` diferente para cada modo.

---

## 9. STATUS ATUAL

- Módulo **NFC-e** funcional: SOAP 1.2 (NFCeListagemChaves, NFCeDownloadXML), download em lote, relatório XLSX e paginação automática.
- Módulo **NF-e** funcional para os fluxos implementados: DistDFe (consulta XML livre/NSU), Recepção de Evento, sincronização automática por NSU e leitura de XMLs locais.
- Retry para ECONNRESET, EPIPE, ETIMEDOUT.
- `parseTagValue: false` para chave de 44 dígitos (evita notação científica).
- UX: overlay de loading com barra de progresso, confirmação ao fechar durante operação, validação de certificado e toasts com mensagem da SEFAZ.

---

## 10. PACKAGE.JSON (scripts)

```json
{
  "scripts": {
    "dev": "tsc -p tsconfig.electron.json && concurrently -k \"next dev\" \"tsc -p tsconfig.electron.json --watch\" \"wait-on http://localhost:3000 && electron .\"",
    "icons": "node scripts/sync-brand-icons.cjs",
    "build": "node scripts/sync-brand-icons.cjs && next build && tsc -p tsconfig.electron.json && electron-builder",
    "build:next": "next build",
    "build:electron": "tsc -p tsconfig.electron.json",
    "dist": "npm run build",
    "wsdl": "node scripts/buscar-wsdl.js",
    "diagnostico:listagem": "node scripts/diagnostico-listagem.cjs"
  }
}
```

`npm run wsdl -- "caminho.pfx" "senha" producao` — busca WSDL com certificado para diagnóstico.

---

## 11. CÓDIGOS DE RETORNO DA SEFAZ

### NFCeListagemChaves
| cStat | Descrição |
|-------|-----------|
| 100 | Sucesso |
| 101 | Lista incompleta — paginar usando dhEmisUltNfce |
| 107 | Sem registros no período |
| 102 | Versão não suportada |
| 103 | tpAmb inválido |
| 104 | dataHoraInicial > 100 dias atrás |
| 110 | dataHoraFinal < dataHoraInicial |
| 656 | Rate limit |

### NFCeDownloadXML
| cStat | Descrição |
|-------|-----------|
| 200 | Sucesso |
| 203 | CNPJ da chave ≠ CNPJ do certificado |
| 204 | Chave inválida |
| 205 | Chave não encontrada |
| 207 | NFC-e > 100 dias |

---

## 12. PONTOS DE ATENÇÃO PARA CONTINUAR

1. **Testar retorno SOAP 1.2** — confirmar se chega cStat=100 ou algum erro de schema
2. **Parse da resposta** — o XML de retorno vem dentro de envelope SOAP 1.2, o parser usa `fast-xml-parser` com `removeNSPrefix: true`
3. **Paginação automática** — quando cStat=101, usa `dhEmisUltNfce` como novo `dataHoraInicial`, limitado a MAX_PAGINAS=200
4. **Download em lote** — o .pfx temporário é exportado UMA vez e reutilizado para todas as chaves do lote, depois apagado no `finally`
5. **Logs de debug** — usar `DEBUG=sefaz` para ativar; desativados em produção

---

## 12.1 DOCUMENTAÇÃO DE REFERÊNCIA (build e versão)

- Build do instalador: `docs/GUIA-BUILD-EXE.md`
- Versionamento do app: `docs/VERSIONAMENTO.md`

---

## 13. DEPENDÊNCIAS

```json
{
  "dependencies": {
    "axios": "^1.7.2",
    "electron-store": "^8.2.0",
    "exceljs": "^4.4.0",
    "fast-xml-parser": "^4.4.0",
    "ionicons": "^8.0.13",
    "next": "14.2.5",
    "next-themes": "^0.4.6",
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "electron": "^31.2.1",
    "electron-builder": "^24.13.3",
    "typescript": "^5.5.3",
    "concurrently": "^8.2.2",
    "wait-on": "^7.2.0",
    "tailwindcss": "^3.4.6"
  }
}
```
