import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build, projectRoot, distRoot, walk, readJson, sha256, safeSource } from './build.mjs';

export async function check({ baseline = false } = {}) {
  const result = await build();
  const manifest = JSON.parse(await fs.readFile(path.join(distRoot, 'manifest.json'), 'utf8'));
  const pkg = await readJson('package.json');
  const reference = await readJson('config/baseline-v15.8.1.json');
  const policy = await readJson('config/security-policy.json');
  const vendorLock = await readJson('config/vendor-lock.json');
  const checks = [];
  const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };

  assert(manifest.manifest_version === 3, 'Manifest V3.');
  assert(manifest.version === pkg.version, 'Versões do manifesto e do projeto coincidem.');
  assert(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version), 'Versão compatível com o manifesto.');
  assert(JSON.stringify(manifest.permissions || []) === JSON.stringify(policy.permissions), 'Permissões correspondem à política revisada.');
  assert(JSON.stringify(manifest.host_permissions || []) === JSON.stringify(policy.hostPermissions), 'Domínios correspondem à política revisada.');
  assert(!manifest.externally_connectable, 'Sem comunicação externa adicional.');
  const files = await walk(distRoot);
  const required = new Set([manifest.background?.service_worker, ...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {})].filter(Boolean));
  for (const item of manifest.content_scripts || []) {
    for (const file of [...(item.js || []), ...(item.css || [])]) required.add(file);
    assert((item.matches || []).every((match) => policy.contentScriptMatches.includes(match)), 'Rotas de execução revisadas.');
  }
  for (const group of manifest.web_accessible_resources || []) {
    assert((group.matches || []).every((match) => policy.webAccessibleMatches.includes(match)), 'Exposição de recursos restrita aos domínios revisados.');
    for (const file of group.resources || []) required.add(file);
  }
  for (const relative of required) assert(files.includes(relative), `Recurso do manifesto presente: ${relative}.`);
  for (const relative of files.filter((file) => file.endsWith('.js'))) {
    new vm.Script(await fs.readFile(path.join(distRoot, relative), 'utf8'), { filename: relative });
    checks.push(`Sintaxe JavaScript: ${relative}.`);
  }
  for (const [name, text] of Object.entries(result.outputs)) {
    assert(!text.includes('__GSSF_RESOURCE__(') && !text.includes('/* @include '), `Diretivas resolvidas: ${name}.`);
  }
  const sources = await walk(path.join(projectRoot, 'src'));
  for (const relative of sources) assert(result.usedFiles.includes(`src/${relative}`), `Fonte alcançável no build: ${relative}.`);
  const forbidden = /(?:\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b)/;
  for (const file of [...result.usedFiles, 'public/manifest.json']) {
    if (!/\.(js|mjs|json|html|css|md)$/.test(file)) continue;
    assert(!forbidden.test(await fs.readFile(await safeSource(file), 'utf8')), `Padrões básicos de segredo: ${file}.`);
  }
  for (const relative of files.filter((file) => file.startsWith('vendor/'))) {
    const known = vendorLock.files[relative];
    const bytes = await fs.readFile(path.join(distRoot, relative));
    const integrityOk = Boolean(known) && (
      (known.sha256 && sha256(bytes) === known.sha256) ||
      (known.md5 && createHash('md5').update(bytes).digest('hex') === known.md5)
    );
    assert(integrityOk, `Integridade de dependência e licença: ${relative}.`);
  }
  if (baseline) {
    assert(JSON.stringify([...files].sort()) === JSON.stringify(Object.keys(reference.files).sort()), 'Conjunto de arquivos idêntico ao pacote original.');
    for (const [relative, known] of Object.entries(reference.files)) {
      const bytes = await fs.readFile(path.join(distRoot, relative));
      assert(bytes.length === known.bytes && sha256(bytes) === known.sha256, `Igualdade byte a byte com V15.8.1: ${relative}.`);
    }
  }
  // Work in a real clone or the delivered source directory; ignore only Git metadata.
  const parent = path.dirname(projectRoot);
  const rootItems = await fs.readdir(parent, { withFileTypes: true });
  for (const entry of rootItems) {
    if (entry.name === '.git') continue;
    assert(entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'), `Raiz contém somente pasta de extensão: ${entry.name}.`);
  }
  const report = {
    checkedAt: new Date().toISOString(), version: manifest.version,
    baselineVerified: baseline, checksPassed: checks.length, runtimeFiles: files.length,
    sourceFiles: sources.length, resourceCount: result.usedResources.length,
    realMicrosoftFormsValidation: 'não executada nesta verificação técnica',
    note: 'Compilação, sintaxe e integridade não substituem validação no Microsoft Forms autenticado.',
    checks,
  };
  await fs.mkdir(path.join(projectRoot, 'reports'), { recursive: true });
  await fs.writeFile(path.join(projectRoot, 'reports/check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`${checks.length} verificações técnicas aprovadas${baseline ? '; pacote equivalente à V15.8.1' : ''}.`);
  return report;
}

if (process.argv[1] && path.relative(path.resolve(process.argv[1]), fileURLToPath(import.meta.url)) === '') {
  check({ baseline: process.argv.includes('--baseline') }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
