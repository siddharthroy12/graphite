const { execFile } = require('node:child_process')
const { promises: fs } = require('node:fs')
const path = require('node:path')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const bundleExtensions = ['.app', '.framework', '.xpc']

async function walk(directory, bundles, nativeModules) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (bundleExtensions.some((extension) => entry.name.endsWith(extension))) {
        bundles.push(entryPath)
      }
      await walk(entryPath, bundles, nativeModules)
    } else if (entry.isFile() && entry.name.endsWith('.node')) {
      nativeModules.push(entryPath)
    }
  }
}

async function sign(target) {
  await execFileAsync('codesign', ['--force', '--sign', '-', '--timestamp=none', target])
}

exports.default = async function adHocSignMac(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const bundles = []
  const nativeModules = []
  await walk(appPath, bundles, nativeModules)

  // Sign nested code first, then seal the containing app. Do not use
  // `codesign --deep`: it can invalidate Electron's nested resource seals.
  for (const modulePath of nativeModules) await sign(modulePath)
  for (const bundlePath of bundles.sort((a, b) => b.length - a.length)) await sign(bundlePath)
  await sign(appPath)
}
