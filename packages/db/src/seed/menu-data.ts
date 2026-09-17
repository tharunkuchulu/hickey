/**
 * Real HICKEY NALSAR menu transcribed from Petpooja (docs/reference/menu-hickey-nalsar.csv).
 * Generated file — edit the CSV and re-run the generator snippet in docs/decisions.md, not this file.
 * Prices in paise. Variant and add-on prices read from the Petpooja portal on 2026-09-17.
 */
export type SeedItem = {
  category: string
  shortCode: string
  name: string
  price: number
  foodType: 'veg' | 'nonveg' | 'egg'
  variants?: Array<{ name: string; price: number }>
  /** false = Petpooja shows no "A" flag for this item (no add-on group assigned). */
  addons?: boolean
}

// Order as listed in Petpooja's Category Management (creation order = the counter's category rail).
export const SEED_CATEGORIES: string[] = ["Hot Coffee", "Drinking Coco", "Shakes", "Iced Coffee", "Chillers", "Frappe", "Iced Teas", "Veg Bite Size", "Non-Veg Bite Size", "Sandwiches", "Burgers", "Waffles", "Blizzards", "Matcha"]

export const SEED_ITEMS: SeedItem[] = [
  { category: "Blizzards", shortCode: "61", name: "Roast Almond Blizzard", price: 7900, foodType: 'veg' },
  { category: "Blizzards", shortCode: "62", name: "Brownie Blizzard", price: 7900, foodType: 'veg' },
  { category: "Blizzards", shortCode: "63", name: "Oreo Blizzard", price: 7900, foodType: 'veg' },
  { category: "Blizzards", shortCode: "64", name: "Strawberry Blizzard", price: 7900, foodType: 'veg' },
  { category: "Blizzards", shortCode: "65", name: "Mango Blizzard", price: 7900, foodType: 'veg' },
  { category: "Blizzards", shortCode: "66", name: "Biscoff Blizzard", price: 9900, foodType: 'veg' },
  { category: "Blizzards", shortCode: "77", name: "Strawberry(desert)", price: 9900, foodType: 'veg' , addons: false },
  { category: "Blizzards", shortCode: "78", name: "Coockies(desert)", price: 9900, foodType: 'veg' , addons: false },
  { category: "Blizzards", shortCode: "79", name: "Coffee(desert)", price: 9900, foodType: 'veg' , addons: false },
  { category: "Blizzards", shortCode: "90", name: "8", price: 800, foodType: 'veg' , addons: false },
  { category: "Blizzards", shortCode: "91", name: "5", price: 500, foodType: 'veg' , addons: false },
  { category: "Burgers", shortCode: "54", name: "Veggie Burger", price: 9900, foodType: 'veg' },
  { category: "Burgers", shortCode: "55", name: "Paneer Burger", price: 10900, foodType: 'veg' },
  { category: "Burgers", shortCode: "56", name: "Chicken Burger", price: 11900, foodType: 'nonveg' },
  { category: "Chillers", shortCode: "26", name: "Cranberry Chiller", price: 9900, foodType: 'veg' },
  { category: "Chillers", shortCode: "27", name: "Peach Chiller", price: 9900, foodType: 'veg' },
  { category: "Chillers", shortCode: "80", name: "Lemonade Soda", price: 5900, foodType: 'veg' , addons: false },
  { category: "Drinking Coco", shortCode: "9", name: "Hot Coco", price: 0, foodType: 'veg', variants: [{ name: "hickey chota", price: 3900 }, { name: "sip", price: 9900 }] },
  { category: "Drinking Coco", shortCode: "10", name: "Brownie With Hot Coco", price: 0, foodType: 'veg', variants: [{ name: "hickey chota", price: 5900 }, { name: "sip", price: 12900 }] },
  { category: "Drinking Coco", shortCode: "11", name: "Cold Coco", price: 13900, foodType: 'veg' },
  { category: "Drinking Coco", shortCode: "72", name: "Green Tea(chota)", price: 3000, foodType: 'veg' , addons: false },
  { category: "Drinking Coco", shortCode: "76", name: "Green Tea Chota (lemon&honey)", price: 4000, foodType: 'veg' , addons: false },
  { category: "Frappe", shortCode: "28", name: "Simple Blend Frappe", price: 9900, foodType: 'veg' },
  { category: "Frappe", shortCode: "29", name: "Caramel Blend Frappe", price: 10900, foodType: 'veg' },
  { category: "Frappe", shortCode: "30", name: "Brownie Blend Frappe", price: 10900, foodType: 'veg' },
  { category: "Frappe", shortCode: "31", name: "Oreo Blend Frappe", price: 10900, foodType: 'veg' },
  { category: "Frappe", shortCode: "32", name: "Hazelnut Blend Frappe", price: 11900, foodType: 'veg' },
  { category: "Frappe", shortCode: "33", name: "Biscoff Blend Frappe", price: 11900, foodType: 'veg' },
  { category: "Frappe", shortCode: "34", name: "Any Reg Frappe", price: 16900, foodType: 'veg' },
  { category: "Hot Coffee", shortCode: "1", name: "Espresso", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 4900 }, { name: "sip", price: 9900 }] },
  { category: "Hot Coffee", shortCode: "2", name: "Americano", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 3000 }, { name: "sip", price: 7900 }] },
  { category: "Hot Coffee", shortCode: "3", name: "Cafe Latte", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 4000 }, { name: "sip", price: 9900 }] },
  { category: "Hot Coffee", shortCode: "4", name: "Cappuccino", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 4000 }, { name: "sip", price: 9900 }] },
  { category: "Hot Coffee", shortCode: "5", name: "Flat White", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 5000 }, { name: "sip", price: 12900 }] },
  { category: "Hot Coffee", shortCode: "6", name: "Dark Mocha", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 5000 }, { name: "sip", price: 13900 }] },
  { category: "Hot Coffee", shortCode: "7", name: "White Mocha", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 5000 }, { name: "sip", price: 13900 }] },
  { category: "Hot Coffee", shortCode: "8", name: "Zebra Mocha", price: 0, foodType: 'veg', variants: [{ name: "chota", price: 5900 }, { name: "sip", price: 14900 }] },
  { category: "Iced Coffee", shortCode: "19", name: "Affogato", price: 6900, foodType: 'veg' },
  { category: "Iced Coffee", shortCode: "20", name: "Iced Americano", price: 8900, foodType: 'veg' },
  { category: "Iced Coffee", shortCode: "21", name: "Iced Cranberry", price: 9900, foodType: 'veg' },
  { category: "Iced Coffee", shortCode: "22", name: "Spanish Latte", price: 10900, foodType: 'veg' },
  { category: "Iced Coffee", shortCode: "23", name: "Iced Mocha", price: 9900, foodType: 'veg' },
  { category: "Iced Coffee", shortCode: "24", name: "The Og Iced Coffee", price: 11900, foodType: 'veg' },
  { category: "Iced Coffee", shortCode: "25", name: "Any Reg Of Iced Coffee", price: 16900, foodType: 'veg' },
  { category: "Iced Teas", shortCode: "35", name: "Peach Ice Tea", price: 11900, foodType: 'veg' },
  { category: "Iced Teas", shortCode: "36", name: "Mango Ice Tea", price: 12900, foodType: 'veg' },
  { category: "Iced Teas", shortCode: "37", name: "Taichi Milk Tea", price: 13900, foodType: 'veg' },
  { category: "Iced Teas", shortCode: "81", name: "Lemon Ice Tea", price: 7900, foodType: 'veg' , addons: false },
  { category: "Matcha", shortCode: "67", name: "Matcha Ice Tea", price: 12900, foodType: 'veg' },
  { category: "Matcha", shortCode: "68", name: "Matcha Latte", price: 14900, foodType: 'veg' },
  { category: "Matcha", shortCode: "69", name: "Cranberry Matcha", price: 14900, foodType: 'veg' },
  { category: "Matcha", shortCode: "70", name: "Mango Matcha", price: 17900, foodType: 'veg' },
  { category: "Matcha", shortCode: "71", name: "Strawberry Matcha", price: 17900, foodType: 'veg' },
  { category: "Non-Veg Bite Size", shortCode: "44", name: "Chicken Cheese Balls (5 Pcs)", price: 9900, foodType: 'nonveg' },
  { category: "Non-Veg Bite Size", shortCode: "45", name: "Chicken Pops (10 Pcs)", price: 9900, foodType: 'nonveg' },
  { category: "Non-Veg Bite Size", shortCode: "46", name: "Chicken Momos (5 Pcs)", price: 9900, foodType: 'nonveg' },
  { category: "Non-Veg Bite Size", shortCode: "47", name: "Loaded Fries (Non-Veg)", price: 18900, foodType: 'nonveg' },
  { category: "Non-Veg Bite Size", shortCode: "83", name: "Chicken Spring Roll", price: 9900, foodType: 'nonveg' , addons: false },
  { category: "Sandwiches", shortCode: "48", name: "Veggie Sandwich", price: 7900, foodType: 'veg' },
  { category: "Sandwiches", shortCode: "49", name: "Vadapav Sandwich", price: 8900, foodType: 'veg' },
  { category: "Sandwiches", shortCode: "50", name: "Nutella Sandwich", price: 9900, foodType: 'veg' },
  { category: "Sandwiches", shortCode: "51", name: "PB&J Sandwich", price: 9900, foodType: 'veg' },
  { category: "Sandwiches", shortCode: "52", name: "Egg & Mayo Sandwich", price: 9900, foodType: 'egg' },
  { category: "Sandwiches", shortCode: "53", name: "Smoked Chicken Sandwich", price: 10900, foodType: 'nonveg' },
  { category: "Sandwiches", shortCode: "82", name: "Panner Sandwich", price: 10900, foodType: 'veg' , addons: false },
  { category: "Shakes", shortCode: "12", name: "Roast Almond Shake", price: 9900, foodType: 'veg' },
  { category: "Shakes", shortCode: "13", name: "Cookies & Cream Shake", price: 10900, foodType: 'veg' },
  { category: "Shakes", shortCode: "14", name: "Mango Shake", price: 10900, foodType: 'veg' },
  { category: "Shakes", shortCode: "15", name: "Strawberry Shake", price: 10900, foodType: 'veg' },
  { category: "Shakes", shortCode: "16", name: "Brownie Cheesecake Shake", price: 11900, foodType: 'veg' },
  { category: "Shakes", shortCode: "17", name: "Hazelnut Crunch Shake", price: 11900, foodType: 'veg' },
  { category: "Shakes", shortCode: "18", name: "Any Reg Shake", price: 16900, foodType: 'veg' },
  { category: "Veg Bite Size", shortCode: "38", name: "Pizza Pockets (2 Pcs)", price: 8900, foodType: 'veg' },
  { category: "Veg Bite Size", shortCode: "39", name: "Spring Rolls (3 Pcs)", price: 8900, foodType: 'veg' },
  { category: "Veg Bite Size", shortCode: "40", name: "Onion Rings (5 Pcs)", price: 9900, foodType: 'veg' },
  { category: "Veg Bite Size", shortCode: "41", name: "Veg Momos (5 Pcs)", price: 8900, foodType: 'veg' },
  { category: "Veg Bite Size", shortCode: "42", name: "Fries (Small Container)", price: 11900, foodType: 'veg' },
  { category: "Veg Bite Size", shortCode: "43", name: "Loaded Fries (Veg)", price: 16900, foodType: 'veg' },
  { category: "Veg Bite Size", shortCode: "73", name: "Cups Noodles", price: 6500, foodType: 'veg' , addons: false },
  { category: "Waffles", shortCode: "57", name: "Maple Waffle", price: 9900, foodType: 'veg' },
  { category: "Waffles", shortCode: "58", name: "Double Chocolate Waffle", price: 12900, foodType: 'veg' },
  { category: "Waffles", shortCode: "59", name: "White Chocolate Waffle/dark", price: 11900, foodType: 'veg' },
  { category: "Waffles", shortCode: "60", name: "Cheese & Berry Waffle", price: 12900, foodType: 'veg' },
  { category: "Waffles", shortCode: "brownie", name: "Brownie", price: 6900, foodType: 'veg' , addons: false },
  { category: "Waffles", shortCode: "chocolava", name: "Chocolava", price: 6900, foodType: 'veg' , addons: false },
  { category: "Waffles", shortCode: "scoop over cake", name: "Scoop Over Cake", price: 9900, foodType: 'veg' , addons: false },
  { category: "Waffles", shortCode: "water bottle 500ml", name: "Water Bottle 500ml", price: 1000, foodType: 'veg' , addons: false },
  { category: "Waffles", shortCode: "74", name: "Watter Bottle(1 Litre)", price: 2000, foodType: 'veg' , addons: false },
  { category: "Waffles", shortCode: "75", name: "Milk(1 Litre)", price: 7000, foodType: 'veg' , addons: false },
]

export const SEED_VARIATION_NAMES = ['chota', 'sip', 'hickey chota']
export const SEED_ITEM_NOTES = ['Yesh', 'Addons']
export const SEED_ADDON_GROUPS = [
  {
    name: 'Add On',
    addons: [
      { name: 'Hazelnut', price: 2000 },
      { name: 'Vanila', price: 2000 },
      { name: 'Irish', price: 2000 },
      { name: 'Chocolate', price: 2000 },
      { name: 'Caramel', price: 2000 },
      { name: 'Peri Peri', price: 2000 },
      { name: 'Cheese Slice', price: 3000 },
      { name: 'Espresso', price: 3000 },
      { name: 'ICE CREAM', price: 3000 }
    ]
  }
]
