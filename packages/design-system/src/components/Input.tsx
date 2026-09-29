import React, { useId } from "react";

export type InputSize = "sm" | "md" | "lg";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: string;
  description?: string;
  error?: string;
  hint?: string;
  /** Visual size of the input */
  inputSize?: InputSize;
  leftAdornment?: React.ReactNode;
  rightAdornment?: React.ReactNode;
  inputClassName?: string;
}

const sizeClasses: Record<InputSize, string> = {
  sm: "h-7  px-2.5 text-sm  rounded-md",
  md: "h-9  px-3   text-base rounded-lg",
  lg: "h-11 px-4   text-md   rounded-xl",
};

/**
 * Input / Field
 * Form text input with label, description, error and adornment slots.
 * Prop API: label / description / error / hint / size / leftAdornment / rightAdornment.
 */
export function Input({
  label,
  description,
  error,
  hint,
  inputSize = "md",
  leftAdornment,
  rightAdornment,
  inputClassName,
  className,
  id: externalId,
  ...props
}: InputProps): React.ReactElement {
  const autoId = useId();
  const id = externalId ?? autoId;
  const descId = description ? `${id}-desc` : undefined;
  const errId  = error       ? `${id}-err`  : undefined;

  return (
    <div className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-text-secondary uppercase tracking-widest"
        >
          {label}
        </label>
      )}
      {description && (
        <p id={descId} className="text-xs text-text-muted -mt-0.5">
          {description}
        </p>
      )}

      <div className="relative flex items-center">
        {leftAdornment && (
          <span className="absolute left-3 flex items-center pointer-events-none text-text-muted">
            {leftAdornment}
          </span>
        )}

        <input
          id={id}
          aria-describedby={[descId, errId].filter(Boolean).join(" ") || undefined}
          aria-invalid={error ? "true" : undefined}
          className={[
            "w-full bg-bg-elevated border text-text-primary placeholder:text-text-muted",
            "transition-all duration-fast",
            "focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            sizeClasses[inputSize],
            error
              ? "border-danger/50 focus:ring-danger/60"
              : "border-border hover:border-border-strong",
            leftAdornment  ? "pl-9"  : "",
            rightAdornment ? "pr-9"  : "",
            inputClassName,
          ]
            .filter(Boolean)
            .join(" ")}
          {...props}
        />

        {rightAdornment && (
          <span className="absolute right-3 flex items-center pointer-events-none text-text-muted">
            {rightAdornment}
          </span>
        )}
      </div>

      {error && (
        <p id={errId} role="alert" className="text-xs text-danger flex items-center gap-1">
          <span aria-hidden="true">!</span>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}

// ── Textarea variant ─────────────────────────────────────────────────────────

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  description?: string;
  error?: string;
  hint?: string;
  inputClassName?: string;
}

export function Textarea({
  label,
  description,
  error,
  hint,
  inputClassName,
  className,
  id: externalId,
  ...props
}: TextareaProps): React.ReactElement {
  const autoId = useId();
  const id = externalId ?? autoId;
  const descId = description ? `${id}-desc` : undefined;
  const errId  = error       ? `${id}-err`  : undefined;

  return (
    <div className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      {label && (
        <label
          htmlFor={id}
          className="text-xs font-semibold text-text-secondary uppercase tracking-widest"
        >
          {label}
        </label>
      )}
      {description && (
        <p id={descId} className="text-xs text-text-muted -mt-0.5">
          {description}
        </p>
      )}

      <textarea
        id={id}
        aria-describedby={[descId, errId].filter(Boolean).join(" ") || undefined}
        aria-invalid={error ? "true" : undefined}
        className={[
          "w-full bg-bg-elevated border text-base text-text-primary placeholder:text-text-muted",
          "rounded-lg px-3 py-2.5 min-h-[80px] resize-y",
          "transition-all duration-fast",
          "focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-transparent",
          "disabled:opacity-40 disabled:cursor-not-allowed",
          error
            ? "border-danger/50 focus:ring-danger/60"
            : "border-border hover:border-border-strong",
          inputClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />

      {error && (
        <p id={errId} role="alert" className="text-xs text-danger flex items-center gap-1">
          <span aria-hidden="true">!</span>
          {error}
        </p>
      )}
      {hint && !error && (
        <p className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}
