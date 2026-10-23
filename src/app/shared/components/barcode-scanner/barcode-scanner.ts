import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  output,
  signal,
  viewChild
} from '@angular/core';

// Solo los formatos de gondola: menos formatos = deteccion mas rapida, y un QR o similar en el
// envase no se confunde con el codigo del producto.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
const SCAN_INTERVAL_MS = 120;

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
}

// La camara solo se ofrece en dispositivos tactiles (celular/tablet): en una computadora la
// webcam frontal no sirve para escanear, ahi se usa la pistola lectora.
export function cameraScanAvailable(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && window.matchMedia('(pointer: coarse)').matches;
}

// Chrome Android trae BarcodeDetector nativo; Safari en iOS no, ahi se usa zxing compilado a
// wasm (barcode-detector/ponyfill). Import dinamico: esa libreria y su .wasm (~1 MB) se bajan
// recien la primera vez que alguien abre la camara en un navegador sin lector nativo. El .wasm
// se sirve desde la propia app (ver assets en angular.json), no desde un CDN, para que ande
// sin depender de terceros.
async function createDetector(): Promise<Detector> {
  const native = (window as unknown as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (native) {
    const supported = await native.getSupportedFormats();
    if (supported.includes('ean_13')) {
      return new native({ formats: FORMATS.filter((format) => supported.includes(format)) });
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill');
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? `zxing/${path}` : prefix + path)
    }
  });
  return new BarcodeDetector({ formats: FORMATS as never[] });
}

type ScannerState = 'starting' | 'scanning' | 'denied' | 'unavailable';

// Pantalla completa con la camara trasera: lee un codigo, lo emite por (scanned) y el padre la
// cierra. Se monta con @if en el padre (fuera de cualquier p-dialog: el transform de su
// animacion rompe el position:fixed) y al destruirse apaga la camara.
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-barcode-scanner',
  templateUrl: './barcode-scanner.html'
})
export class BarcodeScanner {
  readonly scanned = output<string>();
  readonly closed = output<void>();

  private readonly video = viewChild.required<ElementRef<HTMLVideoElement>>('video');

  protected readonly state = signal<ScannerState>('starting');
  protected readonly torchAvailable = signal(false);
  protected readonly torchOn = signal(false);

  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor() {
    afterNextRender(() => void this.start());
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected onClose(): void {
    this.closed.emit();
  }

  protected async onToggleTorch(): Promise<void> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    const next = !this.torchOn();
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      this.torchOn.set(next);
    } catch {
      this.torchAvailable.set(false);
    }
  }

  private async start(): Promise<void> {
    try {
      // Se piden en paralelo: en iOS cargar zxing tarda lo mismo que prender la camara.
      const [stream, detector] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        }),
        createDetector()
      ]);
      if (this.destroyed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;

      const capabilities = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
      this.torchAvailable.set(!!capabilities?.torch);

      const video = this.video().nativeElement;
      video.srcObject = stream;
      await video.play();
      this.state.set('scanning');
      this.scanLoop(detector, video);
    } catch (err) {
      const name = (err as { name?: unknown } | null)?.name;
      this.state.set(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
      console.error('No se pudo abrir la camara', err);
    }
  }

  private scanLoop(detector: Detector, video: HTMLVideoElement): void {
    if (this.destroyed) return;
    this.timer = setTimeout(async () => {
      try {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          const [first] = await detector.detect(video);
          const code = first?.rawValue.trim();
          if (code && !this.destroyed) {
            navigator.vibrate?.(80);
            this.scanned.emit(code);
            return;
          }
        }
      } catch {
        // Un frame que falla (ej. la camara todavia acomodandose) no corta el escaneo.
      }
      this.scanLoop(detector, video);
    }, SCAN_INTERVAL_MS);
  }

  private stop(): void {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
