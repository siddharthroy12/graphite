/**
 * Regenerates the app icons from `build/icon.svg`.
 *
 *   npm run icons
 *
 * Rasterises the SVG with the project's own Electron (so there's no image
 * dependency to install), then builds the platform containers:
 *
 *   build/icon.icns  macOS      via iconutil
 *   build/icon.ico   Windows    PNG-payload ICO, written here
 *   build/icon.png   Linux      512x512
 *
 * macOS only: `sips` and `iconutil` are system tools. The generated files are
 * committed, so this only needs running when the SVG changes.
 */
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const BUILD = path.join(ROOT, 'build')
const SVG = path.join(BUILD, 'icon.svg')
const MASTER = 1024

/** macOS .iconset members: [pixel size, filename]. */
const ICONSET = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]

const ICO_SIZES = [16, 32, 48, 64, 128, 256]

function resize(source, size, destination) {
  execFileSync('sips', ['-z', String(size), String(size), source, '--out', destination], {
    stdio: 'ignore'
  })
}

/** ICO is a directory of embedded PNGs; Windows has read these since Vista. */
function writeIco(pngPaths, destination) {
  const images = pngPaths.map(({ size, file }) => ({ size, buf: fs.readFileSync(file) }))

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length

  images.forEach((image, index) => {
    const at = index * 16
    // 256 is encoded as 0 — the field is a single byte.
    const dimension = image.size >= 256 ? 0 : image.size
    directory.writeUInt8(dimension, at)
    directory.writeUInt8(dimension, at + 1)
    directory.writeUInt8(0, at + 2) // palette size
    directory.writeUInt8(0, at + 3) // reserved
    directory.writeUInt16LE(1, at + 4) // colour planes
    directory.writeUInt16LE(32, at + 6) // bits per pixel
    directory.writeUInt32LE(image.buf.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += image.buf.length
  })

  fs.writeFileSync(destination, Buffer.concat([header, directory, ...images.map((i) => i.buf)]))
}

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SVG, 'utf8')
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'graphite-icons-'))

  const window = new BrowserWindow({
    width: MASTER,
    height: MASTER,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    useContentSize: true,
    webPreferences: { offscreen: true }
  })

  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent;width:${MASTER}px;height:${MASTER}px;overflow:hidden}
    svg{display:block;width:${MASTER}px;height:${MASTER}px}
  </style>${svg}`

  await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  // Let the compositor settle before grabbing the frame.
  await new Promise((resolve) => setTimeout(resolve, 700))

  const png = (await window.webContents.capturePage()).toPNG()
  if (png.length < 2000) {
    console.error('Rasterised image looks empty — aborting.')
    app.exit(1)
    return
  }

  const master = path.join(work, 'master.png')
  fs.writeFileSync(master, png)

  const iconset = path.join(work, 'Graphite.iconset')
  fs.mkdirSync(iconset)
  for (const [size, name] of ICONSET) resize(master, size, path.join(iconset, name))

  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(BUILD, 'icon.icns')])
  resize(master, 512, path.join(BUILD, 'icon.png'))

  writeIco(
    ICO_SIZES.map((size) => {
      const file = path.join(work, `ico-${size}.png`)
      resize(master, size, file)
      return { size, file }
    }),
    path.join(BUILD, 'icon.ico')
  )

  fs.rmSync(work, { recursive: true, force: true })
  console.log('Wrote build/icon.icns, build/icon.ico and build/icon.png')
  app.exit(0)
})
