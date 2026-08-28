import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const DATASET = 'MikCil/f1-team-radio'
const ROWS_ENDPOINT = 'https://datasets-server.huggingface.co/rows'
const pageSize = 100

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(scriptDir, '..', 'data')

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=')
    return [key, value]
  }),
)

const sampleSize = Number(args.limit || 1000)
const fromYear = Number(args['from-year'] || 2019)
const seed = Number(args.seed || 20260818)
const scanPages = Number(args['scan-pages'] || Math.max(18, Math.ceil(sampleSize / pageSize) * 2))
const rawFile = args['raw-file'] ? path.resolve(process.cwd(), args['raw-file']) : null
const reviewLimit = Number(args['review-limit'] || 500)

const DRIVER_PHRASES = [
  /\b(?:the )?(?:rear|front|car|tyres?|tires?|brakes?|engine|power unit|pu|gearbox|pedal|steering)\b.*\b(?:is|are|feels?|feel|gone|bad|broken|hot|cold|sliding|moving|locking|struggling)\b/i,
  /\b(?:i|i'm|im|my)\b.*\b(?:can't|cannot|can not|have|feel|lost|losing|struggling|need|think)\b/i,
  /\b(?:do we|should we|can i|what(?:'s| is) the plan|how long)\b/i,
  /\b(?:undriveable|terrible|unbelievable|ridiculous|no grip|no traction|can't hear|cannot hear)\b/i,
]

const ENGINEER_COMMANDS = [
  'box', 'pit', 'push', 'lift', 'coast', 'manage', 'save', 'attack', 'hold', 'stay',
  'use', 'avoid', 'take', 'switch', 'change', 'confirm', 'remember', 'keep', 'target',
]

const ENGINEER_PHRASES = [
  new RegExp(`^\\s*(?:${ENGINEER_COMMANDS.join('|')})\\b`, 'i'),
  /\b(?:you need to|we need to|you can|you have to|let's|lets)\b/i,
  /\b(?:copy|understood|radio check|safety car is|virtual safety car|blue flag)\b/i,
  /\b(?:delta|ers|drs|strat(?:egy)?|plan [a-z]|lift and coast)\b/i,
  /\b(?:okay|copy),?\s+[A-Z][a-z]+\b/,
  /(?:^|[,.]\s*)(?:okay,?\s*)?(?:lewis|lando|oscar|max|charles|carlos|fernando|george|alex|daniel|pierre|esteban|nico|kevin|valtteri|sergio|yuki|lance|zhou|logan|franco|oliver|gabriel|isack|kimi|liam|joe)\b/i,
  /\b(?:full push|maximum push|push now|hold position|stay out|in this lap)\b/i,
]

const TURN_MARKER = /(?<=[.!?])\s+|\s+(?=(?:okay|copy|understood|right|so)\b[,!]?\s+)/gi
const CONTEXT_ONLY = /^(?:okay|ok|copy|understood|affirmative|negative|yep|yeah|no|yes|thanks|thank you|received|roger|10-4)[.! ]*$/i

function seededRank(value) {
  let hash = seed
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x5bd1e995)
    hash ^= hash >>> 13
  }
  return hash >>> 0
}

function normalise(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()
}

function splitCandidateTurns(transcription) {
  const cleaned = normalise(transcription)
  if (!cleaned) return []

  return cleaned
    .split(TURN_MARKER)
    .map(normalise)
    .filter((turn) => turn.length >= 3)
}

function classifySpeaker(text) {
  if (CONTEXT_ONLY.test(text)) {
    return {
      speaker: 'unknown',
      confidence: 0.94,
      reasons: ['acknowledgement-only'],
      needs_review: false,
      ignored_for_retrieval: true,
      review_priority: 0,
    }
  }

  let driverScore = 0
  let engineerScore = 0
  const reasons = []

  for (const pattern of DRIVER_PHRASES) {
    if (pattern.test(text)) {
      driverScore += pattern.source.includes('do we') ? 2 : 3
      reasons.push('driver-reporting-language')
    }
  }

  for (const pattern of ENGINEER_PHRASES) {
    if (pattern.test(text)) {
      engineerScore += pattern.source.startsWith('^') ? 3 : 2
      reasons.push('engineer-instruction-language')
    }
  }

  const difference = driverScore - engineerScore
  let speaker = 'unknown'
  if (difference >= 2) speaker = 'driver_to_engineer'
  if (difference <= -2) speaker = 'engineer_to_driver'

  const strongest = Math.max(driverScore, engineerScore)
  const confidence = speaker === 'unknown'
    ? Math.min(0.54, Number((0.3 + strongest * 0.05).toFixed(2)))
    : Math.min(0.96, Number((0.58 + Math.abs(difference) * 0.09 + strongest * 0.025).toFixed(2)))

  return {
    speaker,
    confidence,
    reasons: [...new Set(reasons)],
    needs_review: speaker === 'unknown' || confidence < 0.78,
    ignored_for_retrieval: false,
    review_priority: speaker === 'unknown'
      ? Math.min(100, text.length + (/(?:rear|front|tyre|tire|brake|power|engine|radio|box|pit|push|lift|coast|delta|safety)/i.test(text) ? 30 : 0))
      : 0,
  }
}

async function fetchRows(offset) {
  const url = new URL(ROWS_ENDPOINT)
  url.searchParams.set('dataset', DATASET)
  url.searchParams.set('config', 'default')
  url.searchParams.set('split', 'train')
  url.searchParams.set('offset', String(offset))
  url.searchParams.set('length', String(pageSize))

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { 'user-agent': 'pitwall-copilot-dataset-ingestion/1.0' } })
    if (response.ok) return response.json()

    if (response.status !== 429 || attempt === 3) {
      throw new Error(`Dataset request failed (${response.status}) at offset ${offset}`)
    }

    const retryAfter = Number(response.headers.get('retry-after'))
    const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1500 * (attempt + 1)
    console.log(`Rate limited at offset ${offset}; retrying in ${Math.ceil(delayMs / 1000)}s`)
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

async function fetchInBatches(offsets, batchSize = 3) {
  const pages = []
  for (let index = 0; index < offsets.length; index += batchSize) {
    const batch = offsets.slice(index, index + batchSize)
    const result = await Promise.all(batch.map(fetchRows))
    pages.push(...result)
    console.log(`Fetched ${Math.min(index + batch.length, offsets.length)} / ${offsets.length} representative pages`)
  }
  return pages
}

function selectDiverseRows(rows) {
  const groups = new Map()
  for (const row of rows) {
    const year = Number(row.session_date?.slice(0, 4))
    if (!Number.isFinite(year) || year < fromYear || !row.transcription?.trim()) continue

    // A race-driver group avoids filling the sample with a single driver or weekend.
    const groupKey = `${year}|${row.grand_prix}|${row.driver_id}`
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey).push(row)
  }

  for (const group of groups.values()) {
    group.sort((left, right) => seededRank(left.id) - seededRank(right.id))
  }

  const groupKeys = [...groups.keys()].sort((left, right) => seededRank(left) - seededRank(right))
  const selected = []
  let index = 0
  while (selected.length < sampleSize) {
    let addedThisPass = 0
    for (const groupKey of groupKeys) {
      const candidate = groups.get(groupKey)[index]
      if (candidate) {
        selected.push(candidate)
        addedThisPass += 1
        if (selected.length === sampleSize) break
      }
    }
    if (!addedThisPass) break
    index += 1
  }
  return selected
}

function buildTurns(rows) {
  return rows.flatMap((row) => splitCandidateTurns(row.transcription).map((text, index) => {
    const analysis = classifySpeaker(text)
    return {
      id: `${row.id}::turn-${index + 1}`,
      source_id: row.id,
      turn_index: index + 1,
      text,
      direction: analysis.speaker,
      speaker_confidence: analysis.confidence,
      classification_reasons: analysis.reasons,
      needs_review: analysis.needs_review,
      ignored_for_retrieval: analysis.ignored_for_retrieval,
      review_priority: analysis.review_priority,
      driver_id: row.driver_id,
      racing_number: row.racing_number,
      grand_prix: row.grand_prix,
      race_id: row.race_id,
      session_date: row.session_date,
      message_timestamp: row.message_timestamp,
    }
  }))
}

async function main() {
  console.log(`Reading ${DATASET}; selecting ${sampleSize} raw rows from ${fromYear} onward.`)
  let sampledRows
  let sourceRowsAvailable
  let representativePages = null
  let sourceType = 'datasets-server-sample'

  if (rawFile) {
    sampledRows = JSON.parse(await readFile(rawFile, 'utf8'))
    sourceRowsAvailable = sampledRows.length
    sourceType = 'metadata-parquet-query'
    console.log(`Using ${sampledRows.length} metadata rows from ${rawFile}`)
  } else {
    const firstPage = await fetchRows(0)
    const maxOffset = Math.max(0, firstPage.num_rows_total - pageSize)
    const offsets = [...new Set(Array.from({ length: scanPages }, (_, index) => {
      const position = scanPages === 1 ? 0 : index / (scanPages - 1)
      return Math.floor((maxOffset * position) / pageSize) * pageSize
    }))]
    const pages = await fetchInBatches(offsets)
    sampledRows = pages.flatMap((page) => page.rows.map((item) => item.row))
    sourceRowsAvailable = firstPage.num_rows_total
    representativePages = offsets.length
  }

  const selectedRows = selectDiverseRows(sampledRows)
  if (selectedRows.length < sampleSize) {
    throw new Error(`Only found ${selectedRows.length} eligible rows from ${fromYear} onward.`)
  }

  const turns = buildTurns(selectedRows)
  const unresolvedTurns = turns.filter((turn) => turn.needs_review)
  // Review the most meaningful uncertain turns first. All unresolved turns are
  // retained separately, so no source data is lost.
  const reviewQueue = [...unresolvedTurns]
    .sort((left, right) => right.review_priority - left.review_priority || left.id.localeCompare(right.id))
    .slice(0, reviewLimit)
  const manifest = {
    generated_at: new Date().toISOString(),
    source_dataset: DATASET,
    source_type: sourceType,
    source_rows_available: sourceRowsAvailable,
    source_rows_scanned: sampledRows.length,
    filters: { minimum_session_year: fromYear, raw_row_limit: sampleSize, representative_pages: representativePages, seed },
    output: {
      raw_rows_selected: selectedRows.length,
      candidate_turns: turns.length,
      auto_accepted: turns.length - unresolvedTurns.length,
      unresolved_turns: unresolvedTurns.length,
      manual_review_batch: reviewQueue.length,
    },
  }

  await mkdir(dataDir, { recursive: true })
  await Promise.all([
    writeFile(path.join(dataDir, 'f1-radio-turns.json'), JSON.stringify(turns, null, 2)),
    writeFile(path.join(dataDir, 'f1-radio-turns-review.json'), JSON.stringify(reviewQueue, null, 2)),
    writeFile(path.join(dataDir, 'f1-radio-turns-unresolved.json'), JSON.stringify(unresolvedTurns, null, 2)),
    writeFile(path.join(dataDir, 'f1-radio-turns.manifest.json'), JSON.stringify(manifest, null, 2)),
  ])

  console.log(JSON.stringify(manifest.output, null, 2))
  console.log(`Saved turn dataset and review queue in ${dataDir}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
