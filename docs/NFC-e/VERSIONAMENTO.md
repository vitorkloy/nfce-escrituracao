# Controle de versão do aplicativo

## Fonte única: `package.json`

O campo **`version`** (semver: `MAIOR.MENOR.PATCH`) é a referência para:

| Onde entra | Como |
|------------|------|
| **Nome do instalador** | `electron-builder` usa `productName` → `Escrituração Fiscal Setup X.Y.Z.exe` |
| **Metadados do app** | Electron `app.getVersion()` no processo principal |
| **Interface** | Rodapé da sidebar mostra **App vX.Y.Z** (via IPC `app:get-version`) |
| **Git** | Tag opcional `vX.Y.Z` alinhada à mesma versão |

**Não** duplique versão em outro arquivo sem automatizar (evita divergência).

---

## Quando subir versão

| Tipo | Exemplo | Quando |
|------|---------|--------|
| **PATCH** | `1.0.0` → `1.0.1` | Correções, ajustes pequenos |
| **MINOR** | `1.0.1` → `1.1.0` | Funcionalidade nova compatível |
| **MAJOR** | `1.x` → `2.0.0` | Mudança grande / quebra de compatibilidade |

Fluxo sugerido:

1. Atualize `"version"` em **`package.json`** (e rode `npm install` se quiser lock alinhado só ao meta — opcional).
2. Registre mudanças em **`CHANGELOG.md`** (criar se ainda não existir).
3. Commit: `chore: release v1.0.1` (ou `fix:` / `feat:` conforme o caso).
4. Tag Git: `git tag v1.0.1 && git push origin v1.0.1`
5. `npm run build` → gerar o `.exe` em `release/`.
6. Publicar o binário em **GitHub Releases** (ou outro canal) com a mesma tag — o `.exe` não vai no repositório (limite de tamanho).

---

## O que não é versão do app

- **SAE-NFC-e v1.0.0** na UI = versão da **especificação / nota técnica** da SEFAZ, não do seu instalador.
- **`VERSAO` em `electron/sefaz.ts`** = versão do **XML** enviado aos webservices (`1.00`), definida pela NT — independente da versão do app.

---

## Atualização automática (futuro)

Para o app **baixar e instalar** novas versões sozinho, seria necessário integrar algo como **`electron-updater`** + hospedar metadados (ex.: `latest.yml` no GitHub Releases). Não está implementado hoje; o fluxo atual é **instalador manual** por release.
