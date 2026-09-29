import React, { useId } from "react";

export type ToggleSize = "sm" | "md" | "lg";

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  size?: ToggleSize;
  id?: string;
}

const trackSizeClasses: Record<ToggleSize, string> = {
  sm: "w-7  h-4",
  md: "w-9  h-5",
  lg: "w-11 h-6",
};

const thumbSizeClasses: Record<ToggleSize, string> = {
  sm: "w-3  h-3",
  md: "w-3.5 h-3.5",
  lg: "w-4.5 h-4.5",
};

const thumbTranslateClasses: Record<ToggleSize, string> = {
  sm: "translate-x-3.5",
  md: "translate-x-4",
  lg: "translate-x-5",
};

/**
 * Toggle / Switch
 * Accessible switch control.
 * Prop API: checked / onChange / disabled / label / description / size.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  size = "md",
  id: externalId,
}: ToggleProps): React.ReactElement {
  const autoId = useId();
  const id = externalId ?? autoId;
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className="flex items-center gap-3">
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        aria-describedby={descId}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={[
          "relative inline-flex items-center rounded-full",
          "transition-all duration-normal",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
          "cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
          "flex-shrink-0 p-0.5",
          trackSizeClasses[size],
          checked
            ? "bg-gradient-primary shadow-glow-primary-sm"
            : "bg-bg-overlay border border-border",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span
          aria-hidden="true"
          className={[
            "inline-block rounded-full bg-white shadow-sm",
            "transition-transform duration-normal",
            thumbSizeClasses[size],
            checked ? thumbTranslateClasses[size] : "translate-x-0",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </button>

      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <label
              htmlFor={id}
              className="text-sm font-medium text-text-primary cursor-pointer select-none"
            >
              {label}
            </label>
          )}
          {description && (
            <p id={descId} className="text-xs text-text-muted">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
