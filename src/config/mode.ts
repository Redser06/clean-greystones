/**
 * The only module that reads the demo/prod mode flag.
 * Off unless VITE_DEMO is exactly the string "true".
 * Vite replaces __CIVIC_DEMO__ with that boolean so production builds can drop demo modules.
 */
declare const __CIVIC_DEMO__: boolean | undefined;

function readDemoFlag(): boolean {
  const value = (import.meta as ImportMeta & { env?: { VITE_DEMO?: string } }).env?.VITE_DEMO;
  return value === 'true';
}

export const isDemo = typeof __CIVIC_DEMO__ === 'boolean' ? __CIVIC_DEMO__ : readDemoFlag();
