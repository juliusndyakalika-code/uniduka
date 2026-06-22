import { useEffect, useRef, useState } from 'react';
import { X, Camera, AlertCircle, Loader2, ScanLine } from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// Native BarcodeDetector API — supported in Chrome 88+ / Edge 88+ / Safari 17.4+
declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(image: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
  static getSupportedFormats(): Promise<string[]>;
}

const FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'code_93',
  'qr_code', 'data_matrix', 'aztec',
];

type Status = 'loading' | 'scanning' | 'no-detector' | 'denied' | 'error';

export default function CameraScanner({ onScan, onClose }: Props) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const streamRef  = useRef<MediaStream | null>(null);
  const rafRef     = useRef<number>();
  const manualRef  = useRef<HTMLInputElement>(null);
  const [status, setStatus]   = useState<Status>('loading');
  const [lastScan, setLastScan] = useState('');
  const [manualVal, setManualVal] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // Open camera — use { ideal: 'environment' } so desktops fallback to front cam
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('denied');
        } else {
          setStatus('error');
        }
        return;
      }
      if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }

      // Try native BarcodeDetector for auto-scan
      if ('BarcodeDetector' in window) {
        try {
          const supported = await BarcodeDetector.getSupportedFormats();
          const formats   = FORMATS.filter(f => supported.includes(f));
          const detector  = new BarcodeDetector({ formats: formats.length ? formats : ['ean_13', 'code_128'] });
          setStatus('scanning');

          function scan() {
            if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
              rafRef.current = requestAnimationFrame(scan);
              return;
            }
            detector.detect(videoRef.current).then(barcodes => {
              if (cancelled) return;
              if (barcodes.length > 0) {
                const code = barcodes[0].rawValue;
                setLastScan(code);
                onScan(code);
                setTimeout(onClose, 500);
                return;
              }
              rafRef.current = requestAnimationFrame(scan);
            }).catch(() => {
              if (!cancelled) rafRef.current = requestAnimationFrame(scan);
            });
          }
          scan();
          return;
        } catch {
          // BarcodeDetector failed — fall through to manual mode
        }
      }

      // No auto-detection: show camera + manual entry fallback
      setStatus('no-detector');
      setTimeout(() => manualRef.current?.focus(), 100);
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current!);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [onScan, onClose]);

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = manualVal.trim();
    if (val.length >= 3) {
      onScan(val);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <Camera size={16} className="text-primary-600" />
            <span className="text-sm font-semibold text-stone-900">Camera Scanner</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700">
            <X size={18} />
          </button>
        </div>

        {/* Camera view */}
        <div className="relative bg-black" style={{ aspectRatio: '4/3' }}>
          <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

          {status === 'scanning' && (
            <>
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-40">
                  <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-400 rounded-tl-sm" />
                  <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-400 rounded-tr-sm" />
                  <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-400 rounded-bl-sm" />
                  <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-400 rounded-br-sm" />
                  <div className="absolute left-2 right-2 top-0 h-0.5 bg-primary-400/80 animate-scan-line" />
                </div>
              </div>
              {lastScan && (
                <div className="absolute bottom-2 inset-x-0 flex justify-center">
                  <span className="bg-emerald-500 text-white text-xs font-mono px-3 py-1 rounded-full">✓ {lastScan}</span>
                </div>
              )}
            </>
          )}

          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 size={32} className="text-white animate-spin" />
            </div>
          )}

          {/* Manual entry mode — camera showing but no auto-detect */}
          {status === 'no-detector' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-56 h-40">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-400 rounded-tl-sm" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-400 rounded-tr-sm" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-400 rounded-bl-sm" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-400 rounded-br-sm" />
              </div>
            </div>
          )}

          {status === 'denied' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center text-white">
                <AlertCircle size={32} className="mx-auto mb-3 text-red-400" />
                <p className="text-sm font-semibold mb-1">Camera permission denied</p>
                <p className="text-xs text-white/70">Allow camera access in your browser settings, then try again</p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center text-white">
                <AlertCircle size={32} className="mx-auto mb-3 text-amber-400" />
                <p className="text-sm font-semibold mb-1">Camera unavailable</p>
                <p className="text-xs text-white/70">No camera found or access was blocked</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer: auto-scan hint OR manual entry */}
        <div className="px-4 py-3">
          {status === 'scanning' && (
            <p className="text-xs text-center text-stone-400">Point camera at barcode · auto-detects instantly</p>
          )}

          {status === 'no-detector' && (
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine size={13} className="absolute left-2.5 top-2.5 text-stone-400" />
                <input
                  ref={manualRef}
                  value={manualVal}
                  onChange={e => setManualVal(e.target.value)}
                  placeholder="Scan or type barcode…"
                  className="input pl-8 text-sm py-2"
                  autoComplete="off"
                />
              </div>
              <button type="submit" className="btn-primary px-3 py-2 text-xs">OK</button>
            </form>
          )}

          {(status === 'denied' || status === 'error') && (
            <p className="text-xs text-center text-stone-400">
              Use a physical barcode scanner instead
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
