// Jest resolver that mirrors metro.config.js, so tests import shared code the way the app
// bundles it: `@/x` is this app's override if there is one, else ../src/x; `@m/x` is ./src/x;
// a relative import inside ../src that lands on an overridden file gets the override; and
// packages imported from ../src resolve from this app's node_modules.
const path = require('node:path')
const fs = require('node:fs')

const appRoot = __dirname
const sharedRoot = path.resolve(appRoot, '../src')
const overridesRoot = path.resolve(appRoot, 'src/overrides')
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx']
const WEB_ONLY_PACKAGES = new Set(['jspdf', 'jspdf-autotable'])

function overrideFor(relative) {
  const stem = relative.replace(/\.(ts|tsx|js)$/, '')
  for (const ext of EXTENSIONS) {
    const candidate = path.join(overridesRoot, stem + ext)
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

module.exports = (request, options) => {
  const fromShared =
    options.basedir.startsWith(sharedRoot + path.sep) || options.basedir === sharedRoot

  if (request.startsWith('@/')) {
    const relative = request.slice(2)
    return (
      overrideFor(relative) ?? options.defaultResolver(path.join(sharedRoot, relative), options)
    )
  }
  if (request.startsWith('@m/')) {
    return options.defaultResolver(path.join(appRoot, 'src', request.slice(3)), options)
  }
  if (fromShared && request.startsWith('.')) {
    const resolved = options.defaultResolver(request, options)
    if (resolved.startsWith(sharedRoot + path.sep)) {
      return overrideFor(path.relative(sharedRoot, resolved)) ?? resolved
    }
    return resolved
  }
  if (fromShared && WEB_ONLY_PACKAGES.has(request)) {
    return path.join(appRoot, 'jest.empty.js')
  }
  if (fromShared) {
    return options.defaultResolver(request, { ...options, basedir: path.join(appRoot, 'src') })
  }
  return options.defaultResolver(request, options)
}
