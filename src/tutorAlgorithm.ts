export type MasteryState = 'Nicht erhoben' | 'Erstkontakt' | 'In Aufbau' | 'Belastbar' | 'Prüfungsnah'

export type EvidencePoint = {
  kind: 'definition' | 'application' | 'terminology' | 'clinical_reasoning' | 'error_pattern'
  quality: 'weak' | 'mixed' | 'solid'
  note: string
}

export type TutorAssessment = {
  state: MasteryState
  confidence: 'niedrig' | 'mittel' | 'hoch'
  strengths: string[]
  weaknesses: string[]
  nextActions: string[]
}

export type ReviewQueueEntry = {
  id: string
  subjectId: string
  subjectTitle: string
  topicTitle: string
  state: MasteryState
  confidence: 'niedrig' | 'mittel' | 'hoch'
  priority: number
  reason: string
  recommendedSource: string | null
  recommendedPrompt: string | null
  savedAnswerCount: number
  latestSessionAt: string | null
  nextReviewAt: string
  reviewLabel: string
}

export type TutorSessionEvidenceInput = {
  answer: string
  feedback?: string
  prompt?: string
  selectedContent?: {
    title?: string
    kind?: string
    groupTitle?: string
  } | null
}

function inferQuality(score: number): EvidencePoint['quality'] {
  if (score >= 2) return 'solid'
  if (score === 1) return 'mixed'
  return 'weak'
}

export function buildEvidenceFromTutorSession(input: TutorSessionEvidenceInput): EvidencePoint[] {
  const answer = input.answer.trim()
  if (!answer) return []

  const normalized = answer.toLowerCase()
  const hasReasoning = /(weil|deshalb|daher|sodass|somit|prior|zuerst|danach|anschließend)/.test(normalized)
  const hasCaseLanguage = /(patient|fall|situation|klin|notfall|indikation|wenn|bei )/.test(normalized)
  const hasStructure = /(erstens|zweitens|1\.|2\.|zuerst|dann|anschließend)/.test(normalized)
  const hasTerminologyDensity = (answer.match(/[A-Za-zÄÖÜäöüß-]{8,}/g) || []).length >= 3
  const looksTooShort = answer.length < 80

  const definitionScore = Number(answer.length >= 120) + Number(hasStructure)
  const applicationScore = Number(hasCaseLanguage) + Number(Boolean(input.selectedContent))
  const clinicalScore = Number(hasReasoning) + Number(/(prior|eskal|monitor|oxygen|diagnos|therap)/.test(normalized))
  const terminologyScore = Number(hasTerminologyDensity) + Number(answer.length >= 180)

  const points: EvidencePoint[] = [
    {
      kind: 'definition',
      quality: inferQuality(definitionScore),
      note: 'Tutor-Antwort zeigt aktuellen Stand der freien thematischen Erklärung.',
    },
    {
      kind: 'application',
      quality: inferQuality(applicationScore),
      note: 'Tutor-Antwort wurde auf Fallbezug und Anwendungssprache geprüft.',
    },
    {
      kind: 'clinical_reasoning',
      quality: inferQuality(clinicalScore),
      note: 'Tutor-Antwort wurde auf Priorisierung, Begründung und klinische Logik geprüft.',
    },
    {
      kind: 'terminology',
      quality: inferQuality(terminologyScore),
      note: 'Tutor-Antwort wurde auf Begriffsdichte und fachsprachliche Präzision geprüft.',
    },
  ]

  if (looksTooShort || /noch zu knapp|zu knapp/.test((input.feedback || '').toLowerCase())) {
    points.push({
      kind: 'error_pattern',
      quality: 'weak',
      note: 'Antwort war noch zu knapp; aktive Abrufstrecke und ausführlichere freie Erklärung nötig.',
    })
  }

  return points
}

export function deriveAssessment(points: EvidencePoint[]): TutorAssessment {
  const solid = points.filter((p) => p.quality === 'solid').length
  const weak = points.filter((p) => p.quality === 'weak').length
  const terminologyWeak = points.some((p) => p.kind === 'terminology' && p.quality !== 'solid')
  const applicationSolid = points.some((p) => p.kind === 'application' && p.quality === 'solid')
  const clinicalSolid = points.some((p) => p.kind === 'clinical_reasoning' && p.quality === 'solid')

  let state: MasteryState = 'Nicht erhoben'
  if (points.length > 0) state = 'Erstkontakt'
  if (solid >= 2) state = 'In Aufbau'
  if (solid >= 4 && applicationSolid) state = 'Belastbar'
  if (solid >= 5 && applicationSolid && clinicalSolid && !terminologyWeak) state = 'Prüfungsnah'

  let confidence: TutorAssessment['confidence'] = 'niedrig'
  if (points.length >= 4) confidence = 'mittel'
  if (points.length >= 8 && solid >= 4) confidence = 'hoch'

  const strengths = points.filter((p) => p.quality === 'solid').map((p) => p.note)
  const weaknesses = points.filter((p) => p.quality !== 'solid').map((p) => p.note)

  const nextActions = []
  if (terminologyWeak) nextActions.push('Begriffliche Präzision gezielt abprüfen und korrigieren.')
  if (!applicationSolid) nextActions.push('Offene Fallfrage oder Anwendungsszenario stellen.')
  if (!clinicalSolid) nextActions.push('Klinische Priorisierung/Eskalationslogik explizit abfragen.')
  if (weak > solid) nextActions.push('Lehrstrecke verdichten statt sofort weiterzuspringen.')
  if (nextActions.length === 0) nextActions.push('Intervallwiederholung und Variationsfragen einplanen.')

  return {
    state,
    confidence,
    strengths,
    weaknesses,
    nextActions,
  }
}

export function normalizeTopicTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .trim()
}

function tokenize(text: string): string[] {
  return normalizeTopicTitle(text)
    .split(/\s+/)
    .filter((token) => token.length >= 4)
}

export function scoreContentMatch(topicTitle: string, item: { title?: string; note?: string; groupTitle?: string }): number {
  const topicTokens = tokenize(topicTitle)
  const haystack = normalizeTopicTitle([item.title, item.note, item.groupTitle].filter(Boolean).join(' '))
  return topicTokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0)
}

export function pickRecommendedContent<T extends { title?: string; note?: string; groupTitle?: string; source?: string }>(
  topicTitle: string,
  items: T[],
): T | null {
  if (items.length === 0) return null

  const ranked = items
    .map((item, index) => ({ item, index, score: scoreContentMatch(topicTitle, item) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)

  return ranked[0]?.item ?? null
}

function suggestReviewDelayHours(state: MasteryState, confidence: 'niedrig' | 'mittel' | 'hoch'): number {
  if (state === 'Prüfungsnah') return confidence === 'hoch' ? 72 : 48
  if (state === 'Belastbar') return confidence === 'hoch' ? 48 : 24
  if (state === 'In Aufbau') return 12
  if (state === 'Erstkontakt') return 6
  return 2
}

function addHours(baseIso: string | null, hours: number): string {
  const base = baseIso ? new Date(baseIso).getTime() : Date.now()
  return new Date(base + hours * 60 * 60 * 1000).toISOString()
}

function buildReviewLabel(nextReviewAt: string): string {
  const deltaMs = new Date(nextReviewAt).getTime() - Date.now()
  const hours = Math.round(deltaMs / (1000 * 60 * 60))
  if (hours <= 0) return 'jetzt fällig'
  if (hours < 24) return `in ${hours}h`
  const days = Math.round(hours / 24)
  return `in ${days}d`
}

export function buildReviewQueue(
  entries: Array<{
    subjectId: string
    subjectTitle: string
    topicTitle: string
    evidence: EvidencePoint[]
    promptCandidates: string[]
    recommendedSource?: string | null
    savedAnswerCount?: number
    latestSessionAt?: string | null
  }>,
): ReviewQueueEntry[] {
  return entries
    .map((entry) => {
      const assessment = deriveAssessment(entry.evidence)
      const weakCount = entry.evidence.filter((point) => point.quality === 'weak').length
      const mixedCount = entry.evidence.filter((point) => point.quality === 'mixed').length
      const stalePenalty = entry.latestSessionAt
        ? Math.min(2, Math.floor((Date.now() - new Date(entry.latestSessionAt).getTime()) / (1000 * 60 * 60 * 24 * 3)))
        : 2

      const basePriority =
        assessment.state === 'Prüfungsnah'
          ? 1
          : assessment.state === 'Belastbar'
            ? 2
            : assessment.state === 'In Aufbau'
              ? 4
              : assessment.state === 'Erstkontakt'
                ? 5
                : 6

      const priority = basePriority + weakCount + Math.max(0, 2 - mixedCount) + stalePenalty
      const reason = assessment.nextActions[0] || 'Nächsten Tutor-Schritt gezielt wieder aufnehmen.'
      const nextReviewAt = addHours(entry.latestSessionAt ?? null, suggestReviewDelayHours(assessment.state, assessment.confidence))

      return {
        id: `${entry.subjectId}-${entry.topicTitle}`,
        subjectId: entry.subjectId,
        subjectTitle: entry.subjectTitle,
        topicTitle: entry.topicTitle,
        state: assessment.state,
        confidence: assessment.confidence,
        priority,
        reason,
        recommendedSource: entry.recommendedSource ?? null,
        recommendedPrompt: entry.promptCandidates[0] ?? null,
        savedAnswerCount: entry.savedAnswerCount ?? 0,
        latestSessionAt: entry.latestSessionAt ?? null,
        nextReviewAt,
        reviewLabel: buildReviewLabel(nextReviewAt),
      }
    })
    .sort((a, b) => b.priority - a.priority || a.savedAnswerCount - b.savedAnswerCount || a.topicTitle.localeCompare(b.topicTitle, 'de'))
}
