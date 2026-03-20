# Recursos do instalador (Electron)

## Ícones (obrigatório para `npm run build`)

O **electron-builder** usa estes nomes fixos:

- **`public/icon.ico`** — Windows (NSIS)
- **`public/icon.png`** — Linux (AppImage)

### Opção A — Arquivos da marca com nome “nfc”

Coloque na pasta **`public/`**, por exemplo:

- **`NFC·e.ico`** e **`NFC·e.png`**

O script **`sync-brand-icons.cjs`** (rodado automaticamente antes do build) copia para `icon.ico` e `icon.png`.

### Opção B — Nomes diretos

Renomeie os seus arquivos para **`icon.ico`** e **`icon.png`** e deixe-os em **`public/`**. Nesse caso o sync não altera nada; só confirma que os arquivos existem.

Se faltar **icon.ico** ou **icon.png**, o build **para** com mensagem de erro (não há geração automática de ícone).

## Ícone da janela e da barra de tarefas

O instalador embute **`icon.ico`** no `.exe`. Além disso, o **`electron-builder.yml`** copia `icon.ico` / `icon.png` para a pasta **`resources`** do app (`extraResources`), e o **`main.ts`** usa esse arquivo na opção **`icon`** do `BrowserWindow` (dev: lê direto de `public/`). Assim a janela e a taskbar acompanham o mesmo ícone do build.

## macOS (.icns)

Build no Windows não gera `.icns`. Para Mac com ícone customizado, use `iconutil` no macOS e configure em `electron-builder.yml`.

## Documentação geral

Versão do app e releases: [docs/VERSIONAMENTO.md](../docs/VERSIONAMENTO.md)
