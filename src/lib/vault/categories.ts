import { VAULT_CATEGORIES, type VaultCategory } from "@/lib/voice/types";

/**
 * Maps natural spending language onto the fixed vault category set. The
 * category dropdown never forces exact wording — "bought vegetables" should
 * land on Groceries just as readily as the word "groceries" itself.
 */
export const CATEGORY_SYNONYMS: [RegExp, VaultCategory][] = [
  [/\bgroceries?\b|\bvegetables?\b|\bveggies\b|\bfruits?\b|\bsupermarket\b/i, "Groceries"],
  [/\bnew\s+clothes\b|\bclothes\b|\bclothing\b|\bshirts?\b|\bdress(?:es)?\b|\bjeans\b|\bshoes?\b/i, "New Clothes"],
  [/\bfood\b|\bdinner\b|\blunch\b|\bbreakfast\b|\brestaurant\b|\bcaf[eé]\b|\bcoffee\b|\bsnacks?\b/i, "Food"],
  [/\bshopping\b|\bamazon\b|\bflipkart\b|\bordered?\b|\bmall\b/i, "Shopping"],
  [/\bbills?\b|\belectricity\b|\bwater\s+bill\b|\bgas\s+bill\b|\binternet\b|\bwifi\b|\brent\b/i, "Bills"],
  [/\btravell?ing\b|\btravel\b|\btrip\b|\buber\b|\bola\b|\btaxi\b|\bcab\b|\bflight\b|\btrain\b|\bbus\b|\bpetrol\b|\bfuel\b/i, "Travel"],
  [/\bentertainment\b|\bmovies?\b|\bcinema\b|\bnetflix\b|\bconcert\b|\bgames?\b/i, "Entertainment"],
  [/\bmedical\b|\bdoctor\b|\bhealth\b|\bhospital\b|\bmedicines?\b|\bpharmacy\b|\bclinic\b/i, "Medical"],
  [/\bother\b|\bmisc(?:ellaneous)?\b/i, "Other"],
];

export function matchCategory(text: string): VaultCategory | null {
  for (const [re, category] of CATEGORY_SYNONYMS) {
    if (re.test(text)) return category;
  }
  return null;
}

export function isVaultCategory(value: string): value is VaultCategory {
  return (VAULT_CATEGORIES as readonly string[]).includes(value);
}
