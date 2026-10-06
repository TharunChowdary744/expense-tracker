/**
 * Colour tokens converted from the web app's src/index.css (oklch → sRGB hex), so both apps
 * look the same and keep WCAG AA contrast in light and dark.
 */
export const light = {
  background: '#fcfcfc',
  foreground: '#13161a',
  card: '#ffffff',
  cardForeground: '#13161a',
  primary: '#00655c',
  primaryForeground: '#fcfcfc',
  secondary: '#eff2f5',
  secondaryForeground: '#1e2226',
  muted: '#eff2f5',
  mutedForeground: '#51565b',
  accent: '#e1f3f0',
  accentForeground: '#042824',
  destructive: '#bb0916',
  destructiveForeground: '#fcfcfc',
  success: '#09672e',
  warning: '#8d5406',
  border: '#dbdee1',
  input: '#dbdee1',
  ring: '#008479',
  overlay: 'rgba(0,0,0,0.45)',
  chart: ['#087970', '#b64e10', '#3b5eb2', '#308639', '#ae2c77', '#9b7300', '#784d96', '#5c6b7a'],
  chartIncome: '#21763c',
  chartExpense: '#c13e2e',
  chartNet: '#2a5885',
  heat: ['#eff2f5', '#bae9e2', '#79c8be', '#26998e', '#00655c'],
}

export type Palette = typeof light

export const dark: Palette = {
  background: '#0c1014',
  foreground: '#eff2f5',
  card: '#15191d',
  cardForeground: '#eff2f5',
  primary: '#49c4b7',
  primaryForeground: '#071413',
  secondary: '#23272b',
  secondaryForeground: '#eff2f5',
  muted: '#23272b',
  mutedForeground: '#a0a5ab',
  accent: '#123430',
  accentForeground: '#eff2f5',
  destructive: '#ff6367',
  destructiveForeground: '#130807',
  success: '#65c67d',
  warning: '#f3b94c',
  border: '#2f3338',
  input: '#2f3338',
  ring: '#33a397',
  overlay: 'rgba(0,0,0,0.6)',
  chart: ['#49c4b7', '#f1944f', '#7ca2f6', '#6eca73', '#ed76b3', '#e5c057', '#be8ce1', '#95a0ab'],
  chartIncome: '#65c67d',
  chartExpense: '#f87966',
  chartNet: '#90bce9',
  heat: ['#23272b', '#183a35', '#1a625a', '#319287', '#55cec0'],
}

export const radius = { sm: 6, md: 8, lg: 10, xl: 14, full: 999 }
export const space = (n: number) => n * 4
