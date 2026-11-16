import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { execSync } from 'node:child_process';

// Which version of the code is this? Vercel tells us the commit; on a laptop we ask git.
// It is shown in the footer and written into reports, so a measurement can be traced to the code that made it.
function build() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '-local';
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true },
  define: { __BUILD__: JSON.stringify(build()) },
});
