/**
 * Types for the few web modules that read Vite's `import.meta.env`. They are type-checked here
 * because shared code imports them relatively, but Metro swaps each of them for its
 * src/overrides version, so this is never read at runtime.
 */
interface ImportMetaEnv {
  readonly [key: string]: string | undefined
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
