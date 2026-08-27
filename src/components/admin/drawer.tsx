import { useEffect, useRef, type ReactNode, type RefObject } from "react";

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
};

export function Drawer({ open, onClose, title, children, returnFocusRef }: DrawerProps) {
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const closeBtn = document.querySelector<HTMLElement>("[data-drawer-close]");
    closeBtn?.focus();
    return () => {
      previousFocus.current?.focus?.();
      if (returnFocusRef) returnFocusRef.current = null;
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      className="ops-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ops-drawer-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="ops-drawer" onKeyDown={(event) => event.stopPropagation()}>
        <header className="ops-drawer__header">
          <h2 id="ops-drawer-title">{title}</h2>
          <button
            type="button"
            className="text-button"
            onClick={onClose}
            aria-label="Fechar"
            data-drawer-close
          >
            Fechar
          </button>
        </header>
        <div className="ops-drawer__body">{children}</div>
      </div>
      <button
        type="button"
        className="ops-drawer__backdrop"
        onClick={onClose}
        aria-label="Fechar"
        tabIndex={-1}
        data-drawer-backdrop
      />
    </div>
  );
}
