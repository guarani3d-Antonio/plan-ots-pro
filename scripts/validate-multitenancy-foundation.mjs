import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesPath = path.join(root, 'docs', 'estabilizacion-2026-09-20', 'fixtures-tenants.json');
const migrationPath = path.join(root, 'supabase', 'migrations', '202609200001_multitenancy_foundation.sql');

const [fixturesSource, migration] = await Promise.all([
  readFile(fixturesPath, 'utf8'),
  readFile(migrationPath, 'utf8'),
]);

const fixtures = JSON.parse(fixturesSource);
const allowedTenantRoles = new Set(['administrador', 'supervisor', 'tecnico', 'viewer']);
const allowedProjectRoles = new Set(['supervisor', 'tecnico', 'viewer']);
const errors = [];

if (fixtures.status !== 'specification-not-seeded') {
  errors.push('Los fixtures deben seguir marcados como no sembrados hasta ejecutar el aprovisionamiento.');
}
if (fixtures.organizations?.length !== 2) {
  errors.push('Se esperaban exactamente dos empresas ficticias.');
}

const globalKeys = new Set();
const globalEmails = new Set([fixtures.platformCreator?.email]);
for (const organization of fixtures.organizations ?? []) {
  if (organization.projects?.length !== 2) {
    errors.push(`${organization.key}: debe tener exactamente dos obras.`);
  }
  if (organization.users?.length !== 5) {
    errors.push(`${organization.key}: debe tener cinco usuarios de tenant.`);
  }

  const projectKeys = new Set((organization.projects ?? []).map((project) => project.key));
  for (const item of [...(organization.projects ?? []), ...(organization.users ?? [])]) {
    if (globalKeys.has(item.key)) errors.push(`Clave duplicada: ${item.key}.`);
    globalKeys.add(item.key);
  }

  for (const user of organization.users ?? []) {
    if (!allowedTenantRoles.has(user.tenantRole)) {
      errors.push(`${user.key}: tenantRole inválido (${user.tenantRole}).`);
    }
    if (!allowedProjectRoles.has(user.projectRole)) {
      errors.push(`${user.key}: projectRole inválido (${user.projectRole}).`);
    }
    if (globalEmails.has(user.email)) errors.push(`Email duplicado: ${user.email}.`);
    globalEmails.add(user.email);
    for (const projectKey of user.projects ?? []) {
      if (!projectKeys.has(projectKey)) {
        errors.push(`${user.key}: referencia una obra fuera de su empresa (${projectKey}).`);
      }
    }
  }
}

for (const required of [
  'create table public.tenants',
  'create table public.tenant_miembros',
  'create table public.plataforma_administradores',
  'add column tenant_id uuid references public.tenants(id)',
  'set search_path = pg_catalog, public',
  'revoke all on table public.tenants from public, anon, authenticated',
]) {
  if (!migration.toLowerCase().includes(required)) {
    errors.push(`La migración no contiene el control requerido: ${required}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('OK: 2 empresas, 4 obras, 10 usuarios y controles de fundación coherentes.');
}
