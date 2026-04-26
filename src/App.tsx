import { useEffect, useMemo, useState } from 'react'
import { subjects as initialSubjects, uploadTypes, type ContentItem, type ContentKind, type Subject, type ProgressState } from './data/learningPlan'
import { buildEvidenceFromTutorSession, buildReviewQueue, deriveAssessment, pickRecommendedContent, type EvidencePoint, type ReviewQueueEntry } from './tutorAlgorithm'

const progressTone: Record<ProgressState, string> = {
  'Nicht erhoben': 'badge-muted',
  Erstkontakt: 'badge-caution',
  'In Aufbau': 'badge-build',
  Belastbar: 'badge-good',
  'Prüfungsnah': 'badge-strong',
}

const statusOrder: Record<ProgressState, number> = {
  'Nicht erhoben': 0,
  Erstkontakt: 1,
  'In Aufbau': 2,
  Belastbar: 3,
  'Prüfungsnah': 4,
}

const allKinds: ContentKind[] = ['PDF', 'Audio', 'Notiz', 'Seite', 'Link']
const API_BASE = (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : 'http://localhost:8787')

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
  selectedContent?: { title: string; kind: ContentKind; groupTitle: string; source: string } | null
  assessment?: { state: ProgressState; confidence: 'niedrig' | 'mittel' | 'hoch' } | null
}

type ViewType = 'dashboard' | 'topics' | 'tutor' | 'library' | 'upload'

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
        note: [item.note, item.processingStatus ? `Status: ${item.processingStatus}` : null, item.localPath ? `Pfad: ${item.localPath}` : null]
          .filter(Boolean).join(' • ') || 'Upload über Weboberfläche',
      }
      const existing = groups.find((group) => group.title.toLowerCase() === item.groupTitle.toLowerCase())
      if (existing) {
        const alreadyThere = existing.items.some((existingItem) => existingItem.title === mapped.title && existingItem.kind === mapped.kind && existingItem.note === mapped.note)
        if (!alreadyThere) existing.items.unshift(mapped)
      } else {
        groups.unshift({ title: item.groupTitle, summary: 'Themengebiet aus Import oder Upload übernommen.', items: [mapped] })
      }
    }
    return { ...subject, groups }
  })
}

function Sidebar({ subjects, selectedId, onSelect, view, onViewChange }: {
  subjects: Subject[]
  selectedId: string
  onSelect: (id: string) => void
  view: ViewType
  onViewChange: (v: ViewType) => void
}) {
  const selected = subjects.find((s) => s.id === selectedId) ?? subjects[0]
  const overallProgress = Math.round(
    (subjects.flatMap((s) => s.topics).filter((t) => statusOrder[t.status] >= 3).length /
      Math.max(1, subjects.flatMap((s) => s.topics).length)) * 100
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">📚 LMU Lernapp</div>
      
      <div className="sidebar-section">
        <div className="sidebar-section-title">Navigation</div>
        <button className={`sidebar-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => onViewChange('dashboard')}>
          📊 Dashboard
        </button>
        <button className={`sidebar-item ${view === 'topics' ? 'active' : ''}`} onClick={() => onViewChange('topics')}>
          📖 Themen
        </button>
        <button className={`sidebar-item ${view === 'tutor' ? 'active' : ''}`} onClick={() => onViewChange('tutor')}>
          🎓 Tutor
        </button>
        <button className={`sidebar-item ${view === 'library' ? 'active' : ''}`} onClick={() => onViewChange('library')}>
          📁 Bibliothek
        </button>
        <button className={`sidebar-item ${view === 'upload' ? 'active' : ''}`} onClick={() => onViewChange('upload')}>
          ⬆️ Upload
        </button>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-title">Fächer</div>
        {subjects.map((subject) => (
          <button
            key={subject.id}
            className={`sidebar-item ${subject.id === selectedId ? 'active' : ''}`}
            onClick={() => { onSelect(subject.id); onViewChange('topics') }}
          >
            <span className={`sidebar-item-status status-${statusOrder[subject.status]}`} />
            {subject.title}
          </button>
        ))}
      </div>

      <div className="sidebar-progress">
        <div className="progress-label">Gesamtfortschritt: {overallProgress}%</div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${overallProgress}%` }} />
        </div>
      </div>
    </aside>
  )
}

function Header({ apiStatus, title }: { apiStatus: string; title: string }) {
  return (
    <header className="header">
      <h1 className="header-title">{title}</h1>
      <div className="header-meta">
        <span className={`api-badge ${apiStatus}`}>
          {apiStatus === 'online' ? '🟢' : apiStatus === 'offline' ? '🔴' : '⚪'} API {apiStatus}
        </span>
      </div>
    </header>
  )
}

function DashboardView({ subjects, reviewQueue, onNavigate }: {
  subjects: Subject[]
  reviewQueue: ReviewQueueEntry[]
  onNavigate: (view: ViewType, subjectId?: string, topicTitle?: string) => void
}) {
  return (
    <div className="content-container animate-fade-in">
      <div className="section-header">
        <h2 className="section-title">Dashboard</h2>
        <p className="section-description">Dein Lernfortschritt auf einen Blick</p>
      </div>

      <div className="grid-3" style={{ marginBottom: 32 }}>
        {subjects.map((subject) => (
          <div key={subject.id} className="card" onClick={() => onNavigate('topics', subject.id)} style={{ cursor: 'pointer' }}>
            <div className="card-header">
              <div>
                <div className="card-title">{subject.title}</div>
                <div className="card-subtitle">{subject.subtitle}</div>
              </div>
              <span className={`badge ${progressTone[subject.status]}`}>{subject.status}</span>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 16 }}>{subject.description}</p>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <span>{subject.topics.length} Themen</span>
              <span>Confidence: {subject.confidence}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="section-header">
        <h2 className="section-title">🔥 Nächste Session</h2>
        <p className="section-description">Priorisiert nach Lernstand und Wiedervorlage</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reviewQueue.slice(0, 5).map((entry) => (
          <button
            key={entry.id}
            className="queue-card"
            onClick={() => onNavigate('tutor', entry.subjectId, entry.topicTitle)}
          >
            <div className="queue-header">
              <span className="queue-title">{entry.topicTitle}</span>
              <span className={`badge ${progressTone[entry.state]}`}>{entry.state}</span>
            </div>
            <div className="queue-meta">
              <span>{entry.subjectTitle}</span>
              <span>•</span>
              <span>Priorität {entry.priority}</span>
              <span>•</span>
              <span>Wiedervorlage: {entry.reviewLabel}</span>
            </div>
            <p className="queue-reason">{entry.reason}</p>
            {entry.recommendedSource && <p className="queue-source">📖 {entry.recommendedSource}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}

function TopicsView({ subject, selectedTopic, onSelectTopic }: {
  subject: Subject
  selectedTopic: string | null
  onSelectTopic: (title: string) => void
}) {
  return (
    <div className="content-container animate-fade-in">
      <div className="section-header">
        <h2 className="section-title">{subject.title}</h2>
        <p className="section-description">{subject.description}</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <span className={`badge ${progressTone[subject.status]}`}>{subject.status}</span>
        <span className="badge badge-muted">Confidence: {subject.confidence}</span>
        <span className="badge badge-muted">{subject.topics.length} Themen</span>
      </div>

      <div className="grid-2">
        {subject.topics.map((topic) => (
          <button
            key={topic.title}
            className={`topic-card ${selectedTopic === topic.title ? 'active' : ''}`}
            onClick={() => onSelectTopic(topic.title)}
          >
            <div className="topic-card-header">
              <span className="topic-card-title">{topic.title}</span>
              <span className={`badge ${progressTone[topic.status]}`}>{topic.status}</span>
            </div>
            <p className="topic-card-evidence">{topic.evidence}</p>
            <p className="topic-card-next">→ {topic.nextStep}</p>
          </button>
        ))}
      </div>

      {selectedTopic && (
        <div style={{ marginTop: 32 }}>
          <div className="section-header">
            <h3 className="section-title">Inhalte zu diesem Thema</h3>
          </div>
          <div className="content-grid">
            {subject.groups.flatMap((group) =>
              group.items.map((item) => (
                <div key={`${group.title}-${item.title}`} className="content-card">
                  <div className="content-card-header">
                    <span className="content-card-title">{item.title}</span>
                    <span className="badge badge-muted">{item.kind}</span>
                  </div>
                  <p className="content-card-meta">{group.title} • {item.source}</p>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 8 }}>{item.note}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TutorView({ subject, topic, tutorHistory, allSessions, onSubmit }: {
  subject: Subject
  topic: { title: string; status: ProgressState } | null
  tutorHistory: TutorSessionEntry[]
  allSessions: TutorSessionEntry[]
  onSubmit: (answer: string, promptIndex: number) => void
}) {
  const [answer, setAnswer] = useState('')
  const [promptIndex, setPromptIndex] = useState(0)

  const prompts = useMemo(() => [
    `Erkläre das Thema „${topic?.title ?? subject.title}“ in eigenen Worten, als würdest du es einem Kommilitonen kurz vor der Prüfung erklären.`,
    `Welche typische Fehlentscheidung droht bei „${topic?.title ?? subject.title}“, wenn man nur auswendig gelernt hat?`,
    `Nenne den nächsten Fall oder die nächste offene Frage, mit der wir „${topic?.title ?? subject.title}“ prüfungsnah abtesten sollten.`,
  ], [topic, subject.title])

  const evidence = useMemo(() => {
    return tutorHistory.flatMap((entry) =>
      buildEvidenceFromTutorSession({ answer: entry.answer, feedback: entry.feedback, prompt: entry.prompt, selectedContent: entry.selectedContent })
    )
  }, [tutorHistory])

  const assessment = useMemo(() => deriveAssessment(evidence), [evidence])

  if (!topic) {
    return (
      <div className="content-container">
        <div className="empty-state">
          <div className="empty-state-icon">🎓</div>
          <h3>Wähle ein Thema</h3>
          <p>Gehe zu den Themen und wähle eines aus, um mit dem Tutor zu starten.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="content-container animate-fade-in">
      <div className="section-header">
        <h2 className="section-title">🎓 Tutor: {topic.title}</h2>
        <p className="section-description">Diagnostisch, evidenzbasiert und auf den nächsten Lernschritt ausgerichtet</p>
      </div>

      <div className="grid-2">
        <div className="tutor-panel">
          <div className="tutor-header">
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <span className={`badge ${progressTone[assessment.state]}`}>{assessment.state}</span>
              <span className="badge badge-muted">Confidence: {assessment.confidence}</span>
            </div>
            <div className="tutor-evidence-bar">
              <span className="evidence-stat">📊 {evidence.length} Evidenzpunkte</span>
              <span className="evidence-stat">💬 {tutorHistory.length} Antworten</span>
            </div>
          </div>

          <div className="tutor-assessment">
            <div className="assessment-column">
              <h4>Stärken</h4>
              <ul>
                {assessment.strengths.length > 0 ? assessment.strengths.map((s, i) => <li key={i}>{s}</li>) : <li>Noch keine Stärken erhoben</li>}
              </ul>
            </div>
            <div className="assessment-column">
              <h4>Schwachstellen</h4>
              <ul>
                {assessment.weaknesses.length > 0 ? assessment.weaknesses.map((s, i) => <li key={i}>{s}</li>) : <li>Aktuell keine Schwächen dokumentiert</li>}
              </ul>
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Nächste Schritte
            </h4>
            <ul>
              {assessment.nextActions.map((a, i) => <li key={i} style={{ padding: '8px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-light)' }}>{a}</li>)}
            </ul>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Wähle einen Prompt</h3>
          {prompts.map((prompt, i) => (
            <button
              key={i}
              className={`prompt-card ${promptIndex === i ? 'active' : ''}`}
              onClick={() => setPromptIndex(i)}
            >
              <span className="prompt-number">Prompt {i + 1}</span>
              <p className="prompt-text">{prompt}</p>
            </button>
          ))}

          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Deine Antwort</h3>
            <textarea
              className="tutor-textarea"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Gib hier deine Antwort ein..."
            />
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={() => { onSubmit(answer, promptIndex); setAnswer('') }}>
              Antwort speichern
            </button>
          </div>
        </div>
      </div>

      {tutorHistory.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 className="section-title">Antwortverlauf</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tutorHistory.map((entry, i) => (
              <div key={i} className="card">
                <div style={{ display: 'flex', gap: 12, marginBottom: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>{new Date(entry.savedAt).toLocaleString('de-DE')}</span>
                  {entry.assessment && <span className={`badge ${progressTone[entry.assessment.state]}`}>{entry.assessment.state}</span>}
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 8 }}><strong>Q:</strong> {entry.prompt}</p>
                <p style={{ fontSize: '0.9rem', marginBottom: 8 }}><strong>A:</strong> {entry.answer}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--accent-primary)' }}><strong>Feedback:</strong> {entry.feedback}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LibraryView({ groups, kindFilter, onFilterChange }: {
  groups: Subject['groups']
  kindFilter: 'Alle' | ContentKind
  onFilterChange: (k: 'Alle' | ContentKind) => void
}) {
  const visibleGroups = useMemo(() => {
    if (kindFilter === 'Alle') return groups
    return groups
      .map((g) => ({ ...g, items: g.items.filter((item) => item.kind === kindFilter) }))
      .filter((g) => g.items.length > 0)
  }, [groups, kindFilter])

  return (
    <div className="content-container animate-fade-in">
      <div className="section-header">
        <h2 className="section-title">📁 Content Library</h2>
        <p className="section-description">Alle Lernmaterialien an einem Ort</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className={`btn btn-secondary ${kindFilter === 'Alle' ? 'active' : ''}`} onClick={() => onFilterChange('Alle')}>Alle</button>
        {allKinds.map((k) => (
          <button key={k} className={`btn btn-secondary ${kindFilter === k ? 'active' : ''}`} onClick={() => onFilterChange(k)}>{k}</button>
        ))}
      </div>

      {visibleGroups.map((group) => (
        <div key={group.title} style={{ marginBottom: 32 }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>{group.title}</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 16 }}>{group.summary}</p>
          <div className="content-grid">
            {group.items.map((item) => (
              <div key={`${group.title}-${item.title}`} className="content-card">
                <div className="content-card-header">
                  <span className="content-card-title">{item.title}</span>
                  <span className="badge badge-muted">{item.kind}</span>
                </div>
                <p className="content-card-meta">{item.source}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 8 }}>{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      ))}

      {visibleGroups.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📂</div>
          <h3>Keine Inhalte</h3>
          <p>Für diesen Filter gibt es noch keine Inhalte.</p>
        </div>
      )}
    </div>
  )
}

function UploadView({ subject, onUpload, onImport, importing }: {
  subject: Subject
  onUpload: (form: FormData) => void
  onImport: (type: 'anaesthesie' | 'kardiologie') => void
  importing: { anaesthesie: boolean; kardiologie: boolean }
}) {
  const [form, setForm] = useState({ title: '', kind: 'PDF' as ContentKind, groupTitle: '', note: '', source: 'Manueller Upload', file: null as File | null })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = new FormData()
    data.append('title', form.title)
    data.append('subjectId', subject.id)
    data.append('groupTitle', form.groupTitle)
    data.append('kind', form.kind)
    data.append('source', form.source)
    data.append('note', form.note)
    if (form.file) data.append('file', form.file)
    onUpload(data)
    setForm({ title: '', kind: 'PDF', groupTitle: '', note: '', source: 'Manueller Upload', file: null })
  }

  return (
    <div className="content-container animate-fade-in">
      <div className="section-header">
        <h2 className="section-title">⬆️ Upload & Import</h2>
        <p className="section-description">Neue Inhalte hinzufügen</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 32 }}>
        <button className="btn btn-secondary" onClick={() => onImport('anaesthesie')} disabled={importing.anaesthesie}>
          {importing.anaesthesie ? 'Importiert...' : '📥 Anästhesie-Korpus'}
        </button>
        <button className="btn btn-secondary" onClick={() => onImport('kardiologie')} disabled={importing.kardiologie}>
          {importing.kardiologie ? 'Importiert...' : '📥 Kardiologie-Korpus'}
        </button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 20 }}>Manueller Upload</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-field">
              <label>Titel</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z.B. Vorlesung Herzinsuffizienz" required />
            </div>
            <div className="form-field">
              <label>Typ</label>
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ContentKind })}>
                {allKinds.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Themengebiet</label>
              <input value={form.groupTitle} onChange={(e) => setForm({ ...form, groupTitle: e.target.value })} placeholder="z.B. Atemweg & Einleitung" required />
            </div>
            <div className="form-field">
              <label>Quelle</label>
              <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="z.B. Moodle Export" />
            </div>
            <div className="form-field">
              <label>Datei</label>
              <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
            </div>
            <div className="form-field form-field-full">
              <label>Notiz</label>
              <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional: Notizen oder Verarbeitungsideen" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Upload speichern</button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [subjects, setSubjects] = useState(initialSubjects)
  const [selectedId, setSelectedId] = useState(subjects[0].id)
  const [view, setView] = useState<ViewType>('dashboard')
  const [selectedTopicTitle, setSelectedTopicTitle] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<'unknown' | 'online' | 'offline'>('unknown')
  const [tutorHistory, setTutorHistory] = useState<TutorSessionEntry[]>([])
  const [allTutorSessions, setAllTutorSessions] = useState<TutorSessionEntry[]>([])
  const [kindFilter, setKindFilter] = useState<'Alle' | ContentKind>('Alle')
  const [importing, setImporting] = useState({ anaesthesie: false, kardiologie: false })
  const [uploadMessage, setUploadMessage] = useState('')

  const selected = useMemo(() => subjects.find((s) => s.id === selectedId) ?? subjects[0], [selectedId, subjects])

  const selectedTopic = useMemo(() =>
    selected.topics.find((t) => t.title === selectedTopicTitle) ?? null,
    [selected, selectedTopicTitle]
  )

  const reviewQueue = useMemo(() => {
    const entries = subjects.flatMap((subject) =>
      subject.topics.map((topic) => {
        const sessions = allTutorSessions.filter((e) => e.subjectId === subject.id && e.topicTitle === topic.title)
        const evidence = sessions.flatMap((e) => buildEvidenceFromTutorSession({ answer: e.answer, feedback: e.feedback, prompt: e.prompt, selectedContent: e.selectedContent }))
        const content = subject.groups.flatMap((g) => g.items.map((item) => ({ ...item, groupTitle: g.title })))
        return {
          subjectId: subject.id,
          subjectTitle: subject.title,
          topicTitle: topic.title,
          evidence,
          promptCandidates: [],
          recommendedSource: pickRecommendedContent(topic.title, content)?.title ?? null,
          savedAnswerCount: sessions.length,
          latestSessionAt: sessions[0]?.savedAt ?? null,
        }
      })
    )
    return buildReviewQueue(entries)
  }, [allTutorSessions, subjects])

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

  useEffect(() => { loadLibrary() }, [])

  useEffect(() => {
    async function loadTutorHistory() {
      if (!selectedTopic || apiStatus !== 'online') { setTutorHistory([]); setAllTutorSessions([]); return }
      try {
        const [topicRes, allRes] = await Promise.all([
          fetch(`${API_BASE}/api/tutor-sessions?${new URLSearchParams({ subjectId: selected.id, topicTitle: selectedTopic.title })}`),
          fetch(`${API_BASE}/api/tutor-sessions`),
        ])
        const topicData = await topicRes.json()
        const allData = await allRes.json()
        setTutorHistory(topicData.items || [])
        setAllTutorSessions(allData.items || [])
      } catch { setTutorHistory([]); setAllTutorSessions([]) }
    }
    loadTutorHistory()
  }, [apiStatus, selected.id, selectedTopic])

  const handleNavigate = (newView: ViewType, subjectId?: string, topicTitle?: string) => {
    if (subjectId) setSelectedId(subjectId)
    if (topicTitle) setSelectedTopicTitle(topicTitle)
    setView(newView)
  }

  const handleTutorSubmit = async (answer: string, promptIndex: number) => {
    if (!answer.trim() || !selectedTopic) return
    const entry: TutorSessionEntry = {
      id: `local-${Date.now()}`,
      savedAt: new Date().toISOString(),
      subjectId: selected.id,
      topicTitle: selectedTopic.title,
      prompt: ['Erklärung', 'Fehler', 'Fall'][promptIndex],
      answer,
      feedback: 'Antwort gespeichert.',
      assessment: { state: 'Erstkontakt', confidence: 'niedrig' },
    }
    if (apiStatus === 'online') {
      try {
        const res = await fetch(`${API_BASE}/api/tutor-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
        if (res.ok) { const data = await res.json(); entry.id = data.item?.id ?? entry.id }
      } catch { /* offline fallback */ }
    }
    setTutorHistory((prev) => [entry, ...prev])
    setAllTutorSessions((prev) => [entry, ...prev])
  }

  const handleUpload = async (formData: FormData) => {
    if (apiStatus !== 'online') { setUploadMessage('API offline'); return }
    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error('upload failed')
      const result = await res.json()
      setSubjects((prev) => mergeUploadedItems(prev, [result.item]))
      setUploadMessage('Upload erfolgreich!')
    } catch { setUploadMessage('Upload fehlgeschlagen.') }
  }

  const handleImport = async (type: 'anaesthesie' | 'kardiologie') => {
    if (apiStatus !== 'online') return
    setImporting((prev) => ({ ...prev, [type]: true }))
    try {
      await fetch(`${API_BASE}/api/library/import-local/${type}`, { method: 'POST' })
      await loadLibrary()
    } catch { /* ignore */ }
    setImporting((prev) => ({ ...prev, [type]: false }))
  }

  const viewTitles: Record<ViewType, string> = {
    dashboard: 'Dashboard',
    topics: `${selected.title} — Themen`,
    tutor: selectedTopic ? `Tutor: ${selectedTopic.title}` : 'Tutor',
    library: 'Content Library',
    upload: 'Upload & Import',
  }

  return (
    <div className="app-layout">
      <Sidebar subjects={subjects} selectedId={selectedId} onSelect={setSelectedId} view={view} onViewChange={handleNavigate} />
      <main className="main-content">
        <Header apiStatus={apiStatus} title={viewTitles[view]} />
        {view === 'dashboard' && <DashboardView subjects={subjects} reviewQueue={reviewQueue} onNavigate={handleNavigate} />}
        {view === 'topics' && <TopicsView subject={selected} selectedTopic={selectedTopicTitle} onSelectTopic={setSelectedTopicTitle} />}
        {view === 'tutor' && <TutorView subject={selected} topic={selectedTopic} tutorHistory={tutorHistory} allSessions={allTutorSessions} onSubmit={handleTutorSubmit} />}
        {view === 'library' && <LibraryView groups={selected.groups} kindFilter={kindFilter} onFilterChange={setKindFilter} />}
        {view === 'upload' && <UploadView subject={selected} onUpload={handleUpload} onImport={handleImport} importing={importing} />}
      </main>
    </div>
  )
}