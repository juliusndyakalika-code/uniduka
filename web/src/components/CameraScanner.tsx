import { useEffect, useRef, useState } from 'react';
import { X, Camera, AlertCircle, Loader2 } from 'lucide-react';

interface Props {
  onScan: (barcode: string) => void;
  onClose: () => void;
}

// Native BarcodeDetector API (Chrome 88+, Edge 88+, Safari 17+)
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

export default function CameraScanner({ onScan, onClose }: Props) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>();
  const [status, setStatus] = useState<'loading' | 'scanning' | 'unsupported' | 'denied'>('loading');
  const [lastScan, setLastScan] = useState('');

  const isSupported = 'BarcodeDetector' in window;

  useEffect(() => {
    if (!isSupported) { setStatus('unsupported'); return; }

    let detector: BarcodeDetector;
    let cancelled = false;

    async function start() {
      try {
        const supported = await BarcodeDetector.getSupportedFormats();
        const formats = FORMATS.filter(f => supported.includes(f));
        detector = new BarcodeDetector({ formats: formats.length ? formats : ['ean_13', 'code_128'] });

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus('scanning');
        scan();
      } catch (err: unknown) {
        if (cancelled) return;
        const name = (err as { name?: string })?.name;
        setStatus(name === 'NotAllowedError' ? 'denied' : 'unsupported');
      }
    }

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
          // Brief pause before closing so user sees the scan
          setTimeout(onClose, 400);
          return;
        }
        rafRef.current = requestAnimationFrame(scan);
      }).catch(() => {
        if (!cancelled) rafRef.current = requestAnimationFrame(scan);
      });
    }

    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current!);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, [isSupported, onScan, onClose]);

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

          {/* Scanning overlay */}
          {status === 'scanning' && (
            <>
              {/* Corner guides */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="relative w-56 h-40">
                  <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary-400 rounded-tl-sm" />
                  <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary-400 rounded-tr-sm" />
                  <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary-400 rounded-bl-sm" />
                  <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary-400 rounded-br-sm" />
                  {/* Scan line animation */}
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

          {status === 'unsupported' && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center text-white">
                <AlertCircle size={32} className="mx-auto mb-3 text-amber-400" />
                <p className="text-sm font-semibold mb-1">Camera scanning not available</p>
                <p className="text-xs text-white/70">Use a physical barcode scanner or Chrome/Edge browser</p>
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
        </div>

        <div className="px-4 py-3 text-center">
          <p className="text-xs text-stone-400">Point camera at barcode · auto-detects instantly</p>
        </div>
      </div>
    </div>
  );
}
