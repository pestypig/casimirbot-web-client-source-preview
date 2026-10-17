declare module 'react-plotly.js';

// Allow CSS custom properties in inline style objects (e.g. "--sidebar-width")
import 'react';
declare module 'react' {
  interface CSSProperties {
    [key: `--${string}`]: string | number | undefined;
  }
}
