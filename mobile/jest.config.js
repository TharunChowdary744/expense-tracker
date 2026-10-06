const expoPreset = require('jest-expo/jest-preset')

// jest-expo turns tsconfig "paths" into moduleNameMapper entries. Ours exist only for the type
// checker (shared ../src files read this app's library types); at runtime jest.resolver.js does
// the same job as metro.config.js, so those generated entries are dropped.
const typescriptOnly = (key) =>
  /^\^(@\/|@m\/|react|react-redux|@reduxjs\/toolkit|firebase|zod|date-fns|react-hook-form|@hookform\/resolvers)/.test(
    key.replace(/\\/g, ''),
  )

/** @type {import('jest').Config} */
module.exports = {
  ...expoPreset,
  moduleNameMapper: {
    ...Object.fromEntries(
      Object.entries(expoPreset.moduleNameMapper ?? {}).filter(([key]) => !typescriptOnly(key)),
    ),
    // The icon package's React Native entry is .mjs, which Jest doesn't load; use its CommonJS build.
    '^lucide-react-native$':
      '<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js',
  },
  roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  resolver: '<rootDir>/jest.resolver.js',
  setupFiles: [...(expoPreset.setupFiles ?? []), '<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg|lucide-react-native|standard-navigation|immer|react-redux|@reduxjs/.*|redux|reselect|firebase|@firebase/.*)',
  ],
}
