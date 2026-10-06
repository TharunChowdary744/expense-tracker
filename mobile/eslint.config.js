// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config')
const expoConfig = require('eslint-config-expo/flat')

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    files: ['*.js'],
    languageOptions: {
      globals: { __dirname: 'readonly', require: 'readonly', module: 'writable', jest: 'readonly' },
    },
  },
  {
    settings: {
      // `@/` resolves into the shared web code, `@m/` into this app (see metro.config.js).
      'import/resolver': {
        typescript: { project: './tsconfig.json' },
      },
    },
  },
])
