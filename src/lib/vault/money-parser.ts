/**
 * Converts natural spoken/typed money expressions into a numeric amount.
 * Two independent paths, chosen by whether the text contains digit
 * characters at all — mixing them (e.g. treating "thousand" in "2.5
 * thousand" as a standalone "1000") is what causes silent misreads, so we
 * never let both paths run on the same input.
 */

const ONES: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const SCALE_WORDS: Record<string, number> = {
  hundred: 100,
  thousand: 1000,
  k: 1000,
  grand: 1000,
  lakh: 100000,
  lac: 100000,
  crore: 10000000,
};

const NUMBER_TOKEN_RE =
  /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|lakh|lac|crore|k|grand|point|and)$/;

/** Standard English number-word grouping (no decimal/scale-suffix handling — see parseWordAmount). */
function wordsToInteger(tokens: string[]): number {
  let total = 0;
  let current = 0;
  for (const t of tokens) {
    if (t === "and") continue;
    if (t in ONES) current += ONES[t];
    else if (t in TENS) current += TENS[t];
    else if (t === "hundred") current = (current || 1) * 100;
    else if (t === "thousand" || t === "lakh" || t === "lac" || t === "crore") {
      total += (current || 1) * SCALE_WORDS[t];
      current = 0;
    }
  }
  return total + current;
}

function parseWordAmount(text: string): number | null {
  const words = text.split(/\s+/).filter(Boolean);

  let bestRun: string[] = [];
  let run: string[] = [];
  for (const w of [...words, ""]) {
    if (NUMBER_TOKEN_RE.test(w)) {
      run.push(w);
    } else {
      if (run.length > bestRun.length) bestRun = run;
      run = [];
    }
  }
  if (bestRun.length === 0) return null;

  let tokens = bestRun;
  let trailingScale: number | null = null;
  const last = tokens[tokens.length - 1];
  if (tokens.length > 1 && (last === "k" || last === "grand")) {
    trailingScale = SCALE_WORDS[last];
    tokens = tokens.slice(0, -1);
  }

  const pointIdx = tokens.indexOf("point");
  const integerTokens = pointIdx === -1 ? tokens : tokens.slice(0, pointIdx);
  const fractionTokens = pointIdx === -1 ? [] : tokens.slice(pointIdx + 1);

  const intValue = integerTokens.length ? wordsToInteger(integerTokens) : 0;
  let value = intValue;
  if (fractionTokens.length) {
    const fracDigits = fractionTokens
      .map((t) => (t in ONES ? ONES[t] : null))
      .filter((n): n is number => n !== null)
      .join("");
    if (fracDigits) value = intValue + parseFloat(`0.${fracDigits}`);
  }

  if (trailingScale) value *= trailingScale;
  return value > 0 ? value : null;
}

/**
 * Parses a natural money expression ("₹500", "1.5k", "2 grand", "five
 * hundred rupees", "two thousand", "one point five k") into a plain number,
 * or null if no confident amount could be found.
 */
export function parseMoneyExpression(rawText: string): number | null {
  const cleaned = rawText
    .toLowerCase()
    .replace(/₹/g, " ")
    .replace(/\brs\.?\b|\binr\b/g, " ")
    .replace(/\brupees?\b/g, " ");

  if (/\d/.test(cleaned)) {
    const m = cleaned.match(/(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lac|crore|grand)?\b/);
    if (!m) return null;
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n) || n <= 0) return null;
    const scale = m[2] ? SCALE_WORDS[m[2]] : 1;
    return n * scale;
  }

  return parseWordAmount(cleaned);
}
