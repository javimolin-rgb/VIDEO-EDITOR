/**
 * Hardware profiling (spec §6, §154, §155). Browser-only signals — this is a
 * best-effort profile for choosing sensible defaults and warning the user,
 * not a precise inventory. A native local service (Phase 3) can replace this
 * with real GPU/VRAM figures.
 */

export type GenerationProfile = 'fast' | 'balanced' | 'quality';

export interface HardwareProfile {
  os: string;
  gpuVendor: string;
  gpuRenderer: string;
  logicalCores: number;
  deviceMemoryGb: number | null;
  webgpu: boolean;
  webgl2: boolean;
  webcodecs: boolean;
  offscreenCanvas: boolean;
  recommendedProfile: GenerationProfile;
  notes: string;
}

function detectOS(): string {
  const ua = navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/Linux/.test(ua)) return 'Linux';
  if (/iPhone|iPad/.test(ua)) return 'iOS';
  return 'Unknown OS';
}

function readGpu(): { vendor: string; renderer: string } {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { vendor: 'unknown', renderer: 'unknown' };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'hidden';
    let vendor = 'unknown';
    if (/apple/i.test(renderer)) vendor = 'Apple';
    else if (/nvidia|geforce|rtx|gtx/i.test(renderer)) vendor = 'NVIDIA';
    else if (/amd|radeon/i.test(renderer)) vendor = 'AMD';
    else if (/intel/i.test(renderer)) vendor = 'Intel';
    return { vendor, renderer };
  } catch {
    return { vendor: 'unknown', renderer: 'unknown' };
  }
}

export async function detectHardware(): Promise<HardwareProfile> {
  const os = detectOS();
  const { vendor, renderer } = readGpu();
  const logicalCores = navigator.hardwareConcurrency || 4;
  const deviceMemoryGb =
    'deviceMemory' in navigator ? ((navigator as unknown as { deviceMemory: number }).deviceMemory ?? null) : null;

  let webgpu = false;
  try {
    webgpu = 'gpu' in navigator && !!(await (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu?.requestAdapter());
  } catch {
    webgpu = false;
  }

  const webgl2 = (() => {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  })();
  const webcodecs = typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'function';
  const offscreenCanvas = typeof (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas === 'function';

  // Conservative heuristic: browsers can't see VRAM, so we lean on GPU vendor,
  // core count and RAM hint.
  let recommendedProfile: GenerationProfile = 'fast';
  if (vendor === 'NVIDIA' && logicalCores >= 8) recommendedProfile = 'quality';
  else if ((vendor === 'Apple' || vendor === 'AMD') && logicalCores >= 8) recommendedProfile = 'balanced';

  const notes =
    `Detected ${vendor} (${renderer}). ` +
    (recommendedProfile === 'fast'
      ? 'Start with lightweight models and short, low-resolution generations; larger local video models may be impractical here.'
      : recommendedProfile === 'balanced'
        ? 'Mid-range local video generation at ~720p / short durations should be workable.'
        : 'This machine can likely run larger local video models at higher settings.') +
    ' Exact VRAM is not visible to the browser; a native local service will refine this.';

  return {
    os,
    gpuVendor: vendor,
    gpuRenderer: renderer,
    logicalCores,
    deviceMemoryGb,
    webgpu,
    webgl2,
    webcodecs,
    offscreenCanvas,
    recommendedProfile,
    notes,
  };
}
