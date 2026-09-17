/** Menu-management DTOs. Pure types only. */

export interface CategoryInput {
  id?: string
  name: string
  sortOrder?: number
  isActive?: boolean
}

export interface VariantInput {
  id?: string
  name: string
  price: number // paise
  isActive?: boolean
}

export interface ItemInput {
  id?: string
  categoryId: string
  name: string
  shortCode: string | null
  price: number // paise; ignored when variants exist
  foodType: 'veg' | 'nonveg' | 'egg'
  isActive?: boolean
  addonGroupIds: string[]
  /** Full replacement set; variants missing from the list are soft-deleted. */
  variants: VariantInput[]
}

export interface AddonInput {
  id?: string
  groupId: string
  name: string
  price: number
  isActive?: boolean
}
