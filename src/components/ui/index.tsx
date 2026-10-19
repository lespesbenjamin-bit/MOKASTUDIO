import { clsx } from 'clsx';
import {
  forwardRef, useEffect, useId, useRef,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
} from 'react';
import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react';

// --- Button ----------------------------------------------------------------
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-terracotta text-white hover:bg-terracotta-600 active:bg-terracotta-700 shadow-sm',
  secondary: 'bg-white text-anthracite border border-beige-300 hover:bg-creme',
  ghost: 'text-anthracite-700 hover:bg-beige/60',
  danger: 'bg-red-700 text-white hover:bg-red-800 shadow-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40 focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-55',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

// --- Champs -----------------------------------------------------------------
type FieldProps = { label: string; error?: string; hint?: string; children: (id: string) => ReactNode };
export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-anthracite-700">{label}</label>
      {children(id)}
      {error ? (
        <p className="text-xs text-red-700" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-xs text-anthracite-500">{hint}</p>
      ) : null}
    </div>
  );
}

const fieldBase =
  'block w-full rounded-lg border bg-white px-3 text-sm text-anthracite placeholder:text-anthracite-300 ' +
  'focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta disabled:bg-creme disabled:text-anthracite-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(fieldBase, 'h-10', invalid ? 'border-red-400' : 'border-beige-300', className)}
        {...rest}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={clsx(fieldBase, 'h-10 pr-8', invalid ? 'border-red-400' : 'border-beige-300', className)}
        {...rest}
      >
        {children}
      </select>
    );
  },
);

// --- Carte, badge -----------------------------------------------------------
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('rounded-xl border border-beige-300/70 bg-white shadow-card', className)}>{children}</div>;
}

type Tone = 'neutral' | 'terracotta' | 'success' | 'warning' | 'muted';
const tones: Record<Tone, string> = {
  neutral: 'bg-beige text-anthracite-700',
  terracotta: 'bg-terracotta-50 text-terracotta-700',
  success: 'bg-emerald-50 text-emerald-800',
  warning: 'bg-amber-50 text-amber-800',
  muted: 'bg-creme text-anthracite-500 border border-beige-300',
};
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', tones[tone])}>
      {children}
    </span>
  );
}

// --- Messages ---------------------------------------------------------------
export function Alert({ tone = 'error', children }: { tone?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-beige-300 bg-creme text-anthracite-700',
  }[tone];
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm', styles)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-anthracite-500" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-creme">
      <Spinner />
    </div>
  );
}

// --- Modale -----------------------------------------------------------------
type ModalProps = { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode };
export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-beige-300 bg-white p-0 text-anthracite shadow-xl backdrop:bg-anthracite/40 backdrop:backdrop-blur-[2px]"
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-beige px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-anthracite-500">{description}</p>}
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-anthracite-500 hover:bg-creme" aria-label="Fermer">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-beige px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

type ConfirmProps = {
  open: boolean; title: string; message: ReactNode; confirmLabel: string;
  danger?: boolean; loading?: boolean; error?: string | null;
  onConfirm: () => void; onCancel: () => void;
};
export function ConfirmDialog({ open, title, message, confirmLabel, danger, loading, error, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onCancel}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>Annuler</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-anthracite-700">
        <div>{message}</div>
        {error && <Alert>{error}</Alert>}
      </div>
    </Modal>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-anthracite">{title}</h1>
        {description && <p className="mt-1 text-sm text-anthracite-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}
