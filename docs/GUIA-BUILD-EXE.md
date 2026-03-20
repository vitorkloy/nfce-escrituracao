# Como gerar o executável (.exe)

## Pré-requisitos

1. **Node.js 20+** instalado ([nodejs.org](https://nodejs.org)).
2. Na pasta do projeto, instalar dependências **uma vez**:
   ```bash
   npm install
   ```

## Passo a passo (Windows)

1. **Ícones (obrigatório)**  
   Em **`public/`** deve existir **`icon.ico`** e **`icon.png`**, ou arquivos como **`NFC·e.ico`** / **`NFC·e.png`** (com `nfc` no nome), que o script copia para `icon.ico` e `icon.png`.  
   Não há geração automática de ícone — sem esses arquivos o build falha com mensagem clara.

2. **Versão do app (opcional)**  
   Edite **`"version"`** no `package.json` (ex.: `1.0.1`). O nome do instalador usará esse número.

3. **Gerar o instalador**  
   No PowerShell ou CMD, na raiz do projeto:
   ```bash
   npm run build
   ```
   Isso faz, em sequência:
   - sincroniza ícones (`NFC*.ico` / `NFC*.png` → `icon.ico` / `icon.png`) e valida que existem
   - compila o **Next.js** (pasta `out/`)
   - compila o **Electron** (pasta `dist-electron/`)
   - roda o **electron-builder** (instalador NSIS)

4. **Onde está o .exe**  
   Pasta **`release/`**, arquivo no formato:
   ```text
   Escrituração NFC-e Setup X.Y.Z.exe
   ```

## Comandos úteis

| Comando | O que faz |
|---------|-----------|
| `npm run dev` | Desenvolvimento (interface + Electron, sem instalador) |
| `npm run icons` | Só sincroniza/valida `icon.ico` e `icon.png` em `public/` |
| `npm run build:next` | Só o site estático (`out/`) |
| `npm run build:electron` | Só compila TypeScript do Electron (`dist-electron/`) |

## Problemas comuns

- **Erro ao compilar:** confira se está na pasta certa e rodou `npm install`.
- **Instalador grande (~100 MB+):** normal (inclui o Chromium do Electron).
- **Publicar no GitHub:** o `.exe` costuma ser **> 100 MB**; use **Releases** e anexe o arquivo, não o commit no repositório.
