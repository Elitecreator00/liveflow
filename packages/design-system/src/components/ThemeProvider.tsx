import React, { createContext, useContext } from "react";

export type ColorScheme = "dark";

export interface ThemeContextValue {
  colorScheme: ColorScheme;
}

const ThemeContext = createContext<ThemeContextValue>({ colorScheme: "dark" });

export interface ThemeProviderProps {
  colorScheme?: ColorScheme;
  children: React.ReactNode;
  className?: string;
}

/**
 * ThemeProvider
 * Wraps the app with the LiveFlow dark control-room theme.
 * Sets data-theme="dark" so CSS vars resolve correctly.
 */
export function ThemeProvider({
  colorScheme = "dark",
  children,
  className,
}: ThemeProviderProps): React.ReactElement {
  return (
    <ThemeContext.Provider value={{ colorScheme }}>
      <div
        data-theme={colorScheme}
        className={[
          "lf-dark bg-bg-base text-text-primary font-sans antialiased",
          "min-h-screen",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
