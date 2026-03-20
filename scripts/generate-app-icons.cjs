/**
 * Gera public/icon.png (256) e public/icon.ico (multi-resolução) para o electron-builder.
 * Executado automaticamente antes de `npm run build`.
 */
const fs = require('fs')
const path = require('path')

const PUBLIC = path.join(__dirname, '..', 'public')

async function main() {
  let sharp, pngToIco
  try {
    sharp = require('sharp')
    pngToIco = require('png-to-ico')
  } catch (e) {
    console.warn(
      '[icons] sharp ou png-to-ico não instalados. Rode: npm install\n' +
        (e && e.message ? e.message : '')
    )
    process.exit(0)
  }

  fs.mkdirSync(PUBLIC, { recursive: true })

  const bg = { r: 13, g: 148, b: 136, alpha: 1 } // teal alinhado ao tema do app
  const sizes = [16, 32, 48, 64, 128, 256]

  const buffers = await Promise.all(
    sizes.map((s) =>
      sharp({
        create: {
          width: s,
          height: s,
          channels: 4,
          background: bg,
        },
      })
        .png()
        .toBuffer()
    )
  )

  const png256 = buffers[sizes.indexOf(256)]
  await fs.promises.writeFile(path.join(PUBLIC, 'icon.png'), png256)

  const icoBuffer = await pngToIco(buffers)
  await fs.promises.writeFile(path.join(PUBLIC, 'icon.ico'), icoBuffer)

  console.log('[icons] Gerados: public/icon.png, public/icon.ico')
}

main().catch((err) => {
  console.error('[icons] Falha:', err)
  process.exit(1)
})
