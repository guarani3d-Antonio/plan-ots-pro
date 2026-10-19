import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { DashboardWorkspace } from '../src/components/dashboard/PersonalDashboard';
import { bindIdentity } from '../src/security/sessionScope';
import { loadDashboardData } from '../src/services/dashboardDataService';
import { loadPersonalDashboards, savePersonalDashboards } from '../src/services/personalDashboardService';
import { simulateData, watch, failNextRead } from './qa-dashboard-operational-mock';
import { proyectos, tenant } from './qa-grid-local-mock';
import { useAccessStore } from '../src/stores/accessStore';
import { useAuthStore } from '../src/stores/authStore';
import '../src/index.css';
const ids = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002'];
function identity(id: string) { bindIdentity(id); useAuthStore.setState({ user: { id } as never, loading: false }); }
identity(ids[0]);
useAccessStore.setState({ disponible: true, contexto: { creador: true, empresas: [{ id: tenant, nombre: 'Empresa ficticia', rol: 'supervisor', puede_crear: true }], obras: proyectos.map(p => ({ id: p.id, tenant_id: tenant, nombre: p.nombre, editar: false, administrar: false, ver_costos: false })) } });
const fetchLocal = window.fetch.bind(window);
window.fetch = (input, init) => { const url = new URL(typeof input === 'string' ? input : input instanceof Request ? input.url : input.href, location.href); if (url.origin !== location.origin) throw Error('Red externa bloqueada en ensayo local'); return fetchLocal(input, init); };
const services = { data: loadDashboardData, load: loadPersonalDashboards, save: savePersonalDashboards, watch };
function QA() { const [account, setAccount] = useState(ids[0]); return <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}><header style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '6px 14px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)', fontSize: 11 }}><strong>Plan-OTs · ensayo local ficticio</strong><label>Cuenta <select value={account} onChange={e => { identity(e.target.value); setAccount(e.target.value); }}><option value={ids[0]}>A · preferencias anteriores</option><option value={ids[1]}>B · dashboard nuevo</option></select></label><button onClick={simulateData}>Simular nueva OT</button><button onClick={failNextRead}>Fallar lectura</button><span>Red externa y escrituras operativas bloqueadas</span></header><DashboardWorkspace key={account} userId={account} services={services} /></div>; }
createRoot(document.getElementById('root')!).render(<QA />);
