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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const townEnv = process.env.VITE_TOWN ?? env.VITE_TOWN;
  return {
    plugins: [react(), townConfigPlugin(townEnv)],
  };
});
