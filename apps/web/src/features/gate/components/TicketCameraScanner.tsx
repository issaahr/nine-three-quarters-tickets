import { BrowserQRCodeReader } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';

interface ScannerControls {
  stop: () => void;
}

interface TicketCameraScannerProps {
  disabled: boolean;
  onCredential: (credential: string) => void;
}

/**
 * Lê a credencial pelo QR Code, sem tornar a câmera uma dependência da entrada manual.
 *
 * @param disabled - Impede novas leituras enquanto uma validação está em andamento.
 * @param onCredential - Recebe a credencial bruta detectada para a validação no backend.
 * @returns O controle de leitura por câmera da portaria.
 */
export function TicketCameraScanner({ disabled, onCredential }: TicketCameraScannerProps) {
  const videoReference = useRef<HTMLVideoElement>(null);
  const controlsReference = useRef<ScannerControls | null>(null);
  const hasDetectedCredentialReference = useRef(false);
  const [isActive, setIsActive] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function stopCamera(): void {
    controlsReference.current?.stop();
    controlsReference.current = null;

    if (videoReference.current) {
      videoReference.current.srcObject = null;
    }

    setIsActive(false);
  }

  async function startCamera(): Promise<void> {
    setMessage(null);
    hasDetectedCredentialReference.current = false;
    setIsActive(true);

    try {
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoReference.current ?? undefined,
        (result, _error, scannerControls) => {
          if (!result || hasDetectedCredentialReference.current) {
            return;
          }

          hasDetectedCredentialReference.current = true;
          scannerControls.stop();
          controlsReference.current = null;
          setIsActive(false);
          onCredential(result.getText());
        },
      );

      if (!hasDetectedCredentialReference.current) {
        controlsReference.current = controls;
      }
    } catch {
      stopCamera();
      setMessage(
        'Não foi possível acessar a câmera. Verifique a permissão ou use o código manual.',
      );
    }
  }

  useEffect(() => stopCamera, []);

  useEffect(() => {
    if (disabled && isActive) {
      stopCamera();
    }
  }, [disabled, isActive]);

  return (
    <section className="rounded-[4px] border border-[#3A1A20] bg-[#0D0507] p-5">
      <h2 className="font-heading text-xl font-semibold">Leitor por câmera</h2>
      <p className="mt-2 text-sm text-[#B7AFA3]">Aponte a câmera para o QR Code do ingresso.</p>
      <video
        ref={videoReference}
        muted
        playsInline
        className={
          isActive ? 'mt-4 aspect-video w-full rounded-[4px] bg-black object-cover' : 'hidden'
        }
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => void (isActive ? stopCamera() : startCamera())}
        className="mt-4 rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC] transition-colors hover:bg-[#3A1A20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
      >
        {isActive ? 'Desativar câmera' : 'Ativar câmera'}
      </button>
      {message && (
        <p role="status" className="mt-3 text-sm text-[#D9C7A0]">
          {message}
        </p>
      )}
    </section>
  );
}
