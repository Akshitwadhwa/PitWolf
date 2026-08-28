/**
 * Keyword extraction for engineer → driver messages.
 *
 * The engineer can say something like:
 *   "Ok Max, try to take less curb on turn 4 and exiting turn 4 use boost"
 *
 * This module splits that into multiple short display keywords:
 *   ["LESS CURB T4", "BOOST EXIT T4"]
 *
 * Each keyword is max 3 words and safe to display on the steering wheel screen.
 */

/**
 * Extract turn reference from text.
 * @param {string} text
 * @returns {string} e.g. "T4" or ""
 */
function extractTurn(text) {
  const map = {
    one: '1', two: '2', to: '2', too: '2',
    three: '3', tree: '3', four: '4', for: '4',
    five: '5', six: '6', seven: '7', eight: '8', ate: '8',
    nine: '9', ten: '10', eleven: '11', twelve: '12'
  }
  const match = text.match(/turn\s*(\d{1,2}|one|two|to|too|three|tree|four|for|five|six|seven|eight|ate|nine|ten|eleven|twelve)/i)
  if (!match) return ''
  let val = match[1].toLowerCase()
  return `T${map[val] || val}`
}

/**
 * Extract sector reference from text.
 * @param {string} text
 * @returns {string} e.g. "S2" or ""
 */
function extractSector(text) {
  const match = text.match(/sector\s*(\d)/i)
  return match ? `S${match[1]}` : ''
}

const LOCATION_FALLBACK = ''

/**
 * The ordered rule list. Each rule describes one action type.
 * Returns a 2-3 word keyword if the rule matches, or null.
 */
const RULES = [
  // Driving line / curb
  {
    test: /less\s+curb/i,
    keyword: (text) => {
      const t = extractTurn(text)
      return `LESS CURB${t ? ` ${t}` : ''}`
    },
  },
  {
    test: /more\s+curb/i,
    keyword: (text) => {
      const t = extractTurn(text)
      return `MORE CURB${t ? ` ${t}` : ''}`
    },
  },
  // Boost / DRS / power
  {
    test: /\bboost\b|use\s+(full\s+)?power|deploy/i,
    keyword: (text) => {
      const t = extractTurn(text)
      const sector = extractSector(text)
      const loc = t || sector || LOCATION_FALLBACK
      if (/exit/i.test(text)) return `BOOST EXIT${loc ? ` ${loc}` : ''}`
      if (/entry/i.test(text)) return `BOOST ENTRY${loc ? ` ${loc}` : ''}`
      return `BOOST${loc ? ` ${loc}` : ''}`
    },
  },
  {
    test: /drs/i,
    keyword: (text) => {
      const t = extractTurn(text)
      return `DRS${t ? ` ${t}` : ' AVAILABLE'}`
    },
  },
  // Braking
  {
    test: /brake\s+(later|earlier|harder|lighter)/i,
    keyword: (text) => {
      const direction = text.match(/brake\s+(later|earlier|harder|lighter)/i)?.[1]?.toUpperCase() || ''
      const t = extractTurn(text)
      return `BRAKE ${direction}${t ? ` ${t}` : ''}`
    },
  },
  // Pit instructions
  {
    test: /\bbox\b|pit\s+this\s+lap|come\s+in/i,
    keyword: () => 'BOX THIS LAP',
  },
  // Tyre management
  {
    test: /manage\s+(tyre|tire)|tyre\s+care|save\s+(tyre|tire)/i,
    keyword: () => 'MANAGE TYRES',
  },
  {
    test: /push\s+hard|push\s+now|maximum\s+attack|attack/i,
    keyword: (text) => {
      const t = extractTurn(text)
      return `PUSH NOW${t ? ` ${t}` : ''}`
    },
  },
  // Safety car / flags
  {
    test: /safety\s+car/i,
    keyword: () => 'SAFETY CAR',
  },
  {
    test: /blue\s+flag/i,
    keyword: () => 'BLUE FLAG',
  },
  {
    test: /virtual\s+safety\s+car|vsc/i,
    keyword: () => 'VSC ACTIVE',
  },
  // ERS / battery
  {
    test: /ers|battery|harvest|save\s+energy/i,
    keyword: (text) => {
      if (/harvest/i.test(text)) return 'ERS HARVEST'
      if (/save/i.test(text)) return 'ERS SAVE'
      if (/deploy/i.test(text)) return 'ERS DEPLOY'
      return 'ERS MANAGE'
    },
  },
  // Fuel
  {
    test: /fuel\s+(rich|lean|save|map)/i,
    keyword: (text) => {
      const mode = text.match(/fuel\s+(rich|lean|save|map)/i)?.[1]?.toUpperCase() || ''
      return `FUEL ${mode}`
    },
  },
  // Strategy
  {
    test: /plan\s+([a-z])/i,
    keyword: (text) => {
      const match = text.match(/plan\s+([a-z])/i)
      return `PLAN ${match[1].toUpperCase()}`
    },
  },
  // Delta / pace
  {
    test: /delta|maintain\s+pace|hold\s+pace/i,
    keyword: () => 'HOLD DELTA',
  },
  {
    test: /gap\s+(is|to)/i,
    keyword: () => 'CHECK GAP',
  },
  // Radio acknowledgement
  {
    test: /radio\s+check|do\s+you\s+(read|copy|hear)|copy\s+that|understood/i,
    keyword: () => 'RADIO CHECK',
  },
]

/**
 * Extract all matching keywords from an engineer message.
 * Returns an array of 2-3 word display strings.
 *
 * @param {string} message - raw engineer speech
 * @returns {string[]} ordered list of keywords
 */
export function extractEngineerKeywords(message) {
  const keywords = []
  for (const rule of RULES) {
    if (rule.test.test(message)) {
      const kw = rule.keyword(message)
      if (kw && !keywords.includes(kw)) keywords.push(kw)
    }
  }
  return keywords.length > 0 ? keywords : ['CHECK RADIO']
}

/**
 * Build the primary single keyword (first match) for backward compatibility.
 * @param {string} message
 * @returns {string}
 */
export function primaryKeyword(message) {
  return extractEngineerKeywords(message)[0] || 'CHECK RADIO'
}
