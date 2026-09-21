// Los días 6 y 7 exigen confirmación del servidor, aíslan la sesión y protegen
// las ediciones concurrentes. Los casos históricos siguen en la evidencia día 2.
await import('./validate-orden-mapper.mjs');
await import('./test-day6-client.mjs');
await import('./test-day7-client.mjs');
