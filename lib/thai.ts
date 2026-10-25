// Thai text clean-up. The guest sheet has many doubled vowels / tone marks ("คุุณ", "พ่่อ", "ที่่ทำงาน").

// Above/below vowels and tone marks: ั ิ ี ึ ื ุ ู ฺ ็ ่ ้ ๊ ๋ ์ ํ ๎
const COMBINING = /[ัิ-ฺ็-๎]/;
const COMBINING_ALL = /[ัิ-ฺ็-๎]/g;

/** Known typos that the generic rule cannot fix. */
const OVERRIDES: Record<string, string> = {
  "ปุ้๋อง": "ป๋อง",
};

/** Drop marks repeated on the same consonant ("พี่ี่" → "พี่") and tidy whitespace. */
export function cleanThai(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  let cluster = ""; // combining marks seen since the last base character
  for (const ch of input.normalize("NFC")) {
    if (COMBINING.test(ch)) {
      if (cluster.includes(ch)) continue;
      cluster += ch;
    } else {
      cluster = "";
    }
    out += ch;
  }
  out = out
    .replace(/\s*\n\s*/g, ", ")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s+([,–-])/g, " $1")
    .replace(/[,\s]+$/g, "")
    .trim();
  return OVERRIDES[out] ?? out;
}

/** Aggressive key for searching: no marks, no spaces, no punctuation, lowercase. */
export function searchKey(input: string | null | undefined): string {
  return cleanThai(input)
    .replace(COMBINING_ALL, "")
    .replace(/[\s.,\-–()]/g, "")
    .toLowerCase();
}
