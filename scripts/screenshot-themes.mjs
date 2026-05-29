import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'fs'

const OUT = 'scripts/screenshots'
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
const ctx     = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page    = await ctx.newPage()

// Inject theme directly via data-theme attribute + localStorage
async function setTheme(theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t)
    localStorage.setItem('kura-theme', t)
  }, theme)
  await page.waitForTimeout(300) // let CSS transitions settle
}

async function shot(name) {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`✓ ${name}`)
}

// Load app once
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 15000 })
await page.waitForTimeout(1200)

// ── Warm ───────────────────────────────────────────────────────────────────
await setTheme('warm')
await shot('home-warm')
await page.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' })
await setTheme('warm')
await shot('settings-warm')

// ── Cool ───────────────────────────────────────────────────────────────────
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await setTheme('cool')
await shot('home-cool')
await page.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' })
await setTheme('cool')
await shot('settings-cool')

// ── Dark ───────────────────────────────────────────────────────────────────
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' })
await setTheme('dark')
await shot('home-dark')
await page.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' })
await setTheme('dark')
await shot('settings-dark')

await browser.close()
console.log(`\nAll screenshots saved to ${OUT}/`)
