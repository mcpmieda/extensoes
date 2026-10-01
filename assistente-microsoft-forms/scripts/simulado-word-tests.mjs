import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source = await fs.readFile(new URL('../src/background/07-simulado-word.js', import.meta.url), 'utf8');
const id = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
function setup(reason, throwing = false) {
  let handler, timer, connections = 0, cleared = false;
  const events = () => ({ addListener(fn) { this.fn = fn; } });
  const port = { onMessage: events(), onDisconnect: events(), disconnect() {}, postMessage(data) { this.request = data; } };
  const runtime = { id, lastError: null, onMessage: { addListener(fn) { handler = fn; } }, connectNative() { connections++; if (throwing) throw new Error(reason); return port; } };
  vm.runInNewContext(source, { chrome: { runtime }, gssfAllowedSender: s => s.id === id, setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { cleared = true; } });
  const request = (message, sender = { id }) => { const answers = []; const keepAlive = handler({ type: 'GSSF_SIMULADO_WORD', ...message }, sender, x => answers.push(x)); return { answers, keepAlive }; };
  return { port, runtime, request, expire: () => timer(), connections: () => connections, cleared: () => cleared, disconnect() { runtime.lastError = { message: reason }; port.onDisconnect.fn(); } };
}
for (const [reason, code] of [
  ['Specified native messaging host not found.', 'WORD_CONNECTOR_MISSING'],
  ['Access to the specified native messaging host is forbidden.', 'WORD_CONNECTOR_FORBIDDEN'],
  ['Native host has exited.', 'WORD_CONNECTOR_UNAVAILABLE']
]) {
  const x = setup(reason), r = x.request({ action: 'model' });
  assert.equal(r.keepAlive, true); x.disconnect();
  assert.equal(r.answers.length, 1); assert.equal(r.answers[0].code, code);
  assert.equal(r.answers[0].extensionId, id); assert.equal(r.answers[0].technicalDetail, reason);
  assert.equal(x.cleared(), true);
}
{
  const x = setup('Host not found', true), r = x.request({ action: 'status' });
  assert.equal(r.answers[0].code, 'WORD_CONNECTOR_MISSING');
}
{
  const x = setup('disconnect'), r = x.request({ action: 'model' });
  x.port.onMessage.fn({ ok: true, layers: [] }); x.disconnect(); x.expire();
  assert.equal(r.answers.length, 1); assert.equal(r.answers[0].ok, true);
}
{
  const x = setup(''), r = x.request({ action: 'status' }); x.expire();
  assert.equal(r.answers[0].ok, false); assert.match(r.answers[0].technicalDetail, /Tempo limite/);
}
{
  const x = setup('');
  assert.equal(x.request({ action: 'model' }, { id: 'untrusted' }).answers[0].ok, false);
  assert.equal(x.request({ action: 'shell' }).answers[0].ok, false);
  assert.equal(x.request({ action: 'generate', html: 10 }).answers[0].ok, false);
  assert.equal(x.connections(), 0);
}
console.log('Conector Word: ausência, ID não autorizado, desconexão, timeout, resposta única e bloqueios aprovados.');
