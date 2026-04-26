import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT || 8787)
const isProduction = process.env.NODE_ENV === 'production'

const dataDir = path.join(__dirname, 'data-store')
const uploadDir = path.join(dataDir, 'uploads')
const libraryPath = path.join(dataDir, 'library.json')
const transcriptDir = path.join(dataDir, 'transcripts')
const tutorSessionsPath = path.join(dataDir, 'tutor-sessions.json')
const workspaceRoot = path.resolve(__dirname, '../..')
const anaesthesiaRoot = path.join(workspaceRoot, 'lmu', 'anästhesie_modul23')
const cardiologyRoot = path.join(workspaceRoot, 'lmu', 'kardiovaskuläres_modul23')

fs.mkdirSync(uploadDir, { recursive: true })
fs.mkdirSync(transcriptDir, { recursive: true })
if (!fs.existsSync(libraryPath)) {
  fs.writeFileSync(
    libraryPath,
    JSON.stringify({ items: [] }, null, 2) + '\n',
    'utf8',
  )
}
if (!fs.existsSync(tutorSessionsPath)) {
  fs.writeFileSync(
    tutorSessionsPath,
    JSON.stringify({ items: [] }, null, 2) + '\n',
    'utf8',
  )
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    cb(null, safeName)
  },
})

const upload = multer({ storage })

app.use(cors())
app.use(express.json())
app.use('/uploads', express.static(uploadDir))

function readLibrary() {
  return JSON.parse(fs.readFileSync(libraryPath, 'utf8'))
}

function writeLibrary(data) {
  fs.writeFileSync(libraryPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function readTutorSessions() {
  return JSON.parse(fs.readFileSync(tutorSessionsPath, 'utf8'))
}

function writeTutorSessions(data) {
  fs.writeFileSync(tutorSessionsPath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function itemExists(library, keyFields) {
  return library.items.some((item) =>
    Object.entries(keyFields).every(([key, value]) => item[key] === value),
  )
}

function createLibraryItem(payload) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    uploadedAt: new Date().toISOString(),
    processingStatus: 'stored',
    ...payload,
  }
}

function createTutorSession(payload) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    ...payload,
  }
}

function inferKindFromName(name) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.pdf')) return 'PDF'
  if (lower.endsWith('.mp3') || lower.endsWith('.wav') || lower.endsWith('.m4a') || lower.endsWith('.ogg')) return 'Audio'
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'Seite'
  if (lower.endsWith('.html')) return 'Link'
  return 'Notiz'
}

function transcribeAudio(filePath) {
  const scriptPath = path.join(workspaceRoot, 'scripts', 'journal_voice_note.sh')
  const output = execFileSync(scriptPath, [filePath, '--print-only'], {
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  }).trim()

  const transcriptName = `${Date.now()}-${path.basename(filePath)}.txt`
  const transcriptPath = path.join(transcriptDir, transcriptName)
  fs.writeFileSync(transcriptPath, output + '\n', 'utf8')

  return {
    transcriptPath,
    transcriptExcerpt: output.slice(0, 500),
  }
}

function ingestCorpus({ subjectId, rootDir, mappings }) {
  const library = readLibrary()
  const imported = []

  for (const mapping of mappings) {
    if (!fs.existsSync(mapping.dir)) continue
    for (const entry of fs.readdirSync(mapping.dir)) {
      if (!mapping.include(entry)) continue
      const fullPath = path.join(mapping.dir, entry)
      const stat = fs.statSync(fullPath)
      if (!stat.isFile()) continue
      const item = createLibraryItem({
        title: entry,
        subjectId,
        groupTitle: mapping.groupTitle,
        kind: mapping.kindOverride || inferKindFromName(entry),
        source: mapping.source,
        note: `Automatisch aus lokalem Korpus importiert: ${path.relative(workspaceRoot, fullPath)}`,
        localPath: path.relative(workspaceRoot, fullPath),
        fileName: null,
        originalName: entry,
        mimeType: null,
        size: stat.size,
      })
      if (!itemExists(library, { subjectId: item.subjectId, groupTitle: item.groupTitle, originalName: item.originalName })) {
        library.items.unshift(item)
        imported.push(item)
      }
    }
  }

  writeLibrary(library)
  return imported
}

function ingestAnaesthesiaCorpus() {
  const mappings = [
    {
      dir: path.join(anaesthesiaRoot, 'pages'),
      groupTitle: 'Atemweg & Einleitung',
      kindOverride: 'Seite',
      include: (name) => /atemwegsmanagement|allgemeinanästhesie|anästhesie/i.test(name),
      source: 'lokaler AINS-Moodle-Export',
    },
    {
      dir: path.join(anaesthesiaRoot, 'files'),
      groupTitle: 'Atemweg & Einleitung',
      include: (name) => /airway|allgemeinan|präoperative|medikamente/i.test(name),
      source: 'lokaler AINS-Moodle-Export',
    },
    {
      dir: path.join(anaesthesiaRoot, 'files'),
      groupTitle: 'Regionalanästhesie & Praxis',
      include: (name) => /regional|logbuch|spinalkanal|tutorleitfaden/i.test(name),
      source: 'lokaler AINS-Moodle-Export',
    },
    {
      dir: path.join(anaesthesiaRoot, 'files'),
      groupTitle: 'Komplikationen & Krisen',
      include: (name) => /komplikationen|delir|schock|sepsis|respiratorische insuffizienz/i.test(name),
      source: 'lokaler AINS-Moodle-Export',
    },
  ]

  return ingestCorpus({
    subjectId: 'anaesthesie',
    rootDir: anaesthesiaRoot,
    mappings,
  })
}

function ingestCardiologyCorpus() {
  const mappings = [
    {
      dir: path.join(cardiologyRoot, 'pages'),
      groupTitle: 'Koronarsyndrome & Ischämie',
      kindOverride: 'Seite',
      include: (name) => /koronar|isch|acs|stemi|nstemi|infarkt|angina/i.test(name),
      source: 'lokaler Kardiologie-Moodle-Export',
    },
    {
      dir: path.join(cardiologyRoot, 'files'),
      groupTitle: 'Koronarsyndrome & Ischämie',
      include: (name) => /koronar|isch|acs|stemi|nstemi|infarkt|angina/i.test(name),
      source: 'lokaler Kardiologie-Moodle-Export',
    },
    {
      dir: path.join(cardiologyRoot, 'pages'),
      groupTitle: 'Herzinsuffizienz & Klappen',
      kindOverride: 'Seite',
      include: (name) => /herzinsuff|klappe|vitien|myokard|kardiomyopath/i.test(name),
      source: 'lokaler Kardiologie-Moodle-Export',
    },
    {
      dir: path.join(cardiologyRoot, 'files'),
      groupTitle: 'Herzinsuffizienz & Klappen',
      include: (name) => /herzinsuff|klappe|vitien|myokard|kardiomyopath/i.test(name),
      source: 'lokaler Kardiologie-Moodle-Export',
    },
    {
      dir: path.join(cardiologyRoot, 'pages'),
      groupTitle: 'Rhythmus, Diagnostik & Intervention',
      kindOverride: 'Seite',
      include: (name) => /ekg|rhythm|arrhythm|echo|katheter|elektro|tachy|brady|schrittmacher/i.test(name),
      source: 'lokaler Kardiologie-Moodle-Export',
    },
    {
      dir: path.join(cardiologyRoot, 'files'),
      groupTitle: 'Rhythmus, Diagnostik & Intervention',
      include: (name) => /ekg|rhythm|arrhythm|echo|katheter|elektro|tachy|brady|schrittmacher/i.test(name),
      source: 'lokaler Kardiologie-Moodle-Export',
    },
    {
      dir: path.join(cardiologyRoot, 'linked'),
      groupTitle: 'Externe Inhalte & Kursseiten',
      kindOverride: 'Link',
      include: () => true,
      source: 'lokaler Kardiologie-Moodle-Export',
    },
  ]

  return ingestCorpus({
    subjectId: 'kardiologie',
    rootDir: cardiologyRoot,
    mappings,
  })
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/library', (_req, res) => {
  res.json(readLibrary())
})

app.get('/api/tutor-sessions', (req, res) => {
  const { subjectId, topicTitle } = req.query
  const sessions = readTutorSessions()
  const items = sessions.items.filter((item) => {
    if (subjectId && item.subjectId !== subjectId) return false
    if (topicTitle && item.topicTitle !== topicTitle) return false
    return true
  })

  res.json({ items })
})

app.post('/api/tutor-sessions', (req, res) => {
  const body = req.body || {}
  if (!body.subjectId || !body.topicTitle || !body.prompt || !body.answer) {
    res.status(400).json({ ok: false, error: 'subjectId, topicTitle, prompt und answer sind erforderlich.' })
    return
  }

  const sessions = readTutorSessions()
  const item = createTutorSession({
    subjectId: body.subjectId,
    topicTitle: body.topicTitle,
    prompt: body.prompt,
    answer: body.answer,
    feedback: body.feedback || '',
    selectedContent: body.selectedContent || null,
    assessment: body.assessment || null,
  })

  sessions.items.unshift(item)
  writeTutorSessions(sessions)

  res.status(201).json({ ok: true, item })
})

app.post('/api/library/import-local/anaesthesie', (_req, res) => {
  try {
    const imported = ingestAnaesthesiaCorpus()
    res.status(201).json({ ok: true, importedCount: imported.length, items: imported })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.post('/api/library/import-local/kardiologie', (_req, res) => {
  try {
    const imported = ingestCardiologyCorpus()
    res.status(201).json({ ok: true, importedCount: imported.length, items: imported })
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) })
  }
})

app.post('/api/upload', upload.single('file'), (req, res) => {
  const library = readLibrary()
  const body = req.body || {}
  const file = req.file

  const item = createLibraryItem({
    title: body.title || file?.originalname || 'Unbenannter Inhalt',
    subjectId: body.subjectId || 'unknown',
    groupTitle: body.groupTitle || 'Unsortiert',
    kind: body.kind || 'Notiz',
    source: body.source || 'Manueller Upload',
    note: body.note || '',
    localPath: file ? path.relative(workspaceRoot, file.path) : null,
    fileName: file?.filename || null,
    originalName: file?.originalname || null,
    mimeType: file?.mimetype || null,
    size: file?.size || null,
    processingStatus: body.kind === 'Audio' ? 'uploaded_audio_pending_pipeline' : 'stored',
  })

  library.items.unshift(item)

  if (body.kind === 'Audio' && file?.path) {
    try {
      const transcript = transcribeAudio(file.path)
      item.processingStatus = 'audio_transcribed'
      item.note = [item.note, `Transkript: ${path.relative(workspaceRoot, transcript.transcriptPath)}`].filter(Boolean).join(' • ')
      item.transcriptPath = path.relative(workspaceRoot, transcript.transcriptPath)
      item.transcriptExcerpt = transcript.transcriptExcerpt

      library.items.unshift(createLibraryItem({
        title: `${item.title} – Transkript`,
        subjectId: item.subjectId,
        groupTitle: item.groupTitle,
        kind: 'Notiz',
        source: `${item.source} / Whisper-Transkript`,
        note: transcript.transcriptExcerpt,
        localPath: path.relative(workspaceRoot, transcript.transcriptPath),
        fileName: path.basename(transcript.transcriptPath),
        originalName: path.basename(transcript.transcriptPath),
        mimeType: 'text/plain',
        size: fs.statSync(transcript.transcriptPath).size,
        processingStatus: 'derived_from_audio',
      }))
    } catch (error) {
      item.processingStatus = 'audio_transcription_failed'
      item.note = [item.note, `Transkriptionsfehler: ${String(error)}`].filter(Boolean).join(' • ')
    }
  }

  writeLibrary(library)
  res.status(201).json({ ok: true, item })
})

// Serve static frontend in production
const distDir = path.join(__dirname, 'dist')
if (isProduction && fs.existsSync(distDir)) {
  app.use(express.static(distDir))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`LMU Lernapp API listening on http://localhost:${port}`)
  if (isProduction) {
    console.log(`Serving static files from ${distDir}`)
  }
})
