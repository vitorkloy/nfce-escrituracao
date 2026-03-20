# Recursos do instalador (Electron)

- **`icon.ico`** — Windows (NSIS). Gerado por `npm run icons` ou automaticamente em `npm run build`.
- **`icon.png`** — Linux (AppImage) e referência visual.

Para trocar o ícone da marca: substitua os arquivos acima (recomendado: PNG 256×256 e ICO com vários tamanhos) ou ajuste as cores em `scripts/generate-app-icons.cjs` e rode `npm run icons`.

**macOS (.icns):** o `electron-builder` no Windows não gera `.icns`. Para build Mac com ícone customizado, gere `icon.icns` no Mac (`iconutil`) e descomente `icon: public/icon.icns` em `electron-builder.yml`.
