import {
  Baby,
  Banknote,
  Beer,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  Circle,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Droplets,
  Dumbbell,
  Ellipsis,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Hotel,
  House,
  Landmark,
  Laptop,
  Lightbulb,
  Music,
  PawPrint,
  PiggyBank,
  Pizza,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Stethoscope,
  Tag,
  Ticket,
  Train,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Icons users can pick for accounts and categories, stored by their kebab-case name.
 * Imported one by one so the bundle only carries these.
 */
export const ICONS = {
  wallet: Wallet,
  banknote: Banknote,
  landmark: Landmark,
  'credit-card': CreditCard,
  'piggy-bank': PiggyBank,
  coins: Coins,
  'hand-coins': HandCoins,
  'trending-up': TrendingUp,
  briefcase: Briefcase,
  laptop: Laptop,
  utensils: Utensils,
  pizza: Pizza,
  coffee: Coffee,
  beer: Beer,
  'shopping-cart': ShoppingCart,
  'shopping-bag': ShoppingBag,
  shirt: Shirt,
  gift: Gift,
  house: House,
  'building-2': Building2,
  sofa: Sofa,
  zap: Zap,
  droplets: Droplets,
  lightbulb: Lightbulb,
  wifi: Wifi,
  smartphone: Smartphone,
  bus: Bus,
  train: Train,
  car: Car,
  fuel: Fuel,
  plane: Plane,
  hotel: Hotel,
  'heart-pulse': HeartPulse,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  scissors: Scissors,
  clapperboard: Clapperboard,
  music: Music,
  'gamepad-2': Gamepad2,
  ticket: Ticket,
  'graduation-cap': GraduationCap,
  'book-open': BookOpen,
  baby: Baby,
  'paw-print': PawPrint,
  wrench: Wrench,
  receipt: Receipt,
  tag: Tag,
  ellipsis: Ellipsis,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

/** Human label for an icon name: "credit-card" → "Credit card". */
export function iconLabel(name: string): string {
  const words = name.replace(/-\d+$/, '').replace(/-/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Unknown names (e.g. from an older app version) fall back to a plain circle. */
export function getIcon(name: string): LucideIcon {
  return (ICONS as Record<string, LucideIcon>)[name] ?? Circle
}

/** Swatches offered by the colour picker: mid-tones, so white icons on them stay readable. */
export const COLORS = [
  { value: '#dc2626', label: 'Red' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#b45309', label: 'Amber' },
  { value: '#ca8a04', label: 'Yellow' },
  { value: '#65a30d', label: 'Lime' },
  { value: '#16a34a', label: 'Green' },
  { value: '#0d9488', label: 'Teal' },
  { value: '#0891b2', label: 'Cyan' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#4f46e5', label: 'Indigo' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#9333ea', label: 'Purple' },
  { value: '#db2777', label: 'Pink' },
  { value: '#64748b', label: 'Slate' },
] as const

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
