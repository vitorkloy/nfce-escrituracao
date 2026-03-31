#!/usr/bin/env node
/**
 * Busca o WSDL do NFCeListagemChaves usando o certificado digital.
 * Uso: node scripts/buscar-wsdl.js <caminho.pfx> <senha>
 *
 * O WSDL contém o SoapAction correto. Procure por "soapaction" ou "action" no output.
 */
const https = require('https')
const fs = require('fs')

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('Uso: node scripts/buscar-wsdl.js <caminho.pfx> <senha>')
  process.exit(1)
}

const [pfxPath, senha] = args
const baseUrl = 'https://nfce.fazenda.sp.gov.br/ws/NFCeListagemChaves.asmx'

const pfx = fs.readFileSync(pfxPath)
const agent = new https.Agent({
  pfx,
  passphrase: senha,
  rejectUnauthorized: false,
  minVersion: 'TLSv1.2',
})

const url = new URL(baseUrl)
url.search = '?wsdl'

const req = https.get(
  {
    hostname: url.hostname,
    path: url.pathname + url.search,
    agent,
  },
  (res) => {
    let data = ''
    res.on('data', (chunk) => { data += chunk })
    res.on('end', () => {
      if (res.statusCode !== 200) {
        console.error('HTTP', res.statusCode)
        console.error(data.substring(0, 2000))
        process.exit(1)
      }
      console.log('--- WSDL (trechos com soapaction/action) ---\n')
      const lines = data.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (/soapaction|soap:action|action=/i.test(line)) {
          console.log(`${i + 1}: ${line.trim()}`)
        }
      }
      console.log('\n--- Fim ---')
      console.log('\nWSDL completo salvo em: wsdl-listagem.xml')
      fs.writeFileSync('wsdl-listagem.xml', data)
    })
  }
)
req.on('error', (e) => {
  console.error('Erro:', e.message)
  process.exit(1)
})
