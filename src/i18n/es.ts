import type { MessageKey } from './en';

/** Spanish strings. Missing keys fall back to English (spec §144). */
export const es: Partial<Record<MessageKey, string>> = {
  'app.title': 'Editor de vídeo con IA',
  'app.tagline': 'Local primero · tus archivos nunca salen de este dispositivo',

  'nav.projects': 'Proyectos',
  'nav.edit': 'Editar',
  'nav.studio': 'Estudio IA',
  'nav.automation': 'Automatización',
  'nav.aiSetup': 'Configurar IA',
  'nav.export': 'Exportar',
  'nav.commandPalette': 'Paleta de comandos',

  'browser.newProject': 'Nuevo proyecto',
  'browser.empty': 'Aún no hay proyectos. Crea uno para importar material y montar una línea de tiempo. Todo se guarda localmente en tu navegador (IndexedDB).',
  'browser.create': 'Crear',
  'browser.cancel': 'Cancelar',
  'browser.duplicate': 'Duplicar',
  'browser.delete': 'Eliminar',
  'browser.sampleProject': 'Abrir un proyecto de ejemplo',

  'common.undo': 'Deshacer',
  'common.redo': 'Rehacer',
  'common.close': 'Cerrar',
  'common.run': 'Ejecutar',
  'common.apply': 'Aplicar',
  'common.discard': 'Descartar',
  'common.remove': 'Quitar',
  'common.save': 'Guardar',

  'panel.media': 'Medios',
  'panel.effects': 'Efectos',
  'panel.audio': 'Audio',
  'panel.text': 'Texto',
  'panel.inspector': 'Inspector',
  'panel.transcript': 'Transcripción',
  'panel.activity': 'Actividad',
  'panel.settings': 'Ajustes',

  'settings.appearance': 'Apariencia',
  'settings.theme': 'Tema',
  'settings.theme.dark': 'Oscuro',
  'settings.theme.highContrast': 'Alto contraste',
  'settings.theme.light': 'Claro',
  'settings.uiScale': 'Escala de interfaz',
  'settings.language': 'Idioma',
  'settings.reducedMotion': 'Reducir movimiento',
  'settings.reducedMotion.system': 'Según el sistema',
  'settings.telemetry': 'La telemetría está desactivada. Esta app no envía nada a ningún sitio — no hay interruptor porque no hay nada que enviar.',

  'error.title': 'Algo salió mal',
  'error.why': 'Por qué',
  'error.what': 'Qué pasó',
  'error.fix': 'Cómo solucionarlo',
  'error.dismiss': 'Descartar',

  'error.import.unsupported.message': 'No se pudo importar ese archivo.',
  'error.import.unsupported.cause': 'El navegador no pudo decodificar su contenedor o códec.',
  'error.import.unsupported.fix': 'Prueba con un MP4 (H.264/AAC), MOV, WebM, PNG/JPG o WAV/MP3. El navegador puede no admitir códecs muy nuevos o inusuales.',

  'error.export.failed.message': 'La exportación no terminó.',
  'error.export.failed.fix': 'Prueba una calidad menor o el formato WebM. Si MP4 no está disponible, tu navegador no tiene WebCodecs — se recomienda Chrome o Edge para exportar.',

  'error.model.notInstalled.message': 'Esa función necesita un modelo local que no está instalado.',
  'error.model.notInstalled.cause': 'Los modelos de IA en el dispositivo se descargan una vez, a petición, y quedan en caché.',
  'error.model.notInstalled.fix': 'Abre Configurar IA y descarga el modelo. Después funciona sin conexión.',

  'error.hardware.insufficient.message': 'Este equipo no puede ejecutar esa operación con los ajustes pedidos.',
  'error.hardware.insufficient.fix': 'Baja la resolución o la duración, o elige un modelo más ligero.',

  'debug.title': 'Diagnóstico',
  'debug.hardware': 'Hardware',
  'debug.models': 'Modelos locales',
  'debug.queue': 'Cola de generación',
  'debug.storage': 'Almacenamiento',
  'debug.logs': 'Registros recientes',
  'debug.fps': 'FPS de previsualización',
  'debug.export': 'Exportar diagnóstico',
};
