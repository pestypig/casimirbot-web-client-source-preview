import 'react';

declare module 'react' {
  interface CSSProperties {
    // allow CSS custom properties like "--sidebar-width"
    [key: `--${string}`]: string | number | undefined;
  }
}
