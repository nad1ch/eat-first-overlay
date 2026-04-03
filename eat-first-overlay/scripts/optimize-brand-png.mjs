/**
 * Стиснення бренд-PNG для вебу (оригінальна промальовка, менший ваговий розмір).
 * Джерело: повнорозмірні файли в public/ (або git restore). Запуск: npm run brand:png
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const pub = (...p) => path.join(root, 'public', ...p)

/** Макс. сторона для UI (~44px × 3× retina достатньо). */
const UI_MAX = 256
const PNG = { compressionLevel: 9, effort: 10 }

async function main() {
  const transparentPath = pub('brand-nad1ch-transparent.png')

  if (!fs.existsSync(transparentPath)) {
    console.error('Немає', transparentPath, '— git restore з історії.')
    process.exit(1)
  }

  let tBuf = await sharp(transparentPath).resize(UI_MAX, UI_MAX, { fit: 'inside', withoutEnlargement: true }).png(PNG).toBuffer()
  atomicWrite(transparentPath, tBuf)
  console.log('OK', 'brand-nad1ch-transparent.png', kb(tBuf))

  const fav192 = await sharp(tBuf)
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png(PNG)
    .toBuffer()
  atomicWrite(pub('favicon.png'), fav192)
  console.log('OK', 'favicon.png', kb(fav192))

  const apple = await sharp(tBuf)
    .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png(PNG)
    .toBuffer()
  atomicWrite(pub('apple-touch-icon.png'), apple)
  console.log('OK', 'apple-touch-icon.png', kb(apple))
}

/** Windows інколи дає UNKNOWN на прямий writeFile поверх відкритого файлу. */
function atomicWrite(dest, buf) {
  const tmp = `${dest}.${process.pid}.tmp`
  fs.writeFileSync(tmp, buf)
  fs.renameSync(tmp, dest)
}

function kb(buf) {
  return `${(buf.length / 1024).toFixed(1)} KB`
}

await main()
