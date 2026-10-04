import { type CSSProperties, createContext, type ReactNode, useContext } from "react";
import { sfx } from "../audio/index.ts";
import type { UiPreset } from "../profile/index.ts";
import "./ui.css";

// Two UI presets. "kid": giant icons, no text needed (labels are only read aloud by
// accessibility tools). "standard": the same buttons with visible labels.

const UiContext = createContext<UiPreset>("kid");

export function UiProvider({ preset, children }: { preset: UiPreset; children: ReactNode }) {
  return (
    <UiContext.Provider value={preset}>
      <div className={`th-ui th-ui-${preset}`}>{children}</div>
    </UiContext.Provider>
  );
}

export function useUiPreset(): UiPreset {
  return useContext(UiContext);
}

interface IconButtonProps {
  icon: ReactNode;
  label: string;
  onPress(): void;
  /** Visible label even in the kid preset (e.g. numbers). */
  badge?: ReactNode;
  size?: "small" | "medium" | "large";
  active?: boolean;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}

export function IconButton({
  icon,
  label,
  onPress,
  badge,
  size = "medium",
  active,
  disabled,
  className,
  style,
  testId,
}: IconButtonProps) {
  const preset = useUiPreset();
  return (
    <button
      type="button"
      data-ui
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`th-button th-button-${size}${active ? " th-active" : ""} ${className ?? ""}`}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        sfx("tap");
        onPress();
      }}
    >
      <span className="th-button-icon">{icon}</span>
      {badge !== undefined && <span className="th-badge">{badge}</span>}
      {preset === "standard" && <span className="th-button-label">{label}</span>}
    </button>
  );
}

/** A floating card for menus, shops, and pickers. */
export function Panel({
  children,
  onClose,
  title,
  testId,
}: {
  children: ReactNode;
  onClose?: () => void;
  title?: string;
  testId?: string;
}) {
  const preset = useUiPreset();
  return (
    <div className="th-panel-backdrop" data-ui data-testid={testId}>
      <div className="th-panel">
        <div className="th-panel-head">
          {preset === "standard" && title ? <h2>{title}</h2> : <span />}
          {onClose && <IconButton icon="✖️" label="Close" size="small" onPress={onClose} />}
        </div>
        {children}
      </div>
    </div>
  );
}
