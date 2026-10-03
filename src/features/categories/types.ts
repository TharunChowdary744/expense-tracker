import type { Stored } from '@/services/firestore'
import type { CategoryDoc } from './schemas'

export type Category = Stored<CategoryDoc>

export interface CategoryNode {
  category: Category
  children: Category[]
}

export interface CategoryOption {
  id: string
  label: string
  depth: 0 | 1
}
