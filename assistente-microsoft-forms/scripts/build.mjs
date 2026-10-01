import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const distRoot = path.join(projectRoot, 'dist');
export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const readJson = async (relative) => JSON.parse(await fs.readFile(path.join(projectRoot, relative), 'utf8'));

/** Reject missing files, traversal and symlinks outside the extension folder. */
export async function safeSource(relative) {
  const candidate = path.resolve(projectRoot, relative);
  const actual = await fs.realpath(candidate);
  const local = path.relative(projectRoot, actual);
  if (!local || local === '..' || local.startsWith(`..${path.sep}`) || path.isAbsolute(local)) {
    throw new Error(`Caminho fora da extensão: ${relative}`);
  }
  if (!(await fs.stat(actual)).isFile()) throw new Error(`Não é um arquivo: ${relative}`);
  return actual;
}

export async function walk(directory, prefix = '') {
  const items = await fs.readdir(directory, { withFileTypes: true });
  const result = [];
  for (const item of items.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const relative = `${prefix}${item.name}`;
    if (item.isSymbolicLink()) throw new Error(`Link simbólico não permitido: ${relative}`);
    if (item.isDirectory()) result.push(...await walk(path.join(directory, item.name), `${relative}/`));
    else if (item.isFile()) result.push(relative);
  }
  return result;
}

function quoteLiteral(value, quote) {
  if (quote === '"') return JSON.stringify(value);
  if (quote === "'") return "'" + JSON.stringify(value).slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'") + "'";
  if (quote === '`') return '`' + value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') + '`';
  throw new Error(`Aspas de recurso inválidas: ${quote}`);
}

/** Resolve source fragments at build time, never in the browser. */
export async function compileSources() {
  const config = await readJson('config/build.json');
  const resources = await readJson('config/resources.json');
  const usedFiles = new Set();
  const usedResources = new Set();
  const renderedResources = new Map();
  const occurrences = new Map();

  async function resourceLiteral(key) {
    if (renderedResources.has(key)) return renderedResources.get(key);
    const spec = resources[key];
    if (!spec) throw new Error(`Recurso desconhecido: ${key}`);
    const file = await safeSource(spec.path);
    const bytes = await fs.readFile(file);
    let value;
    if (spec.encoding === 'text') value = bytes.toString('utf8');
    else if (spec.encoding === 'base64') value = bytes.toString('base64');
    else if (spec.encoding === 'data-url' && /^image\/[a-z0-9.+-]+$/i.test(spec.mime || '')) value = `data:${spec.mime};base64,${bytes.toString('base64')}`;
    else throw new Error(`Codificação de recurso inválida: ${key}`);
    const literal = quoteLiteral(value, spec.quote);
    renderedResources.set(key, literal);
    usedResources.add(key);
    usedFiles.add(spec.path);
    return literal;
  }

  async function expand(relative, stack = []) {
    if (stack.includes(relative)) throw new Error(`Inclusão circular: ${[...stack, relative].join(' -> ')}`);
    const absolute = await safeSource(relative);
    usedFiles.add(relative);
    occurrences.set(relative, (occurrences.get(relative) || 0) + 1);
    const source = await fs.readFile(absolute, 'utf8');
    const pattern = /\/\* @include ([^*\r\n]+?) \*\/\r?\n?/g;
    let output = '', last = 0;
    for (const match of source.matchAll(pattern)) {
      const child = path.posix.normalize(path.posix.join(path.posix.dirname(relative), match[1].trim()));
      output += source.slice(last, match.index) + await expand(child, [...stack, relative]);
      last = match.index + match[0].length;
    }
    output += source.slice(last);
    const assetPattern = /__GSSF_RESOURCE__\("([A-Z0-9_]+)"\)/g;
    let rendered = '', assetLast = 0;
    for (const match of output.matchAll(assetPattern)) {
      rendered += output.slice(assetLast, match.index) + await resourceLiteral(match[1]);
      assetLast = match.index + match[0].length;
    }
    rendered += output.slice(assetLast);
    return rendered;
  }

  const outputs = {};
  if (config.schemaVersion !== 1) throw new Error('Versão de configuração de build não suportada.');
  for (const [output, entry] of Object.entries(config.entrypoints)) {
    if (!/^[a-z-]+\.(js|css)$/.test(output)) throw new Error(`Nome de saída inválido: ${output}`);
    outputs[output] = await expand(entry);
  }
  for (const key of Object.keys(resources)) if (!usedResources.has(key)) throw new Error(`Recurso cadastrado mas não usado: ${key}`);
  for (const [file, count] of occurrences) if (count !== 1) throw new Error(`Módulo incluído ${count} vezes: ${file}`);
  return { outputs, usedFiles: [...usedFiles].sort(), usedResources: [...usedResources].sort() };
}

export async function build() {
  // Compile before replacing dist, so invalid sources do not erase the last build.
  const result = await compileSources();
  const publicFiles = await walk(path.join(projectRoot, 'public'));
  if (publicFiles.some((file) => file in result.outputs)) throw new Error('public contém um arquivo de saída gerada.');
  await fs.rm(distRoot, { recursive: true, force: true });
  await fs.mkdir(distRoot, { recursive: true });
  for (const relative of publicFiles) {
    const source = await safeSource(`public/${relative}`);
    const target = path.join(distRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  for (const [name, text] of Object.entries(result.outputs)) await fs.writeFile(path.join(distRoot, name), text, 'utf8');
  console.log(`Build concluído: ${publicFiles.length + Object.keys(result.outputs).length} arquivos em dist/.`);
  return result;
}

if (process.argv[1] && path.relative(path.resolve(process.argv[1]), fileURLToPath(import.meta.url)) === '') {
  build().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
