import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { check } from './check.mjs';
import { projectRoot, distRoot, walk, readJson, sha256 } from './build.mjs';

try {
  await check();
  // Reuse the exact local dependency shipped by the extension, without downloads.
  const require = createRequire(import.meta.url);
  const JSZip = require('../public/vendor/jszip.min.js');
  const manifest = await readJson('public/manifest.json');
  const zip = new JSZip();
  const fixedDate = new Date('1980-01-01T00:00:00.000Z');
  for (const relative of await walk(distRoot)) {
    zip.file(relative, await fs.readFile(path.join(distRoot, relative)), {
      date: fixedDate, createFolders: false, unixPermissions: 0o100644,
    });
  }
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 }, platform: 'UNIX' });
  const name = `assistente-microsoft-forms-${manifest.version}.zip`;
  const releaseRoot = path.join(projectRoot, 'release');
  await fs.mkdir(releaseRoot, { recursive: true });
  await fs.writeFile(path.join(releaseRoot, name), bytes);
  await fs.writeFile(path.join(releaseRoot, `${name}.sha256`), `${sha256(bytes)}  ${name}\n`);
  console.log(`Pacote: release/${name}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
