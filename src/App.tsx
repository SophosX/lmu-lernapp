import { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, BookOpen, GraduationCap, FolderOpen, Upload,
  CheckCircle2, AlertCircle, Target, ArrowRight, Sparkles, Clock,
  FileText, Mic, StickyNote, Globe, Link as LinkIcon,
} from 'lucide-react'
import {
  subjects as initialSubjects, type ContentItem, type ContentKind,
  type Subject, type ProgressState,
} from './data/learningPlan'
import {
  buildEvidenceFromTutorSession, buildReviewQueue, deriveAssessment,
  pickRecommendedContent, type EvidencePoint, type ReviewQueueEntry,
} from './tutorAlgorithm'

// ============================================================
// Constants & types
// ============================================================

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
const API_BASE = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.host}`
  : 'http://localhost:8787'

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

const KindIconMap: Record<ContentKind, typeof FileText> = {
  PDF: FileText,
  Audio: Mic,
  Notiz: StickyNote,
  Seite: Globe,
  Link: LinkIcon,
}

function KindIcon({ kind }: { kind: ContentKind }) {
  const Icon = KindIconMap[kind]
  return (
    <span className={`kind-icon kind-${kind}`} title={kind}>
      <Icon size={11} strokeWidth={2.4} />
    </span>
  )
}

// ============================================================
// Helpers
// ============================================================

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
        note: [
          item.note,
          item.processingStatus ? `Status: ${item.processingStatus}` : null,
          item.localPath ? `Pfad: ${item.localPath}` : null,
        ].filter(Boolean).join(' • ') || 'Upload über Weboberfläche',
      }
      const existing = groups.find((g) => g.title.toLowerCase() === item.groupTitle.toLowerCase())
      if (existing) {
        const dup = existing.items.some((e) => e.title === mapped.title && e.kind === mapped.kind && e.note === mapped.note)
        if (!dup) existing.items.unshift(mapped)
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

function progressPct(subject: Subject): number {
  if (subject.topics.length === 0) return 0
  const sum = subject.topics.reduce((acc, t) => acc + statusOrder[t.status], 0)
  return Math.round((sum / (subject.topics.length * 4)) * 100)
}

function buildTutorPrompts(title: string) {
  return [
    `Erkläre „${title}“ in eigenen Worten, als würdest du es einem Kommilitonen kurz vor der Prüfung erklären.`,
    `Welche typische Fehlentscheidung droht bei „${title}“, wenn man nur auswendig gelernt hat?`,
    `Nenne den nächsten Fall oder die offene Frage, mit der wir „${title}“ prüfungsnah abtesten sollten.`,
  ]
}

function relativeTime(iso: string | null): string {
  if (!iso) return '—'
  const now = Date.now()
  const t = new Date(iso).getTime()
  const diff = (now - t) / 1000
  if (diff < 60) return 'gerade'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

// ============================================================
// Sidebar
// ============================================================

function Sidebar({
  subjects, selectedId, view, onSelectSubject, onViewChange,
}: {
  subjects: Subject[]
  selectedId: string
  view: ViewType
  onSelectSubject: (id: string) => void
  onViewChange: (v: ViewType) => void
}) {
  const allTopics = subjects.flatMap((s) => s.topics)
  const overall = allTopics.length > 0
    ? Math.round((allTopics.reduce((a, t) => a + statusOrder[t.status], 0) / (allTopics.length * 4)) * 100)
    : 0

  const navItems: Array<[ViewType, string, typeof LayoutDashboard]> = [
    ['dashboard', 'Dashboard', LayoutDashboard],
    ['topics', 'Themen', BookOpen],
    ['tutor', 'Tutor', GraduationCap],
    ['library', 'Bibliothek', FolderOpen],
    ['upload', 'Upload', Upload],
  ]

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-icon">L</div>
        <div className="sidebar-brand-text">Lernapp</div>
      </div>

      <div className="sidebar-section">
        {navItems.map(([key, label, Icon]) => (
          <button
            key={key}
            className={`sidebar-item ${view === key ? 'active' : ''}`}
            onClick={() => onViewChange(key)}
          >
            <span className="sidebar-item-icon"><Icon size={15} strokeWidth={1.8} /></span>
            {label}
          </button>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Fächer</div>
        {subjects.map((subject) => (
          <button
            key={subject.id}
            className={`sidebar-item ${subject.id === selectedId && (view === 'topics' || view === 'tutor' || view === 'library' || view === 'upload') ? 'active' : ''}`}
            onClick={() => { onSelectSubject(subject.id); onViewChange('topics') }}
          >
            <span className={`sidebar-item-dot dot-${statusOrder[subject.status]}`} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subject.title}</span>
            <span className="sidebar-item-count">{subject.topics.length}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-progress-row">
          <span className="sidebar-progress-label">Gesamt</span>
          <span className="sidebar-progress-value">{overall}%</span>
        </div>
        <div className="sidebar-progress-bar">
          <div className="sidebar-progress-fill" style={{ width: `${overall}%` }} />
        </div>
      </div>
    </aside>
  )
}

// ============================================================
// Header
// ============================================================

function Header({ crumbs, apiStatus }: {
  crumbs: Array<{ label: string; current?: boolean }>
  apiStatus: 'unknown' | 'online' | 'offline'
}) {
  return (
    <header className="header">
      <div className="header-breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span className="header-breadcrumb-sep">/</span>}
            <span className={c.current ? 'header-breadcrumb-current' : ''}>{c.label}</span>
          </span>
        ))}
      </div>
      <div className="header-actions">
        <span className={`api-status ${apiStatus}`}>
          <span className="api-status-dot" />
          {apiStatus === 'online' ? 'Live' : apiStatus === 'offline' ? 'Offline' : 'Verbinden…'}
        </span>
      </div>
    </header>
  )
}

// ============================================================
// Dashboard
// ============================================================

// ============================================================
// Topics View
// ============================================================

function TopicsView({ subject, selectedTopicTitle, onSelectTopic, onOpenTutor }: {
  subject: Subject
  selectedTopicTitle: string | null
  onSelectTopic: (title: string) => void
  onOpenTutor: (topicTitle: string) => void
}) {
  const selectedTopic = subject.topics.find((t) => t.title === selectedTopicTitle) ?? subject.topics[0] ?? null
  const pct = progressPct(subject)

  return (
    <div className="content-wide fade-in">
      <div className="page-header">
        <div className="page-eyebrow">{subject.subtitle}</div>
        <h1 className="page-title">{subject.title}</h1>
        <p className="page-description">{subject.description}</p>
        <div className="page-meta">
          <span className={`badge ${progressTone[subject.status]}`}>{subject.status}</span>
          <span className="text-tertiary text-mono" style={{ fontSize: 12 }}>{subject.topics.length} Themen · {pct}% Fortschritt</span>
        </div>
      </div>

      <div className="topics-layout">
        <div className="topics-list">
          {subject.topics.map((topic) => (
            <button
              key={topic.title}
              className={`topic-item ${selectedTopic?.title === topic.title ? 'active' : ''}`}
              onClick={() => onSelectTopic(topic.title)}
            >
              <div className="topic-item-head">
                <span className="topic-item-title">{topic.title}</span>
                <span className={`badge ${progressTone[topic.status]}`}>{topic.status}</span>
              </div>
              <div className="topic-item-evidence">{topic.evidence}</div>
            </button>
          ))}
        </div>

        {selectedTopic ? (
          <div className="topic-detail">
            <div className="topic-detail-head">
              <h2 className="topic-detail-title">{selectedTopic.title}</h2>
              <div className="topic-detail-meta">
                <span className={`badge ${progressTone[selectedTopic.status]}`}>{selectedTopic.status}</span>
              </div>
              <div className="topic-detail-row">
                <div className="topic-detail-key">Evidenz</div>
                <div className="topic-detail-value">{selectedTopic.evidence}</div>
              </div>
              <div className="topic-detail-row">
                <div className="topic-detail-key">Nächster Schritt</div>
                <div className="topic-detail-value">{selectedTopic.nextStep}</div>
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => onOpenTutor(selectedTopic.title)}>
                  <GraduationCap size={14} /> Tutor starten
                </button>
              </div>
            </div>

            <div>
              <div className="section-head" style={{ marginBottom: 8 }}>
                <h3 className="section-title">Verknüpfte Inhalte</h3>
                <span className="section-action">aus allen Gruppen dieses Fachs</span>
              </div>
              <div className="content-grid">
                {subject.groups.flatMap((g) => g.items.slice(0, 3).map((item) => (
                  <div key={`${g.title}-${item.title}-${item.kind}`} className="content-item">
                    <div className="content-item-head">
                      <span className="content-item-title">{item.title}</span>
                      <KindIcon kind={item.kind} />
                    </div>
                    <span className="content-item-source">{g.title} · {item.source}</span>
                    <p className="content-item-note">{item.note}</p>
                  </div>
                )))}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon"><BookOpen size={16} /></div>
            <div className="empty-title">Keine Themen</div>
            <div className="empty-description">Dieses Fach hat noch keine Themen — starte mit einem Upload.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function DashboardView({ subjects, queue, sessions, onOpen }: {
  subjects: Subject[]
  queue: ReviewQueueEntry[]
  sessions: TutorSessionEntry[]
  onOpen: (view: ViewType, subjectId?: string, topicTitle?: string) => void
}) {
  const allTopics = subjects.flatMap((s) => s.topics)
  const stats = {
    subjects: subjects.length,
    topics: allTopics.length,
    inProgress: allTopics.filter((t) => statusOrder[t.status] >= 1 && statusOrder[t.status] <= 2).length,
    sessions: sessions.length,
  }

  return (
    <div className="content fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Übersicht</div>
        <h1 className="page-title">Lernfortschritt</h1>
        <p className="page-description">Dein aktueller Stand über alle Fächer und die nächsten priorisierten Schritte.</p>
      </div>

      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Fächer</div><div className="stat-value">{stats.subjects}</div></div>
        <div className="stat"><div className="stat-label">Themen</div><div className="stat-value">{stats.topics}</div></div>
        <div className="stat"><div className="stat-label">In Bearbeitung</div><div className="stat-value">{stats.inProgress}</div></div>
        <div className="stat"><div className="stat-label">Tutor-Sessions</div><div className="stat-value">{stats.sessions}</div></div>
      </div>

      <div className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2 className="section-title">Fächer</h2>
          <span className="section-action">{subjects.length} aktiv</span>
        </div>
        <div className="subject-grid">
          {subjects.map((subject) => {
            const pct = progressPct(subject)
            return (
              <button key={subject.id} className="subject-card" onClick={() => onOpen('topics', subject.id)}>
                <div className="subject-card-head">
                  <div>
                    <div className="subject-card-title">{subject.title}</div>
                    <div className="subject-card-subtitle">{subject.subtitle}</div>
                  </div>
                  <span className={`badge ${progressTone[subject.status]}`}>{subject.status}</span>
                </div>
                <div className="subject-card-progress">
                  <div className="mini-bar"><div className="mini-bar-fill" style={{ width: `${pct}%` }} /></div>
                  <span className="mini-bar-value">{pct}%</span>
                </div>
                <div className="subject-card-foot">
                  <span>{subject.topics.length} Themen</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>Öffnen <ArrowRight size={11} /></span>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Nächste Session</h2>
          <span className="section-action">Priorisiert nach Lernstand</span>
        </div>
        {queue.length > 0 ? (
          <div className="queue">
            {queue.slice(0, 6).map((entry, i) => (
              <button key={`${entry.subjectId}-${entry.topicTitle}`} className="queue-row" onClick={() => onOpen('tutor', entry.subjectId, entry.topicTitle)}>
                <span className="queue-priority">{String(i + 1).padStart(2, '0')}</span>
                <div className="queue-content">
                  <div className="queue-topic">{entry.topicTitle}</div>
                  <div className="queue-context">{entry.subjectTitle} · {entry.reason || 'Wiedervorlage fällig'}</div>
                </div>
                <span className={`badge ${progressTone[entry.state]}`}>{entry.state}</span>
                <span className="queue-when">{entry.latestSessionAt ? relativeTime(entry.latestSessionAt) : 'neu'}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div className="empty-icon"><Sparkles size={16} /></div>
            <div className="empty-title">Noch keine Empfehlungen</div>
            <div className="empty-description">Starte eine Tutor-Session, um die Wiedervorlage-Logik zu füttern.</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Tutor View
// ============================================================

function TutorView({
  subject, topic, history, evidence, prompts, selectedContent,
  promptIndex, answer, onPromptChange, onAnswerChange, onSubmit, saving,
}: {
  subject: Subject
  topic: { title: string; status: ProgressState } | null
  history: TutorSessionEntry[]
  evidence: EvidencePoint[]
  prompts: string[]
  selectedContent: { title: string; kind: ContentKind; groupTitle: string; source: string } | null
  promptIndex: number
  answer: string
  onPromptChange: (i: number) => void
  onAnswerChange: (s: string) => void
  onSubmit: () => void
  saving: boolean
}) {
  const assessment = useMemo(() => deriveAssessment(evidence), [evidence])

  if (!topic) {
    return (
      <div className="content fade-in">
        <div className="empty">
          <div className="empty-icon"><GraduationCap size={16} /></div>
          <div className="empty-title">Kein Thema gewählt</div>
          <div className="empty-description">Geh zu „Themen" und wähle ein Thema aus, um eine Tutor-Session zu starten.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="content-wide fade-in">
      <div className="page-header">
        <div className="page-eyebrow">{subject.title} · Tutor</div>
        <h1 className="page-title">{topic.title}</h1>
        <p className="page-description">Diagnostische Tutor-Session — beantworte einen Prompt und das System leitet daraus den nächsten Lernschritt ab.</p>
      </div>

      <div className="tutor-layout">
        <div className="tutor-main">
          <div>
            <div className="section-head" style={{ marginBottom: 8 }}>
              <h2 className="section-title">Wähle einen Prompt</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {prompts.map((prompt, i) => (
                <button key={i} className={`tutor-prompt-card ${promptIndex === i ? 'active' : ''}`} onClick={() => onPromptChange(i)}>
                  <span className="tutor-prompt-num"><Target size={11} /> Prompt {String(i + 1).padStart(2, '0')}</span>
                  <span className="tutor-prompt-text">{prompt}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="section-head" style={{ marginBottom: 8 }}>
              <h2 className="section-title">Deine Antwort</h2>
              <span className="section-action">{answer.length} Zeichen</span>
            </div>
            <textarea
              className="tutor-textarea"
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              placeholder="Erkläre das Thema in eigenen Worten — gerne mit Begründung, Begriffsschärfe und einem konkreten Fall."
            />
            <div className="tutor-actions">
              <span className="tutor-hint">Tipp: Begründe deine Aussagen („weil…") und nenne ein klinisches Szenario.</span>
              <button className="btn btn-primary" onClick={onSubmit} disabled={saving || !answer.trim()}>
                {saving ? 'Speichert…' : 'Antwort speichern'}
              </button>
            </div>
          </div>

          {history.length > 0 && (
            <div>
              <div className="section-head" style={{ marginBottom: 8 }}>
                <h2 className="section-title">Antwortverlauf</h2>
                <span className="section-action">{history.length} Einträge</span>
              </div>
              <div>
                {history.slice(0, 5).map((entry) => (
                  <div key={entry.id} className="history-item">
                    <div className="history-item-head">
                      <span>{new Date(entry.savedAt).toLocaleString('de-DE')}</span>
                      {entry.assessment && <span className={`badge ${progressTone[entry.assessment.state]}`}>{entry.assessment.state}</span>}
                    </div>
                    <div className="history-item-prompt">{entry.prompt}</div>
                    <div className="history-item-answer">{entry.answer}</div>
                    <div className="history-item-feedback">{entry.feedback}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="tutor-side">
          <div className="assessment-panel">
            <div className="assessment-head">
              <span className="assessment-head-title">Status</span>
              <span className={`badge ${progressTone[assessment.state]}`}>{assessment.state}</span>
            </div>
            <div className="evidence-stats">
              <div className="evidence-stat">
                <div className="evidence-stat-value">{evidence.length}</div>
                <div className="evidence-stat-label">Evidenzpunkte</div>
              </div>
              <div className="evidence-stat">
                <div className="evidence-stat-value">{history.length}</div>
                <div className="evidence-stat-label">Antworten</div>
              </div>
              <div className="evidence-stat">
                <div className="evidence-stat-value" style={{ fontSize: 13, paddingTop: 3 }}>{assessment.confidence}</div>
                <div className="evidence-stat-label">Confidence</div>
              </div>
            </div>
          </div>

          <div className="assessment-panel">
            <div className="assessment-section">
              <div className="assessment-section-label"><CheckCircle2 size={11} /> Stärken</div>
              <div className="assessment-list">
                {assessment.strengths.length > 0
                  ? assessment.strengths.map((s, i) => <div key={i} className="assessment-item strength">{s}</div>)
                  : <div className="assessment-empty">Noch keine Stärken erhoben</div>}
              </div>
            </div>
            <div className="assessment-section">
              <div className="assessment-section-label"><AlertCircle size={11} /> Schwachstellen</div>
              <div className="assessment-list">
                {assessment.weaknesses.length > 0
                  ? assessment.weaknesses.map((s, i) => <div key={i} className="assessment-item weakness">{s}</div>)
                  : <div className="assessment-empty">Aktuell keine Schwächen</div>}
              </div>
            </div>
            <div className="assessment-section">
              <div className="assessment-section-label"><ArrowRight size={11} /> Nächste Schritte</div>
              <div className="assessment-list">
                {assessment.nextActions.map((a, i) => <div key={i} className="assessment-item next">{a}</div>)}
              </div>
            </div>
          </div>

          {selectedContent && (
            <div className="assessment-panel">
              <div className="assessment-section-label"><FolderOpen size={11} /> Empfohlene Quelle</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <KindIcon kind={selectedContent.kind} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{selectedContent.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{selectedContent.groupTitle} · {selectedContent.source}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Library View
// ============================================================

function LibraryView({ subject, kindFilter, onFilterChange }: {
  subject: Subject
  kindFilter: 'Alle' | ContentKind
  onFilterChange: (k: 'Alle' | ContentKind) => void
}) {
  const visibleGroups = useMemo(() => {
    if (kindFilter === 'Alle') return subject.groups
    return subject.groups
      .map((g) => ({ ...g, items: g.items.filter((item) => item.kind === kindFilter) }))
      .filter((g) => g.items.length > 0)
  }, [subject.groups, kindFilter])

  const totalItems = subject.groups.reduce((acc, g) => acc + g.items.length, 0)
  const visibleItems = visibleGroups.reduce((acc, g) => acc + g.items.length, 0)

  return (
    <div className="content-wide fade-in">
      <div className="page-header">
        <div className="page-eyebrow">{subject.title} · Bibliothek</div>
        <h1 className="page-title">Inhalte</h1>
        <p className="page-description">Alle Materialien dieses Fachs — gefiltert und gruppiert nach Themengebiet.</p>
        <div className="page-meta">
          <span className="text-tertiary text-mono" style={{ fontSize: 12 }}>{visibleItems} von {totalItems} Einträge</span>
        </div>
      </div>

      <div className="filter-bar">
        <button className={`filter-chip ${kindFilter === 'Alle' ? 'active' : ''}`} onClick={() => onFilterChange('Alle')}>Alle</button>
        {allKinds.map((k) => (
          <button key={k} className={`filter-chip ${kindFilter === k ? 'active' : ''}`} onClick={() => onFilterChange(k)}>{k}</button>
        ))}
      </div>

      {visibleGroups.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><FolderOpen size={16} /></div>
          <div className="empty-title">Keine Inhalte für diesen Filter</div>
          <div className="empty-description">Wechsle den Filter oder lade neue Materialien über „Upload" hoch.</div>
        </div>
      ) : (
        visibleGroups.map((group) => (
          <div key={group.title} className="library-group">
            <div className="library-group-head">
              <h3 className="library-group-title">{group.title}</h3>
              <span className="library-group-count">{group.items.length}</span>
            </div>
            <p className="library-group-summary">{group.summary}</p>
            <div className="content-grid">
              {group.items.map((item) => (
                <div key={`${group.title}-${item.title}-${item.kind}`} className="content-item">
                  <div className="content-item-head">
                    <span className="content-item-title">{item.title}</span>
                    <KindIcon kind={item.kind} />
                  </div>
                  <span className="content-item-source">{item.source}</span>
                  <p className="content-item-note">{item.note}</p>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

// ============================================================
// Upload View
// ============================================================

function UploadView({ subjects, selectedId, onSelectSubject, onUpload, uploading, message, onImport, importing }: {
  subjects: Subject[]
  selectedId: string
  onSelectSubject: (id: string) => void
  onUpload: (form: FormData) => void
  uploading: boolean
  message: string
  onImport: (type: 'anaesthesie' | 'kardiologie') => void
  importing: { anaesthesie: boolean; kardiologie: boolean }
}) {
  const [form, setForm] = useState({
    title: '', kind: 'PDF' as ContentKind, groupTitle: '', note: '',
    source: 'Manueller Upload', file: null as File | null,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const data = new FormData()
    data.append('title', form.title)
    data.append('subjectId', selectedId)
    data.append('groupTitle', form.groupTitle)
    data.append('kind', form.kind)
    data.append('source', form.source)
    data.append('note', form.note)
    if (form.file) data.append('file', form.file)
    onUpload(data)
    setForm({ title: '', kind: 'PDF', groupTitle: '', note: '', source: 'Manueller Upload', file: null })
  }

  return (
    <div className="content fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Inhalte</div>
        <h1 className="page-title">Upload &amp; Import</h1>
        <p className="page-description">Lade neue Materialien hoch oder importiere lokale Korpora aus dem Workspace.</p>
      </div>

      {message && (
        <div className={`banner ${message.startsWith('✓') ? 'banner-success' : message.startsWith('✗') ? 'banner-error' : 'banner-info'}`}>
          {message}
        </div>
      )}

      <div className="section" style={{ marginTop: 0 }}>
        <div className="section-head">
          <h2 className="section-title">Schnell-Import</h2>
          <span className="section-action">Lokale Korpora aus dem Workspace</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => onImport('anaesthesie')} disabled={importing.anaesthesie}>
            <Upload size={13} /> {importing.anaesthesie ? 'Importiert…' : 'Anästhesie-Korpus'}
          </button>
          <button className="btn btn-secondary" onClick={() => onImport('kardiologie')} disabled={importing.kardiologie}>
            <Upload size={13} /> {importing.kardiologie ? 'Importiert…' : 'Kardiologie-Korpus'}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <h2 className="section-title">Manueller Upload</h2>
        </div>
        <div className="form-card">
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label className="form-label">Fach</label>
                <select className="form-select" value={selectedId} onChange={(e) => onSelectSubject(e.target.value)}>
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Typ</label>
                <select className="form-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ContentKind })}>
                  {allKinds.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label">Titel</label>
                <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="z.B. Vorlesung Herzinsuffizienz" required />
              </div>
              <div className="form-field">
                <label className="form-label">Themengebiet</label>
                <input className="form-input" value={form.groupTitle} onChange={(e) => setForm({ ...form, groupTitle: e.target.value })} placeholder="z.B. Atemweg & Einleitung" required />
              </div>
              <div className="form-field">
                <label className="form-label">Quelle</label>
                <input className="form-input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="z.B. Moodle Export" />
              </div>
              <div className="form-field">
                <label className="form-label">Datei</label>
                <input className="form-input" type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
              </div>
              <div className="form-field form-field-full">
                <label className="form-label">Notiz</label>
                <textarea className="form-textarea" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional: Verarbeitungsidee, Kontext, ToDos" />
              </div>
            </div>
            <div className="form-actions">
              <span className="form-help">Datei wird unter data-store/uploads gespeichert.</span>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? 'Speichert…' : 'Upload speichern'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Root App
// ============================================================

export default function App() {
  const [subjects, setSubjects] = useState(initialSubjects)
  const [selectedId, setSelectedId] = useState(subjects[0].id)
  const [view, setView] = useState<ViewType>('dashboard')
  const [selectedTopicTitle, setSelectedTopicTitle] = useState<string | null>(null)
  const [apiStatus, setApiStatus] = useState<'unknown' | 'online' | 'offline'>('unknown')
  const [tutorHistory, setTutorHistory] = useState<TutorSessionEntry[]>([])
  const [allTutorSessions, setAllTutorSessions] = useState<TutorSessionEntry[]>([])
  const [tutorAnswer, setTutorAnswer] = useState('')
  const [tutorPromptIndex, setTutorPromptIndex] = useState(0)
  const [tutorSaving, setTutorSaving] = useState(false)
  const [kindFilter, setKindFilter] = useState<'Alle' | ContentKind>('Alle')
  const [uploading, setUploading] = useState(false)
  const [uploadMessage, setUploadMessage] = useState('')
  const [importing, setImporting] = useState({ anaesthesie: false, kardiologie: false })

  const selected = useMemo(() => subjects.find((s) => s.id === selectedId) ?? subjects[0], [selectedId, subjects])
  const selectedTopic = useMemo(
    () => selected.topics.find((t) => t.title === selectedTopicTitle) ?? null,
    [selected, selectedTopicTitle],
  )

  const availableContent = useMemo(
    () => selected.groups.flatMap((group) => group.items.map((item) => ({ ...item, groupTitle: group.title }))),
    [selected],
  )

  const recommendedContent = useMemo(() => {
    if (!selectedTopic) return null
    const rec = pickRecommendedContent(selectedTopic.title, availableContent)
    return rec ? { title: rec.title, kind: rec.kind, groupTitle: rec.groupTitle, source: rec.source } : null
  }, [selectedTopic, availableContent])

  const tutorPrompts = useMemo(
    () => buildTutorPrompts(selectedTopic?.title ?? selected.title),
    [selectedTopic, selected.title],
  )

  const tutorEvidence = useMemo(() => {
    return tutorHistory.flatMap((entry) =>
      buildEvidenceFromTutorSession({
        answer: entry.answer, feedback: entry.feedback, prompt: entry.prompt,
        selectedContent: entry.selectedContent,
      })
    )
  }, [tutorHistory])

  const reviewQueue = useMemo<ReviewQueueEntry[]>(() => {
    const entries = subjects.flatMap((subject) =>
      subject.topics.map((topic) => {
        const sessions = allTutorSessions.filter((e) => e.subjectId === subject.id && e.topicTitle === topic.title)
        const evidence = sessions.flatMap((e) =>
          buildEvidenceFromTutorSession({
            answer: e.answer, feedback: e.feedback, prompt: e.prompt, selectedContent: e.selectedContent,
          }))
        const candidates = subject.groups.flatMap((g) => g.items.map((item) => ({ ...item, groupTitle: g.title })))
        const rec = pickRecommendedContent(topic.title, candidates)
        return {
          subjectId: subject.id,
          subjectTitle: subject.title,
          topicTitle: topic.title,
          evidence,
          promptCandidates: buildTutorPrompts(topic.title),
          recommendedSource: rec ? `${rec.title} · ${rec.groupTitle}` : null,
          savedAnswerCount: sessions.length,
          latestSessionAt: sessions[0]?.savedAt ?? null,
        }
      })
    )
    return buildReviewQueue(entries)
  }, [allTutorSessions, subjects])

  // ----- API: Library -----
  async function loadLibrary() {
    try {
      const health = await fetch(`${API_BASE}/api/health`)
      if (!health.ok) throw new Error('health failed')
      setApiStatus('online')
      const res = await fetch(`${API_BASE}/api/library`)
      if (!res.ok) throw new Error('library failed')
      const data = await res.json()
      setSubjects(mergeUploadedItems(initialSubjects, data.items || []))
    } catch {
      setApiStatus('offline')
    }
  }

  useEffect(() => { loadLibrary() }, [])

  // ----- API: Tutor history -----
  useEffect(() => {
    async function loadHistory() {
      if (apiStatus !== 'online') { setTutorHistory([]); setAllTutorSessions([]); return }
      try {
        const allRes = await fetch(`${API_BASE}/api/tutor-sessions`)
        const allData = await allRes.json()
        setAllTutorSessions(allData.items || [])
        if (selectedTopic) {
          const topicRes = await fetch(`${API_BASE}/api/tutor-sessions?${new URLSearchParams({ subjectId: selected.id, topicTitle: selectedTopic.title })}`)
          const topicData = await topicRes.json()
          setTutorHistory(topicData.items || [])
        } else {
          setTutorHistory([])
        }
      } catch { setTutorHistory([]); setAllTutorSessions([]) }
    }
    loadHistory()
  }, [apiStatus, selected.id, selectedTopic])

  // ----- Navigation -----
  function navigate(newView: ViewType, subjectId?: string, topicTitle?: string) {
    if (subjectId) setSelectedId(subjectId)
    if (topicTitle) setSelectedTopicTitle(topicTitle)
    setView(newView)
    setTutorAnswer('')
    setTutorPromptIndex(0)
  }

  // ----- Tutor submit -----
  async function handleTutorSubmit() {
    if (!tutorAnswer.trim() || !selectedTopic) return
    setTutorSaving(true)
    const entry: TutorSessionEntry = {
      id: `local-${Date.now()}`,
      savedAt: new Date().toISOString(),
      subjectId: selected.id,
      topicTitle: selectedTopic.title,
      prompt: tutorPrompts[tutorPromptIndex],
      answer: tutorAnswer,
      feedback: tutorAnswer.length < 80
        ? 'Zu knapp — eine längere Erklärung mit Begründung wäre prüfungsnäher.'
        : 'Solide. Nächster Schritt: noch mehr klinische Priorisierung & ein konkreter Fall.',
      selectedContent: recommendedContent,
      assessment: { state: tutorAnswer.length > 200 ? 'In Aufbau' : 'Erstkontakt', confidence: 'mittel' },
    }
    if (apiStatus === 'online') {
      try {
        const res = await fetch(`${API_BASE}/api/tutor-sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.item?.id) entry.id = data.item.id
        }
      } catch { /* ignore */ }
    }
    setTutorHistory((prev) => [entry, ...prev])
    setAllTutorSessions((prev) => [entry, ...prev])
    setTutorAnswer('')
    setTutorSaving(false)
  }

  // ----- Upload -----
  async function handleUpload(formData: FormData) {
    if (apiStatus !== 'online') { setUploadMessage('✗ API offline — Upload nicht möglich.'); return }
    setUploading(true)
    try {
      const res = await fetch(`${API_BASE}/api/upload`, { method: 'POST', body: formData })
      if (!res.ok) throw new Error('upload failed')
      const result = await res.json()
      setSubjects((prev) => mergeUploadedItems(prev, [result.item]))
      setUploadMessage('✓ Upload gespeichert.')
    } catch {
      setUploadMessage('✗ Upload fehlgeschlagen.')
    } finally {
      setUploading(false)
      setTimeout(() => setUploadMessage(''), 4000)
    }
  }

  async function handleImport(type: 'anaesthesie' | 'kardiologie') {
    if (apiStatus !== 'online') return
    setImporting((prev) => ({ ...prev, [type]: true }))
    try {
      await fetch(`${API_BASE}/api/library/import-local/${type}`, { method: 'POST' })
      await loadLibrary()
      setUploadMessage(`✓ ${type === 'anaesthesie' ? 'Anästhesie' : 'Kardiologie'}-Korpus importiert.`)
    } catch {
      setUploadMessage(`✗ Import fehlgeschlagen.`)
    } finally {
      setImporting((prev) => ({ ...prev, [type]: false }))
      setTimeout(() => setUploadMessage(''), 4000)
    }
  }

  // ----- Breadcrumbs -----
  const crumbs = useMemo(() => {
    if (view === 'dashboard') return [{ label: 'Dashboard', current: true }]
    if (view === 'topics') return [{ label: selected.title }, { label: 'Themen', current: true }]
    if (view === 'tutor') return [{ label: selected.title }, { label: 'Tutor' }, { label: selectedTopic?.title ?? 'Kein Thema', current: true }]
    if (view === 'library') return [{ label: selected.title }, { label: 'Bibliothek', current: true }]
    if (view === 'upload') return [{ label: 'Upload', current: true }]
    return []
  }, [view, selected, selectedTopic])

  return (
    <div className="app-layout">
      <Sidebar
        subjects={subjects}
        selectedId={selectedId}
        view={view}
        onSelectSubject={setSelectedId}
        onViewChange={(v) => navigate(v)}
      />
      <main className="main-content">
        <Header crumbs={crumbs} apiStatus={apiStatus} />
        {view === 'dashboard' && (
          <DashboardView
            subjects={subjects}
            queue={reviewQueue}
            sessions={allTutorSessions}
            onOpen={navigate}
          />
        )}
        {view === 'topics' && (
          <TopicsView
            subject={selected}
            selectedTopicTitle={selectedTopicTitle ?? selected.topics[0]?.title ?? null}
            onSelectTopic={setSelectedTopicTitle}
            onOpenTutor={(title) => navigate('tutor', selected.id, title)}
          />
        )}
        {view === 'tutor' && (
          <TutorView
            subject={selected}
            topic={selectedTopic}
            history={tutorHistory}
            evidence={tutorEvidence}
            prompts={tutorPrompts}
            selectedContent={recommendedContent}
            promptIndex={tutorPromptIndex}
            answer={tutorAnswer}
            onPromptChange={setTutorPromptIndex}
            onAnswerChange={setTutorAnswer}
            onSubmit={handleTutorSubmit}
            saving={tutorSaving}
          />
        )}
        {view === 'library' && (
          <LibraryView
            subject={selected}
            kindFilter={kindFilter}
            onFilterChange={setKindFilter}
          />
        )}
        {view === 'upload' && (
          <UploadView
            subjects={subjects}
            selectedId={selectedId}
            onSelectSubject={setSelectedId}
            onUpload={handleUpload}
            uploading={uploading}
            message={uploadMessage}
            onImport={handleImport}
            importing={importing}
          />
        )}
      </main>
    </div>
  )
}
