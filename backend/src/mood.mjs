/**
 * Mood detection for F1 driver radio messages.
 *
 * Rules (text-only path, used when audio analysis is unavailable):
 *  - ANGRY     : cuss words detected AND high-intensity indicators
 *  - FRUSTRATED: cuss words detected OR strong frustration language, but calmer tone
 *  - CALM      : no cuss/frustration markers
 *
 * Rules (audio path, used when pitch RMS data is available):
 *  - ANGRY     : cuss words + high pitch energy (rms > 0.18)
 *  - FRUSTRATED: cuss words OR frustration language, moderate energy (rms 0.08-0.18)
 *  - CALM      : no markers OR low energy (rms < 0.08)
 */

const CUSS_WORDS = new Set([
  'shit', 'damn', 'crap', 'hell', 'ass', 'fuck', 'bloody', 'bastard',
  'idiot', 'stupid', 'useless', 'ridiculous', 'rubbish', 'bollocks',
  'crap', 'terrible', 'disaster', 'nightmare', 'impossible', 'pathetic',
])

const FRUSTRATION_PHRASES = [
  /can't (do|get|take|hold|make|manage)/i,
  /not working/i,
  /completely (lost|gone|off|wrong)/i,
  /no grip/i,
  /no traction/i,
  /sliding (everywhere|badly|all over)/i,
  /nothing (left|there)/i,
  /undriveable/i,
  /snapping/i,
  /bouncing/i,
  /losing (it|everything)/i,
  /problem/i,
  /issue/i,
  /broken/i,
  /wrong/i,
]

const INTENSITY_PHRASES = [
  /what the/i,
  /are you (kidding|serious)/i,
  /this is (awful|terrible|a joke|unacceptable)/i,
  /come on/i,
  /for (god|christ|heaven)'?s sake/i,
  /absolutely (awful|terrible|ridiculous)/i,
]

const URGENCY_PHRASES = [
  /\bhelp\b/i,
  /emergency/i,
  /urgent/i,
  /respond/i,
  /can't hear/i,
  /radio (failure|broken|down)/i,
]

const ANGER_PHRASES = [
  /what the/i,
  /are you (kidding|serious)/i,
  /this is (awful|terrible|a joke|unacceptable)/i,
  /come on/i,
  /for (god|christ|heaven)'?s sake/i,
  /absolutely (awful|terrible|ridiculous)/i,
  /ridiculous/i,
  /unacceptable/i,
  /useless/i,
  /idiot/i,
  /stupid/i,
]

/**
 * Count cuss words in a text string.
 * @param {string} text - lowercased input
 * @returns {number}
 */
function countCussWords(text) {
  const wordTokens = text.replace(/[^a-z\s]/g, ' ').split(/\s+/)
  return wordTokens.filter((w) => CUSS_WORDS.has(w)).length
}

/**
 * Detect mood purely from transcript text.
 * @param {string} text - the transcribed driver speech
 * @returns {{ mood: string, moodConfidence: number, moodReason: string }}
 */
export function detectMoodFromText(text) {
  const lower = text.toLowerCase()
  const cussCount = countCussWords(lower)
  const hasFrustration = FRUSTRATION_PHRASES.some((re) => re.test(lower))
  const hasIntensity = INTENSITY_PHRASES.some((re) => re.test(lower))
  const hasAnger = cussCount >= 1 || ANGER_PHRASES.some((re) => re.test(lower)) || hasIntensity
  const hasUrgency = URGENCY_PHRASES.some((re) => re.test(lower))

  if (hasUrgency) {
    return {
      mood: 'URGENT',
      moodConfidence: 0.88,
      moodReason: 'urgent radio language detected',
    }
  }

  if (hasAnger) {
    return {
      mood: 'ANGRY',
      moodConfidence: Math.min(0.97, 0.74 + cussCount * 0.08 + (hasIntensity ? 0.04 : 0)),
      moodReason: cussCount >= 1 ? 'strong language detected' : 'high-intensity language detected',
    }
  }

  if (hasFrustration) {
    return {
      mood: 'FRUSTRATED',
      moodConfidence: Math.min(0.9, 0.62 + (cussCount * 0.1) + (hasFrustration ? 0.08 : 0)),
      moodReason: hasFrustration ? 'frustration language detected' : 'mild strong language',
    }
  }

  return {
    mood: 'CALM',
    moodConfidence: 0.78,
    moodReason: 'no stress indicators in text',
  }
}

/**
 * Detect mood combining text analysis with audio pitch/energy data.
 * @param {string} text - the transcribed driver speech
 * @param {{ rms: number, pitch?: number }} audioFeatures - extracted audio features
 * @returns {{ mood: string, moodConfidence: number, moodReason: string }}
 */
export function detectMoodFromAudio(text, audioFeatures) {
  const { rms = 0 } = audioFeatures
  const lower = text.toLowerCase()
  const cussCount = countCussWords(lower)
  const hasFrustration = FRUSTRATION_PHRASES.some((re) => re.test(lower))
  const hasAnger = cussCount >= 1 || ANGER_PHRASES.some((re) => re.test(lower)) || INTENSITY_PHRASES.some((re) => re.test(lower))
  const hasUrgency = URGENCY_PHRASES.some((re) => re.test(lower))

  if (hasUrgency && rms > 0.08) {
    return {
      mood: 'URGENT',
      moodConfidence: Math.min(0.96, 0.82 + rms * 0.5),
      moodReason: `urgent radio language + vocal energy (${(rms * 100).toFixed(0)}%)`,
    }
  }

  // Strong language or hostile phrasing stays angry even if the vocal energy is low.
  if (hasAnger || (rms > 0.18 && hasFrustration)) {
    return {
      mood: 'ANGRY',
      moodConfidence: Math.min(0.97, 0.78 + rms * 0.5 + cussCount * 0.06),
      moodReason: hasAnger
        ? `hostile language detected${rms > 0.08 ? ` with vocal energy (${(rms * 100).toFixed(0)}%)` : ''}`
        : `high vocal energy (${(rms * 100).toFixed(0)}%) + frustration markers`,
    }
  }

  // High energy alone = slightly frustrated/elevated
  if (rms > 0.18) {
    return {
      mood: 'FRUSTRATED',
      moodConfidence: 0.68,
      moodReason: `high vocal energy (${(rms * 100).toFixed(0)}%) detected`,
    }
  }

  // Moderate energy + text markers
  if (rms > 0.08 && hasFrustration) {
    return {
      mood: 'FRUSTRATED',
      moodConfidence: Math.min(0.88, 0.62 + rms + cussCount * 0.06),
      moodReason: `moderate energy (${(rms * 100).toFixed(0)}%) + frustration markers`,
    }
  }

  // Low energy normally reads calm, but not if the text is clearly hostile.
  if (rms <= 0.08) {
    if (hasAnger) {
      return {
        mood: 'ANGRY',
        moodConfidence: Math.min(0.9, 0.74 + cussCount * 0.06),
        moodReason: 'hostile text detected despite low vocal energy',
      }
    }
    if (hasFrustration) {
      return {
        mood: 'FRUSTRATED',
        moodConfidence: Math.min(0.88, 0.64 + cussCount * 0.05),
        moodReason: 'frustration markers detected despite low vocal energy',
      }
    }
    return {
      mood: 'CALM',
      moodConfidence: Math.min(0.92, 0.72 + (0.08 - rms) * 2),
      moodReason: `low vocal energy (${(rms * 100).toFixed(0)}%)`,
    }
  }

  // Fallback to text-based
  return detectMoodFromText(text)
}
