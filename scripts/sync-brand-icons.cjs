/**
 * Copia ícones da marca em public/ (ex.: NFC·e.ico / NFC·e.png) para icon.ico e icon.png,
 * nomes que o electron-builder espera.
 *
 * Regra: qualquer *.ico que não seja icon.ico e cujo nome contenha "nfc" (ignorando maiúsculas),
 * ou, se não houver, o primeiro *.ico extra; o mesmo para *.png.
 *
 * Se você já mantém icon.ico e icon.png na pasta, nada é alterado (a verificação só confirma que existem).
 */
const fs = require('fs')
const path = require('path')

const PUBLIC = path.join(__dirname, '..', 'public')

function pickBrand(files, ext) {
  const list = files.filter(
    (f) => new RegExp(`\\.${ext}$`, 'i').test(f) && f.toLowerCase() !== `icon.${ext}`
  )
  const byNfc = list.find((f) => /nfc/i.test(f))
  return byNfc || list[0] || null
}

function main() {
  fs.mkdirSync(PUBLIC, { recursive: true })

  let files = []
  try {
    files = fs.readdirSync(PUBLIC)
  } catch {
    files = []
  }

  const brandIco = pickBrand(files, 'ico')
  const brandPng = pickBrand(files, 'png')

  if (brandIco) {
    const src = path.join(PUBLIC, brandIco)
    const dest = path.join(PUBLIC, 'icon.ico')
    fs.copyFileSync(src, dest)
    console.log('[icons] public/icon.ico ←', brandIco)
  }

  if (brandPng) {
    const src = path.join(PUBLIC, brandPng)
    const dest = path.join(PUBLIC, 'icon.png')
    fs.copyFileSync(src, dest)
    console.log('[icons] public/icon.png ←', brandPng)
  }

  const iconIco = path.join(PUBLIC, 'icon.ico')
  const iconPng = path.join(PUBLIC, 'icon.png')

  if (!fs.existsSync(iconIco)) {
    console.error(
      '[icons] Falta public/icon.ico.\n' +
        '  → Coloque um arquivo .ico com "nfc" no nome (ex.: NFC·e.ico) ou renomeie o seu para icon.ico'
    )
    process.exit(1)
  }

  if (!fs.existsSync(iconPng)) {
    console.error(
      '[icons] Falta public/icon.png.\n' +
        '  → Coloque um .png com "nfc" no nome (ex.: NFC·e.png) ou renomeie o seu para icon.png'
    )
    process.exit(1)
  }

  console.log('[icons] OK: icon.ico e icon.png prontos para o build.')
}

main()
