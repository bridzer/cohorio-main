import type { InputHTMLAttributes, ReactNode } from "react";

export function AuthField({
  id,
  label,
  hint,
  error,
  action,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  action?: ReactNode;
}) {
  const describedBy = [
    hint ? `${id}-hint` : null,
    error ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <label className="auth-field" htmlFor={id}>
      <span>{label}</span>
      <span className={action ? "auth-password-wrap" : undefined}>
        <input
          {...props}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-required={props.required || undefined}
          aria-describedby={describedBy || undefined}
        />
        {action}
      </span>
      {hint && (
        <small id={`${id}-hint`} className="auth-hint">
          {hint}
        </small>
      )}
      {error && (
        <small id={`${id}-error`} className="auth-field-error">
          {error}
        </small>
      )}
    </label>
  );
}
