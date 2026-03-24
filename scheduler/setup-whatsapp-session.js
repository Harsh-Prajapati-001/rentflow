// scheduler/setup-whatsapp-session.js
// Run this ONCE locally to scan QR code and generate session data
// Then copy the output to GitHub Secret: WA_SESSION_DATA

import { Client, LocalAuth } from 'whatsapp-web.js'
import qrcode from 'qrcode-terminal'
import fs from 'fs'
import path from 'path'

const SESSION_DIR = path.join(process.cwd(), '.wwebjs_auth')

console.log('🔧 WhatsApp Session Setup')
console.log('═══════════════════════════════')
console.log('This script will show a QR code.')
console.log('Scan it with your WhatsApp to authenticate.')
console.log('Once authenticated, copy the session data to GitHub Secrets.\n')

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
  puppeteer: {
    headless: false, // Show browser window for easier QR scanning
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
})

client.on('qr', (qr) => {
  console.log('📱 Scan this QR code with WhatsApp:\n')
  qrcode.generate(qr, { small: true })
})

client.on('authenticated', (session) => {
  console.log('\n✅ Authenticated successfully!')
})

client.on('ready', async () => {
  console.log('✅ WhatsApp is ready!\n')
  console.log('📋 Now generating session export...')

  // Wait a moment for session files to be written
  await new Promise((r) => setTimeout(r, 3000))

  const sessionFile = path.join(SESSION_DIR, 'session', 'session.json')

  if (fs.existsSync(sessionFile)) {
    const sessionData = fs.readFileSync(sessionFile, 'utf8')
    const encoded = Buffer.from(sessionData).toString('base64')

    console.log('\n════════════════════════════════════════')
    console.log('📋 COPY THIS TO GitHub Secret: WA_SESSION_DATA')
    console.log('════════════════════════════════════════')
    console.log(encoded)
    console.log('════════════════════════════════════════')
    console.log('\nGo to: GitHub Repo → Settings → Secrets → New Secret')
    console.log('Name: WA_SESSION_DATA')
    console.log('Value: (paste the above)')
  } else {
    console.error('❌ Session file not found at', sessionFile)
    console.log('Files in auth dir:', fs.readdirSync(SESSION_DIR, { recursive: true }))
  }

  await client.destroy()
  process.exit(0)
})

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failed:', msg)
  process.exit(1)
})

client.initialize()
