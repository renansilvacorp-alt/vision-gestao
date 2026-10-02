'use client';

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, X } from 'lucide-react';

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmRequest = ConfirmOptions & { id: number };
type ConfirmContextValue = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const counter = useRef(0);

  const confirmAction: ConfirmContextValue = options =>
    new Promise(resolve => {
      resolver.current?.(false);
      resolver.current = resolve;
      counter.current += 1;
      setRequest({ ...options, id: counter.current });
    });

  function close(result: boolean) {
    resolver.current?.(result);
    resolver.current = null;
    setRequest(null);
  }

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      {request && (
        <div className="confirm-overlay" role="presentation" onMouseDown={() => close(false)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`confirm-title-${request.id}`}
            onMouseDown={event => event.stopPropagation()}
          >
            <div className={`confirm-icon ${request.danger ? 'danger' : ''}`}>
              <AlertTriangle size={21} />
            </div>
            <button className="confirm-close" aria-label="Fechar" onClick={() => close(false)}>
              <X size={18} />
            </button>
            <div className="confirm-copy">
              <h3 id={`confirm-title-${request.id}`}>{request.title}</h3>
              <p>{request.message}</p>
            </div>
            <div className="confirm-actions">
              <button className="secondary" onClick={() => close(false)}>
                {request.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                className={request.danger ? 'danger-button' : 'primary'}
                onClick={() => close(true)}
              >
                {request.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context)
    throw new Error('useConfirm deve ser usado dentro de ConfirmProvider.');
  return context;
}
