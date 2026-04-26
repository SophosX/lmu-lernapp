export type ProgressState =
  | 'Nicht erhoben'
  | 'Erstkontakt'
  | 'In Aufbau'
  | 'Belastbar'
  | 'Prüfungsnah'

export type ContentKind = 'PDF' | 'Audio' | 'Notiz' | 'Seite' | 'Link'

export type Topic = {
  title: string
  status: ProgressState
  evidence: string
  nextStep: string
}

export type ContentItem = {
  title: string
  kind: ContentKind
  source: string
  note: string
}

export type TopicGroup = {
  title: string
  summary: string
  items: ContentItem[]
}

export type UploadType = {
  label: string
  kinds: ContentKind[]
  purpose: string
}

export type Subject = {
  id: string
  title: string
  subtitle: string
  description: string
  sourceFocus: string
  status: ProgressState
  confidence: 'niedrig' | 'mittel' | 'hoch'
  topics: Topic[]
  groups: TopicGroup[]
}

export const uploadTypes: UploadType[] = [
  {
    label: 'Seminar- und Vorlesungsunterlagen',
    kinds: ['PDF', 'Seite', 'Link'],
    purpose: 'Folien, PDFs, Moodle-Exporte und ergänzende strukturierte Quellen in die Fachbibliothek übernehmen.',
  },
  {
    label: 'Audio / Diktiergerät / Voice',
    kinds: ['Audio'],
    purpose: 'Seminare, eigene Sprachmemos oder Erklärungen hochladen, später transkribieren und thematisch zuordnen.',
  },
  {
    label: 'Eigene Notizen',
    kinds: ['Notiz'],
    purpose: 'Eigene Zusammenfassungen, Schwächen, Fragen und Gedankengänge direkt in den Lernkontext einspeisen.',
  },
]

export const subjects: Subject[] = [
  {
    id: 'anaesthesie',
    title: 'Anästhesie',
    subtitle: 'AINS / Modul 23',
    description:
      'Bestehender lokaler Moodle-Korpus aus AINS mit Lernunterlagen, Themenmapping und neuem Lektionenplan V2 für tutorische Audio-/Podcast-Folgen.',
    sourceFocus:
      'Primär: lokaler LMU-/Moodle-Export aus AINS. Ergänzend: seriöse medizinische Sekundärquellen.',
    status: 'In Aufbau',
    confidence: 'mittel',
    topics: [
      {
        title: 'Atemwegsmanagement',
        status: 'Erstkontakt',
        evidence:
          'Grundlogik von Oxygenierung vs. Intubation besprochen; erste Antworten zeigen Teilverständnis, aber noch begriffliche Unschärfen.',
        nextStep:
          'Präzision der Begriffe schärfen, Eskalationsalgorithmus vertiefen, Fallbezug und CICO-Logik festigen.',
      },
      {
        title: 'Allgemeinanästhesie',
        status: 'Nicht erhoben',
        evidence: 'Thema im lokalen Lernplan vorhanden, aber noch nicht tutorisch abgefragt.',
        nextStep: 'Lektion 3 der neuen Serie aufbauen und diagnostische Einstiegsfragen stellen.',
      },
      {
        title: 'Regionalanästhesie',
        status: 'Nicht erhoben',
        evidence: 'Quellen vorhanden, aber noch keine Interaktion zu Verständnis oder Prüfungsreife.',
        nextStep: 'Teil 1 und Teil 2 im Tutorformat trennen: Grundlagen und Verfahren.',
      },
    ],
    groups: [
      {
        title: 'Atemweg & Einleitung',
        summary: 'Basislogik der Sicherung von Oxygenierung und Ventilation sowie Eskalationspfade bei schwierigen Situationen.',
        items: [
          {
            title: 'Atemwegsmanagement Textseite',
            kind: 'Seite',
            source: 'lokaler Moodle-Export',
            note: 'Lernziele und Grundstruktur des Themas aus der Moodle-Seite.',
          },
          {
            title: 'Vorlesung Airwaymanagement Zwissler',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Hauptquelle für Eskalationslogik, Hilfsmittel und Kernbegriffe.',
          },
        ],
      },
      {
        title: 'Narkosegrundlagen',
        summary: 'Allgemeinanästhesie, Medikamente, Monitoring und präoperative Logik.',
        items: [
          {
            title: 'Allgemeinanästhesie',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Grundlagen zu Komponenten, Konzepten und Basismonitoring.',
          },
          {
            title: 'Lernskript - Medikamente in der Anästhesie',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Wichtige Medikamentenbasis, derzeit noch wegen OCR nur teilweise auswertbar.',
          },
        ],
      },
      {
        title: 'Regionalanästhesie & Praxis',
        summary: 'Verfahren, Anatomie, Praxisbezug, Logbuch und fallbasiertes Lernen.',
        items: [
          {
            title: 'Regionalanästhesie Teil 1',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Grundlagen und Lokalanästhetika.',
          },
          {
            title: 'Regionalanästhesie Teil 2',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Verfahren, Sonoanatomie und periphere Blockaden.',
          },
          {
            title: 'Logbuch Anästhesie',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Praxis- und Kompetenzbezug für Stations-/Prüfungsrealität.',
          },
        ],
      },
    ],
  },
  {
    id: 'kardiologie',
    title: 'Kardiologie',
    subtitle: 'Kardiovaskuläres System / Modul 23',
    description:
      'Lokaler Korpus aus dem Moodle-Kurs Kardiovaskuläres System in Modul 23 mit Vorlesungen, Seminaren, Videos und Fallmaterial. Bereit für tutorische Verarbeitung.',
    sourceFocus:
      'Primär: lokaler LMU-/Moodle-Export aus dem Kurs Kardiovaskuläres System. Ergänzend: seriöse medizinische Sekundärquellen.',
    status: 'Erstkontakt',
    confidence: 'niedrig',
    topics: [
      {
        title: 'EKG-Grundlagen und Rhythmusstörungen',
        status: 'Nicht erhoben',
        evidence: 'Vorlesungsfolien und SkillsLab vorhanden, aber noch keine Tutor-Diagnostik.',
        nextStep: 'EKG-Auswertung systematisch durchgehen und mit Tutor abfragen.',
      },
      {
        title: 'Koronarsyndrome',
        status: 'Nicht erhoben',
        evidence: 'ACS- und KHK-Material vorhanden, chronisch und akut.',
        nextStep: 'Differenzierung ACS vs. KHK vertiefen, Seminarinhalt tutorisch aufarbeiten.',
      },
      {
        title: 'Herzinsuffizienz und Klappenvitien',
        status: 'Nicht erhoben',
        evidence: 'Vorlesungen, Videos und Seminar zu Vitien und Herzinsuffizienz vorhanden.',
        nextStep: 'Ätiologie, Klassifikation und operative Optionen strukturiert lernen.',
      },
      {
        title: 'Kardiomyopathien und Myokarditis',
        status: 'Nicht erhoben',
        evidence: 'Dokumente zu Kardiomyopathien vorhanden.',
        nextStep: 'Differenzialdiagnose und Leitlinienüberblick erarbeiten.',
      },
      {
        title: 'Herzchirurgie und mechanische Kreislaufunterstützung',
        status: 'Nicht erhoben',
        evidence: 'Operative Videos und Seminar zu Herzchirurgie vorhanden.',
        nextStep: 'Indikationen und Verfahrensweise systematisch durchgehen.',
      },
      {
        title: 'Gefäßchirurgie und pAVK',
        status: 'Nicht erhoben',
        evidence: 'Vorlesungen und Seminare zu pAVK und Carotis vorhanden.',
        nextStep: 'Diagnostik und Therapie der pAVK strukturieren.',
      },
    ],
    groups: [
      {
        title: 'EKG & Rhythmus',
        summary: 'EKG-Grundlagen, Auswertung und tachykarde/bradykarde Rhythmusstörungen.',
        items: [
          {
            title: 'Vorlesung EKG Basis',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Grundlagen der EKG-Auswertung.',
          },
          {
            title: 'EKG-Auswertung - Kitteltasche',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Kompakte Übersicht für die Kitteltasche.',
          },
          {
            title: 'Tachykarde HRST',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Tachykarde Herzrhythmusstörungen.',
          },
          {
            title: 'Bradykarde HRST',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Bradykarde Herzrhythmusstörungen und Schrittmacher.',
          },
        ],
      },
      {
        title: 'Koronarsyndrome',
        summary: 'Chronisches und akutes Koronarsyndrom, Diagnostik und Therapie.',
        items: [
          {
            title: 'Chronisches Koronarsyndrom',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Vorlesung zum chronischen Koronarsyndrom.',
          },
          {
            title: 'Akutes Koronarsyndrom',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Vorlesung zum akuten Koronarsyndrom.',
          },
          {
            title: 'Seminar KHK / ACS',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Seminar zu koronarer Herzkrankheit und ACS.',
          },
        ],
      },
      {
        title: 'Herzinsuffizienz & Klappen',
        summary: 'Herzinsuffizienz, Aorten- und Segelklappenvitien.',
        items: [
          {
            title: 'Herzinsuffizienz',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Vorlesung zur Herzinsuffizienz.',
          },
          {
            title: 'Aortenvitien',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Aortenklappenvitien im Überblick.',
          },
          {
            title: 'Operative Therapie erworbener Vitien',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Herzchirurgische Therapieoptionen.',
          },
          {
            title: 'Seminar Vitien',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Seminar zu Klappenvitien.',
          },
        ],
      },
      {
        title: 'Kardiomyopathien & Perikard',
        summary: 'Kardiomyopathien, Myokarditis und Perikarderkrankungen.',
        items: [
          {
            title: 'Kardiomyopathien',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Überblick über Kardiomyopathien.',
          },
        ],
      },
      {
        title: 'Herzchirurgie',
        summary: 'Operative Techniken, Bypass, Klappenersatz, Herztransplantation.',
        items: [
          {
            title: 'Herzchirurgische Techniken',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Überblick über Herzchirurgische Verfahren.',
          },
          {
            title: 'Herztransplantation und MCS',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Vorlesung zu Herztransplantation und mechanischer Kreislaufunterstützung.',
          },
        ],
      },
      {
        title: 'Gefäßchirurgie',
        summary: 'pAVK, Carotis, Aorta und peripher-arterielle Verschlusskrankheit.',
        items: [
          {
            title: 'pAVK - Diagnostik',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Diagnostik der peripheren arteriellen Verschlusskrankheit.',
          },
          {
            title: 'pAVK - Therapie',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Therapie der pAVK.',
          },
          {
            title: 'pAVK - Gefäßchirurgische Aspekte',
            kind: 'PDF',
            source: 'lokaler Moodle-Export',
            note: 'Gefäßchirurgische Therapie der pAVK.',
          },
        ],
      },
    ],
  },
]
