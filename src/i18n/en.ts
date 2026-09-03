/** English strings. This is the source of truth for keys; other languages
 *  fall back to these when a key is missing (spec §144). */
export const en = {
  'app.title': 'AI Video Editor',
  'app.tagline': 'Local-first · your media never leaves this device',

  'nav.projects': 'Projects',
  'nav.edit': 'Edit',
  'nav.studio': 'AI Studio',
  'nav.automation': 'Automation',
  'nav.aiSetup': 'AI Setup',
  'nav.export': 'Export',
  'nav.commandPalette': 'Command palette',

  'browser.newProject': 'New project',
  'browser.empty': 'No projects yet. Create one to start importing footage and building a timeline. Everything is stored locally in your browser (IndexedDB).',
  'browser.create': 'Create',
  'browser.cancel': 'Cancel',
  'browser.duplicate': 'Duplicate',
  'browser.delete': 'Delete',
  'browser.sampleProject': 'Open a sample project',

  'common.undo': 'Undo',
  'common.redo': 'Redo',
  'common.close': 'Close',
  'common.run': 'Run',
  'common.apply': 'Apply',
  'common.discard': 'Discard',
  'common.remove': 'Remove',
  'common.save': 'Save',

  'panel.media': 'Media',
  'panel.effects': 'Effects',
  'panel.audio': 'Audio',
  'panel.text': 'Text',
  'panel.inspector': 'Inspector',
  'panel.transcript': 'Transcript',
  'panel.activity': 'Activity',
  'panel.settings': 'Settings',

  'settings.appearance': 'Appearance',
  'settings.theme': 'Theme',
  'settings.theme.dark': 'Dark',
  'settings.theme.highContrast': 'High contrast',
  'settings.theme.light': 'Light',
  'settings.uiScale': 'UI scale',
  'settings.language': 'Language',
  'settings.reducedMotion': 'Reduce motion',
  'settings.reducedMotion.system': 'Follow system',
  'settings.telemetry': 'Telemetry is off. This app sends nothing anywhere — there is no toggle because there is nothing to send.',

  'error.title': 'Something went wrong',
  'error.why': 'Why',
  'error.what': 'What happened',
  'error.fix': 'How to fix it',
  'error.dismiss': 'Dismiss',

  'error.import.unsupported.message': 'That file could not be imported.',
  'error.import.unsupported.cause': 'The browser could not decode its container or codec.',
  'error.import.unsupported.fix': 'Try an MP4 (H.264/AAC), MOV, WebM, PNG/JPG, or WAV/MP3 file. Very new or unusual codecs may not be supported by the browser.',

  'error.export.failed.message': 'The export did not finish.',
  'error.export.failed.fix': 'Try a lower quality or the WebM format. If MP4 is unavailable your browser lacks WebCodecs — Chrome or Edge is recommended for export.',

  'error.model.notInstalled.message': 'That feature needs a local model that is not installed.',
  'error.model.notInstalled.cause': 'On-device AI models are downloaded once, on request, and cached.',
  'error.model.notInstalled.fix': 'Open AI Setup and download the model. It then works offline.',

  'error.hardware.insufficient.message': 'This machine cannot run that operation at the requested settings.',
  'error.hardware.insufficient.fix': 'Lower the resolution or duration, or choose a lighter model.',

  'debug.title': 'Diagnostics',
  'debug.hardware': 'Hardware',
  'debug.models': 'Local models',
  'debug.queue': 'Generation queue',
  'debug.storage': 'Storage',
  'debug.logs': 'Recent logs',
  'debug.fps': 'Preview FPS',
  'debug.export': 'Export diagnostics',
} as const;

export type MessageKey = keyof typeof en;
