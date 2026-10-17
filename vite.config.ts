import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { assertTownBuild } from './src/config/loadTowns';

function townConfigPlugin(townEnv: string | undefined): Plugin {
  return {
    name: 'town-config',
    buildStart() {
      assertTownBuild(process.cwd(), townEnv);
    },
  };
}

/** Prod bundles keep demoReports out of the client JSON. The file on disk is unchanged. */
function stripDemoReportIds(demoOn: boolean): Plugin {
  return {
    name: 'strip-demo-report-ids',
    enforce: 'post',
    transform(code, id) {
      if (demoOn) return null;
      const normalized = id.split('\\').join('/');
      if (!normalized.includes('/data/towns/') || !normalized.endsWith('.json')) return null;
      const value = JSON.parse(readFileSync(id, 'utf8')) as { demoReports?: unknown[] };
      if (!value.demoReports?.length) return null;
      value.demoReports = [];
      return { code: `export default ${JSON.stringify(value)}`, map: null };
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const demoValue = process.env.VITE_DEMO ?? env.VITE_DEMO;
  const demoOn = demoValue === 'true';
  const prodMode = mode === 'production';
  const prodTarget = process.env.CIVIC_HOSTING_TARGET === 'prod';
  if (demoOn && (prodMode || prodTarget)) {
    throw new Error(
      'Refusing to build: VITE_DEMO=true is not allowed for a production mode or prod hosting target.',
    );
  }
  const townEnv = process.env.VITE_TOWN ?? env.VITE_TOWN;
  return {
    define: {
      __CIVIC_DEMO__: JSON.stringify(demoOn),
    },
    plugins: [react(), townConfigPlugin(townEnv), stripDemoReportIds(demoOn)],
  };
});
