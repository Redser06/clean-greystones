/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TOWN?: string;
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
  readonly VITE_DEMO_DATA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.geojson?raw' {
  const value: string;
  export default value;
}
