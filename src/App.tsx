import { useEffect, useMemo, useState } from 'react'
import { subjects as initialSubjects, uploadTypes, type ContentItem, type ContentKind, type Subject, type ProgressState } from './data/learningPlan'
import { buildEvidenceFromTutorSession, buildReviewQueue, deriveAssessment, pickRecommendedContent, type EvidencePoint, type ReviewQueueEntry } from './tutorAlgorithm'

const progressTone: Record<ProgressState, string> = {
  'Nicht erhoben': 'tone-muted',
  Erstkontakt: 'tone-caution',
  'In Aufbau': 'tone-build',
  Belastbar: 'tone-good',
  Prüfungsnah: 'tone-strong',
}

const allKinds: ContentKind[] = ['PDF', 'Audio', 'Notiz', 'Seite', 'Link']
const API_BASE = (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://localhost:8787')

const topicEvidenceFixtures: Record<string, EvidencePoint[]> = {
  Atemwegsmanagement: [
    { kind: 'definition', quality: 'solid', note: 'Oxygenierung und Atemwegssicherung werden als getrennte Ziele erkannt.' },
    { kind: 'terminology', quality: 'mixed', note: 'Begriffe zu supraglottischen Hilfen und CICO sind noch nicht ganz sauber.' },
    { kind: 'application', quality: 'solid', note: 'Eskalation bei schwieriger Maskenbeatmung wird strukturiert beschrieben.' },
    { kind: 'clinical_reasoning', quality: 'mixed', note: 'Priorisierung in der echten Notfallsituation ist noch nicht stabil.' },
  ],
  Allgemeinanästhesie: [
    { kind: 'definition', quality: 'mixed', note: 'Komponenten der Allgemeinanästhesie sind grundsätzlich bekannt.' },
    { kind: 'application', quality: 'weak', note: 'Ableitung für konkrete Einleitungsstrategien fehlt noch.' },
  ],
  'Kardiovaskuläres System in Modul 23': [
    { kind: 'definition', quality: 'weak', note: 'Lokaler Kurs ist importiert, aber noch keine echte Tutor-Diagnostik erfolgt.' },
  ],
}

function buildTutorPrompts(title: string) {
  return [
    `Erkläre das Thema „${title}“ in eigenen Worten, als würdest du es einem Kommilitonen kurz vor der Prüfung erklären.`,
    `Welche typische Fehlentscheidung droht bei „${title}“, wenn man nur auswendig gelernt hat, aber die klinische Logik nicht verstanden hat?`,
    `Nenne den nächsten Fall oder die nächste offene Frage, mit der wir „${title}“ prüfungsnah abtesten sollten.`,
  ]
}

type ApiLibraryItem = {
  id: string
  title: string
  subjectId: string
  groupTitle: string
  kind: ContentKind
  source: string
  note: string
  fileName: string | null
  originalName: string | null
  mimeType: string | null
  size: number | null
  uploadedAt: string
  processingStatus?: string
  localPath?: string | null
}

type TutorSessionEntry = {
  id: string
  savedAt: string
  subjectId: string
  topicTitle: string
  prompt: string
  answer: string
  feedback: string
  selectedContent?: {
    title: string
    kind: ContentKind
    groupTitle: string
    source: string
  } | null
  assessment?: {
    state: ProgressState
    confidence: 'niedrig' | 'mittel' | 'hoch'
  } | null
}

function SubjectCard({ subject, active, onSelect }: { subject: Subject; active: boolean; onSelect: () => void }) {
  return (
    <button className={`subject-card ${active ? 'active' : ''}`} onClick={onSelect}>
      <div className="subject-card__top">
        <div>
          <h3>{subject.title}</h3>
          <p>{subject.subtitle}</p>
        </div>
        <span className={`chip ${progressTone[subject.status]}`}>{subject.status}</span>
      </div>
      <p className="subject-card__description">{subject.description}</p>
      <div className="subject-card__meta">
        <span>Confidence: {subject.confidence}</span>
        <span>{subject.topics.length} Themen</span>
      </div>
    </button>
  )
}

function TopicRow({ title, status, evidence, nextStep }: Subject['topics'][number]) {
  return (
    <article className="topic-row">
      <div className="topic-row__header">
        <h4>{title}</h4>
        <span className={`chip ${progressTone[status]}`}>{status}</span>
      </div>
      <p><strong>Evidenz:</strong> {evidence}</p>
      <p><strong>Nächster Schritt:</strong> {nextStep}</p>
    </article>
  )
}

function mergeUploadedItems(base: Subject[], uploadedItems: ApiLibraryItem[]): Subject[] {
  if (uploadedItems.length === 0) return base

  return base.map((subject) => {
    const relevant = uploadedItems.filter((item) => item.subjectId === subject.id)
    if (relevant.length === 0) return subject

    const groups = subject.groups.map((group) => ({ ...group, items: [...group.items] }))
    for (const item of relevant) {
      const mapped: ContentItem = {
        title: item.title,
        kind: item.kind,
        source: item.source,
        note:
          [item.note, item.processingStatus ? `Status: ${item.processingStatus}` : null, item.localPath ? `Pfad: ${item.localPath}` : null]
            .filter(Boolean)
            .join(' • ') || 'Upload über Weboberfläche',
      }
      const existing = groups.find((group) => group.title.toLowerCase() === item.groupTitle.toLowerCase())
      if (existing) {
        const alreadyThere = existing.items.some(
          (existingItem) => existingItem.title === mapped.title && existingItem.kind === mapped.kind && existingItem.note === mapped.note,
        )
        if (!alreadyThere) existing.items.unshift(mapped)
      } else {
        groups.unshift({
          title: item.groupTitle,
          summary: 'Themengebiet aus Import oder Upload übernommen.',
          items: [mapped],
        })
      }
    }

    return { ...subject, groups }
  })
}

export default function App() {
  const [subjects, setSubjects] = useState(initialSubjects)
  const [selectedId, setSelectedId] = useState(subjects[0].id)
  const [kindFilter, setKindFilter] = useState<'Alle' | ContentKind>('Alle')
  const [apiStatus, setApiStatus] = useState<'unknown' | 'online' | 'offline'>('unknown')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState<string>('')
  const [importingAnaesthesie, setImportingAnaesthesie] = useState(false)
  const [importingKardiologie, setImportingKardiologie] = useState(false)
  const [selectedTopicTitle, setSelectedTopicTitle] = useState<string | null>(null)
  const [selectedContentKey, setSelectedContentKey] = useState<string | null>(null)
  const [tutorAnswer, setTutorAnswer] = useState('')
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0)
  const [tutorHistory, setTutorHistory] = useState<TutorSessionEntry[]>([])
  const [allTutorSessions, setAllTutorSessions] = useState<TutorSessionEntry[]>([])
  const [tutorHistoryStatus, setTutorHistoryStatus] = useState('')
  const [formState, setFormState] = useState({
    title: '',
    kind: 'PDF' as ContentKind,
    groupTitle: '',
    note: '',
    source: 'Manueller Upload',
    file: null as File | null,
  })

  const selected = useMemo(() => subjects.find((s) => s.id === selectedId) ?? subjects[0], [selectedId, subjects])

  const selectedTopic = useMemo(
    () => selected.topics.find((topic) => topic.title === selectedTopicTitle) ?? selected.topics[0] ?? null,
    [selected, selectedTopicTitle],
  )

  const availableContent = useMemo(
    () => selected.groups.flatMap((group) => group.items.map((item) => ({ ...item, groupTitle: group.title }))),
    [selected],
  )

  const selectedContent = useMemo(() => {
    const explicit = availableContent.find((item) => `${item.title}-${item.kind}-${item.groupTitle}` === selectedContentKey)
    if (explicit) return explicit
    if (!selectedTopic) return availableContent[0] ?? null
    return pickRecommendedContent(selectedTopic.title, availableContent) ?? availableContent[0] ?? null
  }, [availableContent, selectedContentKey, selectedTopic])

  const tutorEvidence = useMemo(() => {
    const fixtureEvidence = topicEvidenceFixtures[selectedTopic?.title ?? ''] ?? []
    const sessionEvidence = tutorHistory.flatMap((entry) =>
      buildEvidenceFromTutorSession({
        answer: entry.answer,
        feedback: entry.feedback,
        prompt: entry.prompt,
        selectedContent: entry.selectedContent,
      }),
    )
    return [...fixtureEvidence, ...sessionEvidence]
  }, [selectedTopic, tutorHistory])

  const tutorAssessment = useMemo(() => deriveAssessment(tutorEvidence), [tutorEvidence])

  const tutorPrompts = useMemo(() => buildTutorPrompts(selectedTopic?.title ?? selected.title), [selectedTopic, selected.title])

  const reviewQueue = useMemo<ReviewQueueEntry[]>(() => {
    const entries = subjects.flatMap((subject) =>
      subject.topics.map((topic) => {
        const topicSessions = allTutorSessions.filter((entry) => entry.subjectId === subject.id && entry.topicTitle === topic.title)
        const sessionEvidence = topicSessions.flatMap((entry) =>
          buildEvidenceFromTutorSession({
            answer: entry.answer,
            feedback: entry.feedback,
            prompt: entry.prompt,
            selectedContent: entry.selectedContent,
          }),
        )
        const fixtureEvidence = topicEvidenceFixtures[topic.title] ?? []
        const allEvidence = [...fixtureEvidence, ...sessionEvidence]
        const contentCandidates = subject.groups.flatMap((group) => group.items.map((item) => ({ ...item, groupTitle: group.title })))
        const recommended = pickRecommendedContent(topic.title, contentCandidates)
        return {
          subjectId: subject.id,
          subjectTitle: subject.title,
          topicTitle: topic.title,
          evidence: allEvidence,
          promptCandidates: buildTutorPrompts(topic.title),
          recommendedSource: recommended ? `${recommended.title} · ${recommended.groupTitle}` : null,
          savedAnswerCount: topicSessions.length,
          latestSessionAt: topicSessions[0]?.savedAt ?? null,
        }
      }),
    )

    return buildReviewQueue(entries)
  }, [allTutorSessions, subjects])

  const tutorFeedback = useMemo(() => {
    const answer = tutorAnswer.trim().toLowerCase()
    if (!answer) return null
    if (answer.length < 80) {
      return 'Noch zu knapp. Ich würde hier eine längere freie Erklärung oder einen Fallbezug erwarten.'
    }
    if (answer.includes('weil') || answer.includes('daher') || answer.includes('deshalb')) {
      return 'Gut: Du begründest deine Aussage. Als Nächstes würde ich die klinische Priorisierung noch expliziter machen.'
    }
    return 'Solide Basis. Der nächste Schritt wäre mehr Begründung, Begriffsschärfe und ein konkretes Anwendungsszenario.'
  }, [tutorAnswer])

  const tutorQueue = useMemo(() => {
    const queue: Array<{ title: string; detail: string; tone: 'tone-caution' | 'tone-build' | 'tone-good' }> = []

    if (tutorAssessment.weaknesses.length > 0) {
      queue.push({
        title: 'Schwachstelle gezielt nacharbeiten',
        detail: tutorAssessment.weaknesses[0],
        tone: 'tone-caution',
      })
    }

    if (selectedContent) {
      queue.push({
        title: 'Nächste Quelle aktiv nutzen',
        detail: `${selectedContent.title} aus ${selectedContent.groupTitle}`,
        tone: 'tone-build',
      })
    }

    if (tutorHistory.length > 0) {
      queue.push({
        title: 'Auf letzte Tutor-Antwort aufbauen',
        detail: tutorHistory[0].feedback,
        tone: 'tone-good',
      })
    }

    if (queue.length === 0) {
      queue.push({
        title: 'Erste Tutor-Diagnostik starten',
        detail: 'Wähle einen Prompt, beantworte ihn frei und baue daraus die erste Evidenzbasis auf.',
        tone: 'tone-build',
      })
    }

    return queue
  }, [selectedContent, tutorAssessment, tutorHistory])

  const visibleGroups = useMemo(() => {
    if (kindFilter === 'Alle') return selected.groups
    return selected.groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.kind === kindFilter),
      }))
      .filter((group) => group.items.length > 0)
  }, [selected, kindFilter])

  async function loadLibrary() {
    try {
      const health = await fetch(`${API_BASE}/api/health`)
      if (!health.ok) throw new Error('health check failed')
      setApiStatus('online')
      const res = await fetch(`${API_BASE}/api/library`)
      if (!res.ok) throw new Error('library load failed')
      const data = await res.json()
      setSubjects(mergeUploadedItems(initialSubjects, data.items || []))
    } catch {
      setApiStatus('offline')
    }
  }

  useEffect(() => {
    loadLibrary()
  }, [])

  useEffect(() => {
    setSelectedTopicTitle(null)
    setSelectedContentKey(null)
    setSelectedPromptIndex(0)
    setTutorAnswer('')
    setTutorHistory([])
  }, [selectedId])

  useEffect(() => {
    async function loadTutorHistory() {
      if (!selectedTopic) {
        setTutorHistory([])
        return
      }

      if (apiStatus !== 'online') {
        setTutorHistoryStatus('Tutor-Verlauf ist nur mit laufender API persistent.')
        setTutorHistory([])
        setAllTutorSessions([])
        return
      }

      try {
        setTutorHistoryStatus('Lade Tutor-Verlauf...')
        const [topicResponse, allResponse] = await Promise.all([
          fetch(`${API_BASE}/api/tutor-sessions?${new URLSearchParams({
            subjectId: selected.id,
            topicTitle: selectedTopic.title,
          }).toString()}`),
          fetch(`${API_BASE}/api/tutor-sessions`),
        ])
        if (!topicResponse.ok || !allResponse.ok) throw new Error('history load failed')
        const topicData = await topicResponse.json()
        const allData = await allResponse.json()
        setTutorHistory(topicData.items || [])
        setAllTutorSessions(allData.items || [])
        setTutorHistoryStatus(topicData.items?.length ? 'Tutor-Verlauf geladen.' : 'Noch kein gespeicherter Tutor-Verlauf für dieses Thema.')
      } catch {
        setTutorHistory([])
        setAllTutorSessions([])
        setTutorHistoryStatus('Tutor-Verlauf konnte nicht geladen werden.')
      }
    }

    loadTutorHistory()
  }, [apiStatus, selected.id, selectedTopic])

  const submitTutorAnswer = async () => {
    const answer = tutorAnswer.trim()
    if (!answer || !selectedTopic) return

    const fallbackEntry: TutorSessionEntry = {
      id: `local-${Date.now()}`,
      savedAt: new Date().toISOString(),
      subjectId: selected.id,
      topicTitle: selectedTopic.title,
      prompt: tutorPrompts[selectedPromptIndex],
      answer,
      feedback: tutorFeedback ?? 'Antwort gespeichert.',
      selectedContent: selectedContent
        ? {
            title: selectedContent.title,
            kind: selectedContent.kind,
            groupTitle: selectedContent.groupTitle,
            source: selectedContent.source,
          }
        : null,
      assessment: {
        state: tutorAssessment.state,
        confidence: tutorAssessment.confidence,
      },
    }

    if (apiStatus !== 'online') {
      setTutorHistory((prev) => [fallbackEntry, ...prev])
      setAllTutorSessions((prev) => [fallbackEntry, ...prev])
      setTutorHistoryStatus('API offline: Tutor-Antwort nur temporär im Frontend gespeichert.')
      setTutorAnswer('')
      return
    }

    try {
      setTutorHistoryStatus('Speichere Tutor-Antwort...')
      const response = await fetch(`${API_BASE}/api/tutor-sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectId: selected.id,
          topicTitle: selectedTopic.title,
          prompt: tutorPrompts[selectedPromptIndex],
          answer,
          feedback: tutorFeedback ?? 'Antwort gespeichert.',
          selectedContent: fallbackEntry.selectedContent,
          assessment: fallbackEntry.assessment,
        }),
      })
      if (!response.ok) throw new Error('save failed')
      const result = await response.json()
      setTutorHistory((prev) => [result.item, ...prev])
      setAllTutorSessions((prev) => [result.item, ...prev])
      setTutorHistoryStatus('Tutor-Antwort persistent gespeichert.')
      setTutorAnswer('')
    } catch {
      setTutorHistory((prev) => [fallbackEntry, ...prev])
      setAllTutorSessions((prev) => [fallbackEntry, ...prev])
      setTutorHistoryStatus('Speichern auf API fehlgeschlagen; Verlauf nur lokal im Frontend ergänzt.')
      setTutorAnswer('')
    }
  }

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault()
    const title = formState.title.trim()
    const groupTitle = formState.groupTitle.trim()
    if (!title || !groupTitle) {
      setUploadMessage('Bitte mindestens Titel und Themengebiet angeben.')
      return
    }

    if (apiStatus !== 'online') {
      setUploadMessage('Die Upload-API ist gerade nicht erreichbar. Starte `npm run api`.')
      return
    }

    const payload = new FormData()
    payload.append('title', title)
    payload.append('subjectId', selected.id)
    payload.append('groupTitle', groupTitle)
    payload.append('kind', formState.kind)
    payload.append('source', formState.source)
    payload.append('note', formState.note)
    if (formState.file) payload.append('file', formState.file)

    setUploading(true)
    setUploadMessage('Upload läuft...')
    try {
      const response = await fetch(`${API_BASE}/api/upload`, {
        method: 'POST',
        body: payload,
      })
      if (!response.ok) throw new Error('upload failed')
      const result = await response.json()
      setSubjects((prev) => mergeUploadedItems(prev, [result.item]))
      setFormState({
        title: '',
        kind: 'PDF',
        groupTitle: '',
        note: '',
        source: 'Manueller Upload',
        file: null,
      })
      const fileInput = document.getElementById('file-input') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''
      setUploadMessage('Inhalt gespeichert und der Bibliothek hinzugefügt.')
    } catch {
      setUploadMessage('Upload fehlgeschlagen. Prüfe API-Server und Eingaben.')
    } finally {
      setUploading(false)
    }
  }

  const handleAnaesthesiaImport = async () => {
    if (apiStatus !== 'online') {
      setUploadMessage('Import nicht möglich: API offline.')
      return
    }
    setImportingAnaesthesie(true)
    setUploadMessage('Importiere lokalen Anästhesie-Korpus...')
    try {
      const response = await fetch(`${API_BASE}/api/library/import-local/anaesthesie`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('import failed')
      await loadLibrary()
      const result = await response.json()
      setUploadMessage(`Lokaler Anästhesie-Korpus importiert: ${result.importedCount} neue Einträge.`)
    } catch {
      setUploadMessage('Import des lokalen Korpus fehlgeschlagen.')
    } finally {
      setImportingAnaesthesie(false)
    }
  }

  const handleCardiologyImport = async () => {
    if (apiStatus !== 'online') {
      setUploadMessage('Import nicht möglich: API offline.')
      return
    }
    setImportingKardiologie(true)
    setUploadMessage('Importiere lokalen Kardiologie-Korpus...')
    try {
      const response = await fetch(`${API_BASE}/api/library/import-local/kardiologie`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('import failed')
      await loadLibrary()
      const result = await response.json()
      setUploadMessage(`Lokaler Kardiologie-Korpus importiert: ${result.importedCount} neue Einträge.`)
    } catch {
      setUploadMessage('Import des lokalen Kardiologie-Korpus fehlgeschlagen.')
    } finally {
      setImportingKardiologie(false)
    }
  }

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <span className="eyebrow">LMU Lernplattform</span>
          <h1>Medizinische Lernwebapp mit Tutor-, Upload- und Content-Hub</h1>
          <p>
            Die Oberfläche soll nicht nur Themen anzeigen, sondern als wachsender Lernspeicher funktionieren:
            Fachlich strukturiert, evidenzbasiert und offen für neue Inhalte aus Moodle, PDFs, Audioaufnahmen
            und eigenen Notizen.
          </p>
        </div>
        <div className="hero-panel">
          <h2>Produktidee</h2>
          <ul>
            <li>Fach → Themengebiet → Inhalte</li>
            <li>Upload für PDF, Audio, Notizen und Links</li>
            <li>Tutor-Modus mit Wissensstandsdiagnostik</li>
          </ul>
          <div className="hero-status">
            <span className={`chip ${apiStatus === 'online' ? 'tone-good' : apiStatus === 'offline' ? 'tone-caution' : 'tone-muted'}`}>
              API: {apiStatus === 'online' ? 'online' : apiStatus === 'offline' ? 'offline' : 'unbekannt'}
            </span>
          </div>
        </div>
      </header>

      <section className="section-gap detail-panel review-panel">
        <div className="section-title">
          <h2>Nächste Session / Review-Queue</h2>
          <p>Automatisch aus Tutor-Verlauf, Evidenzlage und passendem Content priorisiert.</p>
        </div>
        <div className="review-queue-list">
          {reviewQueue.slice(0, 6).map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`content-item review-queue-item review-queue-button ${selectedId === entry.subjectId && selectedTopic?.title === entry.topicTitle ? 'active' : ''}`}
              onClick={() => {
                setSelectedId(entry.subjectId)
                setSelectedTopicTitle(entry.topicTitle)
                setSelectedPromptIndex(0)
              }}
            >
              <div className="content-item__top review-queue-item__top">
                <div>
                  <strong>{entry.topicTitle}</strong>
                  <p>{entry.subjectTitle}</p>
                </div>
                <div className="detail-meta">
                  <span className={`chip ${progressTone[entry.state]}`}>{entry.state}</span>
                  <span className="chip tone-outline">Priorität {entry.priority}</span>
                </div>
              </div>
              <p><strong>Nächster Tutor-Fokus:</strong> {entry.reason}</p>
              {entry.recommendedSource && <p><strong>Empfohlene Quelle:</strong> {entry.recommendedSource}</p>}
              {entry.recommendedPrompt && <p><strong>Startprompt:</strong> {entry.recommendedPrompt}</p>}
              <p>
                <strong>Verlauf:</strong> {entry.savedAnswerCount} gespeicherte Antworten
                {entry.latestSessionAt ? ` · letzte Session ${new Date(entry.latestSessionAt).toLocaleString('de-DE')}` : ' · noch keine gespeicherte Session'}
              </p>
              <p><strong>Wiedervorlage:</strong> {entry.reviewLabel} · {new Date(entry.nextReviewAt).toLocaleString('de-DE')}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="grid-two">
        <div>
          <div className="section-title">
            <h2>Fächer</h2>
            <p>Wähle den aktuellen Arbeitsbereich.</p>
          </div>
          <div className="subject-list">
            {subjects.map((subject) => (
              <SubjectCard
                key={subject.id}
                subject={subject}
                active={subject.id === selected.id}
                onSelect={() => setSelectedId(subject.id)}
              />
            ))}
          </div>
        </div>

        <div className="detail-panel">
          <div className="section-title">
            <h2>{selected.title}</h2>
            <p>{selected.subtitle}</p>
          </div>

          <div className="detail-meta">
            <span className={`chip ${progressTone[selected.status]}`}>{selected.status}</span>
            <span className="chip tone-outline">Confidence: {selected.confidence}</span>
          </div>

          <p className="detail-description">{selected.description}</p>
          <p><strong>Quellenfokus:</strong> {selected.sourceFocus}</p>

          <div className="section-title section-gap">
            <h3>Themen & Lernstand</h3>
            <p>Mit evidenzbasierter Einschätzung statt künstlicher Pseudo-Präzision.</p>
          </div>
          <div className="topic-list">
            {selected.topics.map((topic) => (
              <button key={topic.title} className={`topic-button ${selectedTopic?.title === topic.title ? 'active' : ''}`} onClick={() => setSelectedTopicTitle(topic.title)}>
                <TopicRow {...topic} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section-gap tutor-shell">
        <div className="section-title">
          <h2>Tutor-Ansicht</h2>
          <p>Pro Thema und Inhalt: diagnostisch, evidenzbasiert und auf den nächsten sinnvollen Lernschritt ausgerichtet.</p>
        </div>

        <div className="grid-two tutor-grid">
          <div className="detail-panel">
            <div className="section-title">
              <h3>{selectedTopic?.title ?? selected.title}</h3>
              <p>Fokus-Thema für die nächste Tutor-Interaktion.</p>
            </div>
            <div className="tutor-evidence-meta">
              <span>{tutorEvidence.length} Evidenzpunkte</span>
              <span>{tutorHistory.length} gespeicherte Tutor-Antworten</span>
            </div>
            <div className="detail-meta">
              <span className={`chip ${progressTone[tutorAssessment.state]}`}>{tutorAssessment.state}</span>
              <span className="chip tone-outline">Confidence: {tutorAssessment.confidence}</span>
            </div>

            <div className="tutor-columns">
              <div>
                <h4>Stärken</h4>
                <ul>
                  {tutorAssessment.strengths.length > 0 ? tutorAssessment.strengths.map((entry) => <li key={entry}>{entry}</li>) : <li>Noch keine belastbare Stärke erhoben.</li>}
                </ul>
              </div>
              <div>
                <h4>Schwachstellen</h4>
                <ul>
                  {tutorAssessment.weaknesses.length > 0 ? tutorAssessment.weaknesses.map((entry) => <li key={entry}>{entry}</li>) : <li>Aktuell keine dokumentierten Schwächen.</li>}
                </ul>
              </div>
            </div>

            <div className="section-title section-gap">
              <h4>Nächste Tutor-Schritte</h4>
            </div>
            <ul>
              {tutorAssessment.nextActions.map((entry) => <li key={entry}>{entry}</li>)}
            </ul>

            <div className="section-title section-gap">
              <h4>Study Queue</h4>
              <p>Was als Nächstes mit hoher Priorität gelernt oder geprüft werden sollte.</p>
            </div>
            <div className="queue-list">
              {tutorQueue.map((entry) => (
                <article key={`${entry.title}-${entry.detail}`} className="queue-card">
                  <div className="content-item__top">
                    <strong>{entry.title}</strong>
                    <span className={`chip ${entry.tone}`}>Next</span>
                  </div>
                  <p>{entry.detail}</p>
                </article>
              ))}
            </div>

            <div className="section-title section-gap">
              <h4>Evidenzbasis</h4>
              <p>Statische Startannahmen plus Heuristiken aus echten gespeicherten Tutor-Antworten.</p>
            </div>
            <div className="content-list compact-list">
              {tutorEvidence.map((entry, index) => (
                <article key={`${entry.kind}-${entry.note}-${index}`} className="content-item">
                  <div className="content-item__top">
                    <strong>{entry.kind}</strong>
                    <span className={`chip ${entry.quality === 'solid' ? 'tone-good' : entry.quality === 'mixed' ? 'tone-build' : 'tone-caution'}`}>{entry.quality}</span>
                  </div>
                  <p>{entry.note}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="detail-panel">
            <div className="section-title">
              <h3>Passender Inhalt</h3>
              <p>Welche Quelle wir als Nächstes zum Thema ziehen oder abprüfen sollten.</p>
            </div>
            <div className="content-list compact-list">
              {selected.groups.flatMap((group) => group.items.map((item) => {
                const key = `${item.title}-${item.kind}-${group.title}`
                return (
                  <button key={key} className={`content-select ${selectedContent && `${selectedContent.title}-${selectedContent.kind}-${selectedContent.groupTitle}` === key ? 'active' : ''}`} onClick={() => setSelectedContentKey(key)}>
                    <strong>{item.title}</strong>
                    <span className="chip tone-outline">{item.kind}</span>
                    <span className="content-select__meta">{group.title}</span>
                  </button>
                )
              }))}
            </div>

            {selectedContent && (
              <div className="section-gap tutor-source-card">
                <p className="auto-match-hint">Automatisch vorgeschlagene Bezugsquelle für dieses Thema{selectedContentKey ? ' (manuell überschrieben)' : ''}.</p>
                <h4>{selectedContent.title}</h4>
                <p><strong>Quelle:</strong> {selectedContent.source}</p>
                <p><strong>Einordnung:</strong> {selectedContent.groupTitle}</p>
                <p>{selectedContent.note}</p>
              </div>
            )}

            <div className="section-title section-gap">
              <h4>Tutor-Prompts</h4>
            </div>
            <div className="prompt-list">
              {tutorPrompts.map((prompt, index) => (
                <button
                  key={prompt}
                  type="button"
                  className={`prompt-card ${selectedPromptIndex === index ? 'active' : ''}`}
                  onClick={() => setSelectedPromptIndex(index)}
                >
                  <span className="chip tone-outline">Prompt {index + 1}</span>
                  <strong>{prompt}</strong>
                </button>
              ))}
            </div>

            <div className="section-title section-gap">
              <h4>Antwort üben</h4>
              <p>Prompt wählen, freie Antwort eingeben, direktes Feedback bekommen und den Verlauf themenbezogen persistieren.</p>
            </div>
            <textarea
              className="tutor-textarea"
              value={tutorAnswer}
              onChange={(e) => setTutorAnswer(e.target.value)}
              placeholder={`Beantworte: ${tutorPrompts[selectedPromptIndex]}`}
            />
            <div className="upload-form__actions">
              <button className="upload-button" type="button" onClick={submitTutorAnswer}>
                Tutor-Antwort speichern
              </button>
              {tutorFeedback && <div className="upload-message">{tutorFeedback}</div>}
              {tutorHistoryStatus && <div className="upload-message">{tutorHistoryStatus}</div>}
            </div>

            {tutorHistory.length > 0 && (
              <div className="section-gap tutor-history">
                <h4>Antwortverlauf</h4>
                {tutorHistory.map((entry, index) => (
                  <article key={`${entry.prompt}-${index}`} className="content-item">
                    <p><strong>Gespeichert:</strong> {new Date(entry.savedAt).toLocaleString('de-DE')}</p>
                    {entry.assessment && (
                      <p>
                        <strong>Stand beim Speichern:</strong> {entry.assessment.state} · Confidence: {entry.assessment.confidence}
                      </p>
                    )}
                    <p><strong>Prompt:</strong> {entry.prompt}</p>
                    <p><strong>Deine Antwort:</strong> {entry.answer}</p>
                    <p><strong>Feedback:</strong> {entry.feedback}</p>
                    {entry.assessment && <p><strong>Abgeleiteter Lernstand:</strong> {entry.assessment.state} · {entry.assessment.confidence}</p>}
                    {entry.selectedContent && (
                      <p>
                        <strong>Bezugsquelle:</strong> {entry.selectedContent.title} ({entry.selectedContent.kind}) · {entry.selectedContent.groupTitle}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section-gap upload-shell">
        <div className="section-title">
          <h2>Upload & Dateneinspeisung</h2>
          <p>
            Hier soll künftig alles hineinlaufen: Moodle-Dateien, PDFs, Diktiergerät-Audio, Voice-Notizen und eigene
            Lernzusammenfassungen.
          </p>
        </div>

        <div className="upload-grid upload-grid--info">
          {uploadTypes.map((entry) => (
            <article key={entry.label} className="upload-card">
              <h3>{entry.label}</h3>
              <div className="kind-row">
                {entry.kinds.map((kind) => (
                  <span key={kind} className="chip tone-outline">{kind}</span>
                ))}
              </div>
              <p>{entry.purpose}</p>
            </article>
          ))}
        </div>

        <div className="import-bar section-gap">
          <button className="upload-button" type="button" onClick={handleAnaesthesiaImport} disabled={importingAnaesthesie}>
            {importingAnaesthesie ? 'Importiert...' : 'Lokalen Anästhesie-Korpus importieren'}
          </button>
          <button className="upload-button" type="button" onClick={handleCardiologyImport} disabled={importingKardiologie}>
            {importingKardiologie ? 'Importiert...' : 'Lokalen Kardiologie-Korpus importieren'}
          </button>
        </div>

        <form className="upload-form section-gap" onSubmit={handleUpload}>
          <div className="section-title">
            <h3>Inhalt hochladen</h3>
            <p>
              Die Form spricht jetzt die lokale Upload-API an. Inhalte werden gespeichert und direkt in die Bibliothek
              des gewählten Fachs übernommen. Audio-Uploads werden nach Möglichkeit sofort transkribiert und als
              zusätzlicher Bibliothekseintrag abgelegt.
            </p>
          </div>

          <div className="form-grid">
            <label>
              Titel
              <input
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                placeholder="z. B. Seminar Herzinsuffizienz 2026"
              />
            </label>
            <label>
              Typ
              <select
                value={formState.kind}
                onChange={(e) => setFormState({ ...formState, kind: e.target.value as ContentKind })}
              >
                {allKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Themengebiet
              <input
                value={formState.groupTitle}
                onChange={(e) => setFormState({ ...formState, groupTitle: e.target.value })}
                placeholder="z. B. Atemweg & Einleitung"
              />
            </label>
            <label>
              Quelle
              <input
                value={formState.source}
                onChange={(e) => setFormState({ ...formState, source: e.target.value })}
                placeholder="z. B. Seminaraufnahme / manuell hochgeladen"
              />
            </label>
            <label>
              Datei
              <input
                id="file-input"
                type="file"
                onChange={(e) => setFormState({ ...formState, file: e.target.files?.[0] ?? null })}
              />
            </label>
            <label className="form-grid__full">
              Notiz / Verarbeitungsidee
              <textarea
                value={formState.note}
                onChange={(e) => setFormState({ ...formState, note: e.target.value })}
                placeholder="z. B. später transkribieren und an Herzinsuffizienz zuordnen"
              />
            </label>
          </div>
          <div className="upload-form__actions">
            <button className="upload-button" type="submit" disabled={uploading}>
              {uploading ? 'Speichert...' : 'Upload speichern'}
            </button>
            {uploadMessage && <div className="upload-message">{uploadMessage}</div>}
          </div>
        </form>
      </section>

      <section className="section-gap library-shell">
        <div className="section-title">
          <h2>Content Library</h2>
          <p>
            Fachlich gegliedert und filterbar — hier laufen später Moodle-Importe, Audio-Transkripte, PDFs und eigene
            Notizen zusammen.
          </p>
        </div>

        <div className="filter-row">
          <span className="filter-row__label">Filter nach Typ:</span>
          <button className={`filter-chip ${kindFilter === 'Alle' ? 'active' : ''}`} onClick={() => setKindFilter('Alle')}>
            Alle
          </button>
          {allKinds.map((kind) => (
            <button
              key={kind}
              className={`filter-chip ${kindFilter === kind ? 'active' : ''}`}
              onClick={() => setKindFilter(kind)}
            >
              {kind}
            </button>
          ))}
        </div>

        <div className="group-list section-gap">
          {visibleGroups.map((group) => (
            <section key={group.title} className="group-card">
              <h4>{group.title}</h4>
              <p>{group.summary}</p>
              <div className="content-list">
                {group.items.map((item) => (
                  <article key={`${group.title}-${item.title}-${item.kind}-${item.note}`} className="content-item">
                    <div className="content-item__top">
                      <strong>{item.title}</strong>
                      <span className="chip tone-outline">{item.kind}</span>
                    </div>
                    <p><strong>Quelle:</strong> {item.source}</p>
                    <p>{item.note}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {visibleGroups.length === 0 && <div className="empty-state">Für diesen Filter gibt es im aktuellen Fach noch keine Inhalte.</div>}
        </div>
      </section>
    </div>
  )
}
