import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import istanbulCoverage from 'istanbul-lib-coverage';
import v8ToIstanbul from 'v8-to-istanbul';

const { createCoverageMap } = istanbulCoverage;
const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coverageOutput = resolve(projectRoot, '.nyc_output');
const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

const findChrome = () => {
  const candidates = [
    process.env.CHROME_BIN,
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate.includes(sep) && existsSync(candidate)) return candidate;
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }
  throw new Error('No se encontró Chrome/Chromium. Configura CHROME_BIN para ejecutar las pruebas de navegador.');
};

const sleep = (milliseconds) => new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));

const waitForDebugger = async (chrome, profilePath, getChromeError) => {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (chrome.exitCode !== null) {
      throw new Error(`Chrome terminó antes de iniciar el protocolo de depuración. ${getChromeError()}`);
    }
    try {
      const portFile = await readFile(join(profilePath, 'DevToolsActivePort'), 'utf8');
      const debugPort = Number(portFile.split(/\r?\n/)[0]);
      if (!Number.isInteger(debugPort) || debugPort <= 0) throw new Error('Puerto DevTools inválido.');
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(({ type }) => type === 'page');
        if (page?.webSocketDebuggerUrl) return page;
      }
    } catch {
      // Chrome may still be starting or creating its DevTools port file.
    }
    await sleep(100);
  }
  throw new Error(`Chrome no inició el endpoint de depuración dentro del tiempo esperado. ${getChromeError()}`);
};

const connectDebugger = (webSocketUrl) => new Promise((resolveSocket, reject) => {
  const socket = new WebSocket(webSocketUrl);
  socket.addEventListener('open', () => {
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(String(data));
      if (!message.id) return;
      const current = pending.get(message.id);
      if (!current) return;
      pending.delete(message.id);
      clearTimeout(current.timeout);
      if (message.error) current.reject(new Error(message.error.message));
      else current.resolve(message.result);
    });
    socket.addEventListener('close', () => {
      for (const request of pending.values()) {
        clearTimeout(request.timeout);
        request.reject(new Error('La conexión de depuración con Chrome se cerró.'));
      }
      pending.clear();
    });
    resolveSocket({
      socket,
      send(method, params = {}) {
        const id = ++nextId;
        return new Promise((resolveCommand, rejectCommand) => {
          const timeout = setTimeout(() => {
            pending.delete(id);
            rejectCommand(new Error(`Chrome no respondió al comando ${method}.`));
          }, 15000);
          pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timeout });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
    });
  });
  socket.addEventListener('error', () => reject(new Error('No se pudo conectar al protocolo de depuración de Chrome.')), { once: true });
});

const collectBrowserCoverage = async (entries, serverOrigin) => {
  const coverageMap = createCoverageMap({});
  for (const entry of entries) {
    if (!entry.url) continue;
    const scriptUrl = new URL(entry.url);
    const isAppScript = scriptUrl.pathname.startsWith('/src/')
      || scriptUrl.pathname === '/service-worker.js';
    if (scriptUrl.origin !== serverOrigin || !isAppScript) continue;
    const sourcePath = resolve(projectRoot, `.${decodeURIComponent(scriptUrl.pathname)}`);
    const relativePath = relative(projectRoot, sourcePath);
    if (relativePath.startsWith('..') || relativePath.split(sep).includes('tests')) continue;

    const source = await readFile(sourcePath, 'utf8');
    const converter = v8ToIstanbul(sourcePath, 0, { source });
    await converter.load();
    converter.applyCoverage(entry.functions);
    coverageMap.merge(converter.toIstanbul());
  }

  if (Object.keys(coverageMap.toJSON()).length > 0) {
    await mkdir(coverageOutput, { recursive: true });
    await writeFile(
      resolve(coverageOutput, `browser-${process.pid}.json`),
      JSON.stringify(coverageMap.toJSON()),
    );
  }
};

const serveFrontend = () => createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = resolve(projectRoot, relativePath);
    if (filePath !== projectRoot && !filePath.startsWith(`${projectRoot}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    const contents = await readFile(filePath);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
    });
    response.end(contents);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

const chromePath = findChrome();
const profilePath = await mkdtemp(resolve(tmpdir(), 'galenosv-chrome-'));
const server = serveFrontend();
let chrome;
let chromeError = '';
let debuggerClient;
let serverOrigin;

try {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const serverPort = server.address().port;
  serverOrigin = `http://127.0.0.1:${serverPort}`;
  const testPageUrl = `${serverOrigin}/tests/index.html`;

  chrome = spawn(chromePath, [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${profilePath}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: process.platform !== 'win32' });
  chrome.stderr.setEncoding('utf8');
  chrome.stderr.on('data', (chunk) => {
    chromeError = `${chromeError}${chunk}`.slice(-3000);
  });

  const target = await waitForDebugger(chrome, profilePath, () => chromeError);
  debuggerClient = await connectDebugger(target.webSocketDebuggerUrl);
  await debuggerClient.send('Page.enable');
  await debuggerClient.send('Runtime.enable');
  await debuggerClient.send('Profiler.enable');
  await debuggerClient.send('Profiler.startPreciseCoverage', { callCount: false, detailed: true });
  await debuggerClient.send('Page.navigate', { url: testPageUrl });

  let testStatus = null;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const evaluation = await debuggerClient.send('Runtime.evaluate', {
      expression: `({
        done: document.documentElement.dataset.mochaDone === 'true',
        failures: Number(document.documentElement.dataset.mochaFailures || 0),
        passes: Number(document.documentElement.dataset.mochaPasses || 0),
        report: document.documentElement.dataset.mochaFailureDetails || '[]'
      })`,
      returnByValue: true,
    });
    testStatus = evaluation.result?.value;
    if (testStatus?.done) break;
    await sleep(100);
  }

  const { result: coverageEntries } = await debuggerClient.send('Profiler.takePreciseCoverage');
  await collectBrowserCoverage(coverageEntries, serverOrigin);
  await debuggerClient.send('Profiler.stopPreciseCoverage');
  if (!testStatus?.done) throw new Error('La suite de navegador no terminó en 60 segundos.');
  console.log(`Chrome browser tests: ${testStatus.passes} aprobadas, ${testStatus.failures} fallidas.`);
  if (testStatus.failures > 0) {
    console.error(testStatus.report);
    process.exitCode = 1;
  }
} finally {
  debuggerClient?.socket.close();
  if (chrome) {
    try {
      if (process.platform === 'win32') chrome.kill('SIGTERM');
      else process.kill(-chrome.pid, 'SIGTERM');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    if (chrome.exitCode === null) {
      await Promise.race([
        new Promise((resolveExit) => chrome.once('exit', resolveExit)),
        sleep(3000),
      ]);
    }
    try {
      if (process.platform === 'win32') chrome.kill('SIGKILL');
      else process.kill(-chrome.pid, 'SIGKILL');
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    if (chrome.exitCode === null) await new Promise((resolveExit) => chrome.once('exit', resolveExit));
  }
  await new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  await sleep(250);
  await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
