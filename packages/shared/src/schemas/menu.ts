import { z } from 'zod'

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
})
export type Category = z.infer<typeof categorySchema>

export const itemVariantSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  name: z.string().min(1).max(40), // e.g. Half / Full / Large
  price: z.number().int().nonnegative(), // paise
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true)
})
export type ItemVariant = z.infer<typeof itemVariantSchema>

export const addonGroupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60), // e.g. Extras
  minSelect: z.number().int().nonnegative().default(0),
  maxSelect: z.number().int().positive().default(10),
  sortOrder: z.number().int().default(0)
})
export type AddonGroup = z.infer<typeof addonGroupSchema>

export const addonSchema = z.object({
  id: z.uuid(),
  groupId: z.uuid(),
  name: z.string().min(1).max(60),
  price: z.number().int().nonnegative(),
  isActive: z.boolean().default(true)
})
export type Addon = z.infer<typeof addonSchema>

export const menuItemSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string().min(1).max(80),
  shortCode: z.string().max(10).optional().nullable(),
  price: z.number().int().nonnegative(), // paise; ignored when variants exist
  foodType: z.enum(['veg', 'nonveg', 'egg']).default('veg'),
  isActive: z.boolean().default(true),
  isFavourite: z.boolean().default(false),
  sortOrder: z.number().int().default(0),
  addonGroupIds: z.array(z.uuid()).default([])
})
export type MenuItem = z.infer<typeof menuItemSchema>
