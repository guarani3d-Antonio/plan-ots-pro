#!/usr/bin/env node
/**
 * preflight-deploy.mjs — Auditoría previa al deploy (GDV)
 *
 * Uso:  node scripts/preflight-deploy.mjs
 *       node scripts/preflight-deploy.mjs --root . --env .env.local
 *
 * No modifica nada. Solo lee y reporta.
 * Exit code 1 si hay algún hallazgo BLOQUEANTE.
 *
 * Cross-platform: funciona igual en Windows, macOS y Linux.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

// ---------- args ----------
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const ROOT = path.resolve(getArg('root', '.'));
const ENV_FILE = getArg('env', '.env.local');

// ---------- salida ----------
const C = {
  reset: '\x1b[0m', red: '\x1b[31m', yellow: '\x1b[33m',
  green: '\x1b[32m', cyan: '\x1b[36m', dim: '\x1b[2m', bold: '\x1b[1m',
};
const findings = { block: [], warn: [], info: [] };
const block = (m) => findings.block.push(m);
const warn = (m) => findings.warn.push(m);
const info = (m) => findings.info.push(m);
const section = (t) => console.log(`\n${C.bold}${C.cyan}── ${t} ${'─'.repeat(Math.max(0, 58 - t.length))}${C.reset}`);

// ---------- utilidades ----------
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', 'out',
  '.vercel', '.turbo', 'coverage', '.cache',
]);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SELF_NAME = 'preflight-deploy.mjs'; // no escanearse a sí mismo (sus comentarios de ejemplo matchean su propia regex)

function walk(dir, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.env' && !e.name.startsWith('.env.')) {
      if (e.isDirectory()) continue;
    }
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(full, acc);
    } else if (CODE_EXT.has(path.extname(e.name)) && e.name !== SELF_NAME) {
      acc.push(full);
    }
  }
  return acc;
}

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function parseEnv(content) {
  const out = new Map();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out.set(k, v);
  }
  return out;
}

console.log(`${C.bold}PREFLIGHT DEPLOY — GDV${C.reset}`);
console.log(`${C.dim}raíz: ${ROOT}${C.reset}`);

// ---------- 1. stack ----------
section('1. Stack detectado');
const pkgRaw = readIfExists(path.join(ROOT, 'package.json'));
let deps = {};
if (!pkgRaw) {
  block('No se encontró package.json en la raíz indicada.');
} else {
  const pkg = JSON.parse(pkgRaw);
  deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const has = (n) => Object.prototype.hasOwnProperty.call(deps, n);

  const framework = has('next') ? `Next.js ${deps.next}`
    : has('vite') ? `Vite ${deps.vite} (SPA)`
    : has('react-scripts') ? 'Create React App (SPA)'
    : 'desconocido';
  console.log(`  framework .......... ${framework}`);

  const supa = has('@supabase/ssr') ? '@supabase/ssr (correcto)'
    : has('@supabase/auth-helpers-nextjs') ? '@supabase/auth-helpers-nextjs (DEPRECADO)'
    : has('@supabase/supabase-js') ? '@supabase/supabase-js (solo cliente base)'
    : 'no detectado';
  console.log(`  cliente Supabase ... ${supa}`);
  if (has('@supabase/auth-helpers-nextjs')) {
    warn('Usa @supabase/auth-helpers-nextjs, que está deprecado en favor de @supabase/ssr. NO migrar antes del deploy — es tarea aparte, post-pruebas.');
  }
  if (framework.includes('SPA')) {
    warn('App SPA sin servidor: no hay middleware server-side. TODA la seguridad depende de la RLS de Postgres. Auditar RLS con doble rigor.');
  }

  console.log(`  ORM/DB ............. ${has('drizzle-orm') ? 'Drizzle' : has('prisma') ? 'Prisma' : has('postgres') ? 'postgres.js' : '—'}`);

  const pwaPlugin = has('vite-plugin-pwa') || has('workbox-window');
  const offlineStore = has('dexie') || has('localforage') || has('idb');
  console.log(`  PWA / service worker  ${pwaPlugin ? 'SÍ (vite-plugin-pwa/workbox)' : 'no detectado'}`);
  console.log(`  storage offline ....   ${offlineStore ? `SÍ (${has('dexie') ? 'Dexie/IndexedDB' : has('idb') ? 'idb' : 'localforage'})` : 'no detectado'}`);
  if (pwaPlugin) {
    warn('Tiene service worker real (no solo manifest). Verificar la estrategia de actualización de Workbox (skipWaiting/clientsClaim) antes de la prueba de campo: una tablet con el SW viejo cacheado puede seguir sirviendo una build anterior después del deploy, sin que el usuario lo note.');
  }
  if (offlineStore) {
    info('Tiene almacenamiento local (IndexedDB). Si hay lógica de sincronización con Supabase, mapearla ANTES de definir los checks de aislamiento de datos — la RLS protege lo que llega al servidor, no lo que vive en la tablet.');
  }

  console.log(`  scripts ............ ${Object.keys(pkg.scripts || {}).join(', ') || '—'}`);
  if (!pkg.scripts || !pkg.scripts.build) {
    block('No hay script "build" en package.json. Vercel no va a saber cómo compilar.');
  }
}

const hasMiddleware = ['middleware.ts', 'middleware.js', 'src/middleware.ts', 'src/middleware.js',
  'proxy.ts', 'src/proxy.ts']
  .some((p) => fs.existsSync(path.join(ROOT, p)));
console.log(`  middleware ......... ${hasMiddleware ? 'sí' : 'NO'}`);
if (deps.next && !hasMiddleware) {
  warn('Next.js sin middleware: no hay gate de sesión server-side. Verificar que cada página protegida valide sesión por su cuenta.');
}

// ---------- 2. variables de entorno ----------
section('2. Variables de entorno');
const files = walk(ROOT);
const used = new Map(); // var -> Set(archivos)
// process.env.X / process.env['X']  -> Next.js, Node, scripts
// import.meta.env.X / import.meta.env['X'] -> Vite (SPA)
const RE = /process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]|import\.meta\.env\.([A-Z0-9_]+)|import\.meta\.env\[['"]([A-Z0-9_]+)['"]\]/g;
const IGNORE = new Set(['NODE_ENV', 'VERCEL', 'VERCEL_ENV', 'VERCEL_URL', 'VERCEL_REGION', 'CI', 'PORT',
  'MODE', 'DEV', 'PROD', 'SSR', 'BASE_URL']); // BASE_URL/MODE/DEV/PROD/SSR son inyectadas por Vite mismo
for (const f of files) {
  const txt = readIfExists(f);
  if (!txt) continue;
  let m;
  while ((m = RE.exec(txt)) !== null) {
    const name = m[1] || m[2] || m[3] || m[4];
    if (IGNORE.has(name)) continue;
    if (!used.has(name)) used.set(name, new Set());
    used.get(name).add(path.relative(ROOT, f));
  }
}
const usesVite = [...files].some((f) => (readIfExists(f) || '').includes('import.meta.env'));
if (usesVite) {
  info('Detectado import.meta.env (Vite): las variables públicas acá llevan prefijo VITE_, no NEXT_PUBLIC_. Cualquier otra variable NO es accesible desde el cliente aunque esté en .env — Vite solo expone las VITE_*.');
}

const envRaw = readIfExists(path.join(ROOT, ENV_FILE));
const envVars = envRaw ? parseEnv(envRaw) : new Map();
if (!envRaw) {
  warn(`No se encontró ${ENV_FILE}. No se puede contrastar la lista de variables usadas.`);
}

const usedNames = [...used.keys()].sort();
console.log(`  variables referenciadas en el código: ${usedNames.length}`);
const missing = usedNames.filter((n) => envRaw && !envVars.has(n));
const extra = [...envVars.keys()].filter((n) => !used.has(n)).sort();

console.log(`\n  ${C.bold}Cargar en Vercel (Production + Preview + Development):${C.reset}`);
for (const n of usedNames) {
  const pub = n.startsWith('NEXT_PUBLIC_') || n.startsWith('VITE_');
  const mark = envRaw ? (envVars.has(n) ? `${C.green}✓${C.reset}` : `${C.red}✗ falta en ${ENV_FILE}${C.reset}`) : ' ';
  console.log(`    ${mark} ${n} ${pub ? C.dim + '(público — se hornea en el build)' + C.reset : ''}`);
}
if (missing.length) {
  block(`Variables usadas en el código pero ausentes de ${ENV_FILE}: ${missing.join(', ')}. En Vercel van a quedar undefined.`);
}
if (extra.length) {
  info(`Variables en ${ENV_FILE} que el código no usa (probablemente muertas): ${extra.join(', ')}`);
}

// ---------- 3. secretos filtrados a variables públicas ----------
section('3. Secretos en variables públicas');
const SECRET_HINTS = [
  { re: /^eyJ[A-Za-z0-9_-]{20,}\./, why: 'parece un JWT (posible service_role legacy)' },
  { re: /^sb_secret_/, why: 'es una secret key de Supabase' },
  { re: /^postgres(ql)?:\/\//i, why: 'es una connection string de base de datos' },
  { re: /^re_[A-Za-z0-9]{10,}/, why: 'parece una API key de Resend' },
  { re: /^tr_[A-Za-z0-9]{10,}/, why: 'parece una key de Trigger.dev' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'es una clave privada' },
];
const SECRET_NAME_HINTS = /(SERVICE_ROLE|SECRET|PRIVATE_KEY|PASSWORD|DATABASE_URL|_TOKEN)/;

let leaks = 0;
for (const [k, v] of envVars) {
  const isPublic = k.startsWith('NEXT_PUBLIC_') || k.startsWith('VITE_');
  if (!isPublic) continue;
  const byName = SECRET_NAME_HINTS.test(k);
  const byValue = SECRET_HINTS.find((h) => h.re.test(v));
  if (byName || byValue) {
    leaks++;
    block(`${k} es una variable PÚBLICA y ${byValue ? byValue.why : 'su nombre indica que contiene un secreto'}. Cualquiera que abra la app la puede leer. ROTAR la credencial y sacarla del prefijo público ANTES de deployar.`);
  }
}
console.log(leaks === 0 ? `  ${C.green}✓ sin secretos detectados en variables públicas${C.reset}` : `  ${C.red}✗ ${leaks} hallazgo(s)${C.reset}`);

// ---------- 4. git ----------
section('4. Git y secretos en el repo');
const gitignore = readIfExists(path.join(ROOT, '.gitignore')) || '';
const ignoresEnv = /(^|\n)\s*\.env\*?\.?local|\.env\*/.test(gitignore) || gitignore.includes('.env');
console.log(`  .gitignore cubre .env ... ${ignoresEnv ? C.green + 'sí' + C.reset : C.red + 'NO' + C.reset}`);
if (!ignoresEnv) block('.gitignore no cubre archivos .env — riesgo directo de commitear credenciales.');

try {
  const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    .split(/\r?\n/).filter((f) => /(^|\/)\.env/.test(f));
  if (tracked.length) {
    block(`Git está trackeando archivos de entorno: ${tracked.join(', ')}. Sacarlos del índice y ROTAR todo lo que contengan.`);
  } else {
    console.log(`  archivos .env trackeados . ${C.green}ninguno${C.reset}`);
  }

  try {
    const hist = execSync('git log --oneline --all -- .env .env.local .env.production', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split(/\r?\n/).filter(Boolean);
    if (hist.length > 0) {
      warn(`Hay ${hist.length} commit(s) en el historial que tocaron archivos .env. Aunque hoy estén borrados, siguen en el historial: asumir esas credenciales como comprometidas y rotarlas.`);
    }
  } catch { /* sin historial relevante */ }

  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const dirty = execSync('git status --porcelain', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  console.log(`  rama ..................... ${branch}`);
  console.log(`  árbol limpio ............. ${dirty ? C.yellow + 'NO (' + dirty.split(/\r?\n/).length + ' cambios sin commitear)' + C.reset : C.green + 'sí' + C.reset}`);
  if (dirty) warn('Hay cambios sin commitear. Vercel deploya lo que está en GitHub, no lo que está en el disco. Commitear y pushear antes de deployar.');
} catch {
  warn('No se pudo consultar git (¿el proyecto no es un repo, o git no está en el PATH?). Sin git no hay rollback posible.');
}

// ---------- 5. build ----------
section('5. Build de producción');
console.log(`  ${C.dim}Este script no corre el build (tarda). Correr a mano:${C.reset}`);
console.log(`  ${C.bold}npm run build${C.reset}`);
console.log(`  ${C.dim}Tiene que pasar en local antes de tocar Vercel. "npm run dev" no valida lo mismo.${C.reset}`);

// ---------- resumen ----------
section('RESUMEN');
if (findings.block.length) {
  console.log(`\n${C.red}${C.bold}BLOQUEANTES (${findings.block.length}) — no deployar hasta resolver:${C.reset}`);
  findings.block.forEach((m, i) => console.log(`  ${C.red}${i + 1}.${C.reset} ${m}`));
}
if (findings.warn.length) {
  console.log(`\n${C.yellow}${C.bold}ADVERTENCIAS (${findings.warn.length}):${C.reset}`);
  findings.warn.forEach((m, i) => console.log(`  ${C.yellow}${i + 1}.${C.reset} ${m}`));
}
if (findings.info.length) {
  console.log(`\n${C.dim}${C.bold}INFORMATIVO (${findings.info.length}):${C.reset}`);
  findings.info.forEach((m, i) => console.log(`  ${C.dim}${i + 1}. ${m}${C.reset}`));
}
if (!findings.block.length && !findings.warn.length) {
  console.log(`\n${C.green}${C.bold}✓ Sin hallazgos. Correr "npm run build" y seguir con la Fase 1 (Supabase).${C.reset}`);
}
console.log('');
process.exit(findings.block.length ? 1 : 0);
