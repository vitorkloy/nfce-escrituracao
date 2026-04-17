# Controle de versão do aplicativo

## Fonte única: `package.json`

O campo **`version`** (semver: `MAIOR.MENOR.PATCH`) é a referência para:

| Onde entra | Como |
|------------|------|
| **Nome do instalador** | `electron-builder` usa `productName` → `Escrituração Fiscal - eFis Setup X.Y.Z.exe` |
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

- O rótulo **SAE-\*** mostrado na UI identifica a versão interna/módulo exibida na interface e pode mudar conforme release.
- A versão do **instalador/app** continua sendo exclusivamente o campo **`version`** do `package.json`.
- **`VERSAO` em `electron/sefaz.ts`** = versão do **XML** enviado aos webservices (`1.00`), definida pela NT — independente da versão do app.

---

## CI/CD e atualização automática

- **GitHub Actions** (`.github/workflows/release.yml`): em cada `push` na `main` cujo commit **não** contenha `[skip ci]`, o workflow incrementa o **patch** em `package.json`, roda `npm run release:win` e publica o instalador e o **`latest.yml`** no **GitHub Releases** (`electron-builder` + `GH_TOKEN`).
- O commit automático do bump inclui **`[skip ci]`** para não disparar o workflow em loop.
- No app empacotado, **`electron-updater`** consulta essas releases e exibe o modal de atualização (baixar + instalar). Em `npm run dev` a checagem é ignorada no processo principal.

Se a branch `main` estiver **protegida** contra push direto do `GITHUB_TOKEN`, configure um secret (PAT com `repo`) e use no passo de `git push`, ou ajuste as regras da branch.
