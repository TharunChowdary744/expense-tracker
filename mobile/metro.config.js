// Metro config for the Ledgerly mobile app.
//
// The app shares the web app's data layer (RTK Query endpoints, slices, zod schemas and the
// pure maths) straight from ../src. Three rules make that work:
//
// 1. `@/x` resolves to ./src/overrides/x when that file exists, otherwise to ../src/x. The
//    overrides replace the few web-only modules (Firebase init, Google sign-in, the receipt
//    queue, icons, file downloads) with React Native versions that keep the same exports.
// 2. A relative import inside ../src that lands on an overridden file is swapped too, so a
//    shared module never pulls in its web-only neighbour.
// 3. Packages imported from ../src resolve from this app's node_modules, so there is exactly
//    one copy of React, Redux, Firebase and zod in the bundle.
// 4. Web-only packages that a shared module loads lazily, in code this app never runs (jsPDF
//    for the web PDF statement), resolve to an empty module.
//
// Expo's own tsconfig `paths` mapping is off (app.json experiments.tsconfigPaths): the package
// entries in tsconfig.json point at type packages and are for the type checker only.
const path = require('node:path')
const fs = require('node:fs')
const { getDefaultConfig } = require('expo/metro-config')

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

const config = getDefaultConfig(appRoot)

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot]

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromShared = context.originModulePath.startsWith(sharedRoot + path.sep)

  if (moduleName.startsWith('@/')) {
    const relative = moduleName.slice(2)
    const override = overrideFor(relative)
    if (override) return { type: 'sourceFile', filePath: override }
    return context.resolveRequest(context, path.join(sharedRoot, relative), platform)
  }

  if (moduleName.startsWith('@m/')) {
    return context.resolveRequest(context, path.join(appRoot, 'src', moduleName.slice(3)), platform)
  }

  if (fromShared && moduleName.startsWith('.')) {
    const resolved = context.resolveRequest(context, moduleName, platform)
    if (resolved.type === 'sourceFile' && resolved.filePath.startsWith(sharedRoot + path.sep)) {
      const override = overrideFor(path.relative(sharedRoot, resolved.filePath))
      if (override) return { type: 'sourceFile', filePath: override }
    }
    return resolved
  }

  if (fromShared && WEB_ONLY_PACKAGES.has(moduleName)) return { type: 'empty' }

  if (fromShared) {
    // Resolve packages as if the import were written in this app.
    return context.resolveRequest(
      { ...context, originModulePath: path.join(appRoot, 'src', 'index.ts') },
      moduleName,
      platform,
    )
  }

  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
