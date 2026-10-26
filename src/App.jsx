import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, Building2, CalendarDays,
  ChevronRight, CircleDollarSign, FileText, LayoutDashboard, LogOut,
  Menu, Plus, Search, ShieldCheck, UploadCloud, Wallet, X
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

const money = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL'
}).format(Number(value || 0));

function Login({ onLogin, busy, error }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="brand-mark"><Building2 size={26} /></div>
        <span className="eyebrow">GESTÃO • CONTROLE • HISTÓRICO</span>
        <h1>Controle claro.<br /><em>Decisões seguras.</em></h1>
        <p>Uma visão organizada dos órgãos, empenhos, solicitações e pagamentos da DCP.</p>
        <div className="login-note"><ShieldCheck size={17} /> Acesso protegido por autenticação</div>
      </section>
      <form className="login-card" onSubmit={(e) => { e.preventDefault(); onLogin(email, password); }}>
        <span className="eyebrow">ÁREA RESTRITA</span>
        <h2>Entrar no DCP</h2>
        <p>Use sua conta autorizada para continuar.</p>
        <label>E-mail<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required placeholder="voce@empresa.com" /></label>
        <label>Senha<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required placeholder="Sua senha" /></label>
        {error && <div className="alert error">{error}</div>}
        <button className="primary-btn full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar no sistema'}</button>
        <small>O cadastro de usuários é gerenciado no Supabase Auth.</small>
      </form>
    </main>
  );
}

function SetupNotice() {
  return (
    <main className="setup-shell">
      <div className="setup-card">
        <div className="brand-mark"><Building2 size={26} /></div>
        <span className="eyebrow">CONFIGURAÇÃO INICIAL</span>
        <h1>O DCP está pronto para receber a conexão.</h1>
        <p>Configure as variáveis de ambiente do Supabase para habilitar o login e os dados reais.</p>
        <div className="env-list">
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_ANON_KEY</code>
        </div>
        <p className="muted">Crie um arquivo <code>.env.local</code> na raiz do projeto. Nunca coloque a chave <code>service_role</code> no frontend.</p>
      </div>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [orgs, setOrgs] = useState([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [activeOrg, setActiveOrg] = useState(null);
  const [showOrgForm, setShowOrgForm] = useState(false);
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgError, setOrgError] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgShortName, setOrgShortName] = useState('');
  const [orgLevel, setOrgLevel] = useState('Federal');
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setLoginError(error.message);
      setSession(data?.session ?? null);
      setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!supabase || !session) return;
    setLoadingOrgs(true);
    setLoadError('');
    const { data, error } = await supabase
      .from('organizations')
      .select('id,name,short_name,government_level,is_active,created_at')
      .order('name', { ascending: true });
    if (error) setLoadError(error.message);
    else {
      setOrgs(data ?? []);
      setActiveOrg(current => current && data?.some(o => o.id === current.id)
        ? data.find(o => o.id === current.id) : null);
    }
    setLoadingOrgs(false);
  }, [session]);

  useEffect(() => { loadOrganizations(); }, [loadOrganizations]);

  const filteredOrgs = useMemo(() => orgs.filter(org =>
    [org.name, org.short_name, org.government_level].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  ), [orgs, search]);

  async function signIn(email, password) {
    setLoginBusy(true);
    setLoginError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError('Não foi possível entrar. Confira suas credenciais e se o usuário existe no Supabase.');
    setLoginBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setOrgs([]);
    setActiveOrg(null);
  }

  async function createOrganization(event) {
    event.preventDefault();
    if (!supabase || !orgName.trim()) return;
    setOrgSaving(true);
    setOrgError('');
    const { data, error } = await supabase.from('organizations').insert({
      name: orgName.trim(),
      short_name: orgShortName.trim() || null,
      government_level: orgLevel,
    }).select('id,name,short_name,government_level,is_active,created_at').single();
    if (error) setOrgError(error.message);
    else {
      setOrgs(current => [...current, data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
      setActiveOrg(data);
      setOrgName('');
      setOrgShortName('');
      setShowOrgForm(false);
    }
    setOrgSaving(false);
  }

  if (!isSupabaseConfigured) return <SetupNotice />;
  if (authLoading) return <div className="loading-screen"><div className="spinner" /><span>Preparando o DCP…</span></div>;
  if (!session) return <Login onLogin={signIn} busy={loginBusy} error={loginError} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark small"><Building2 size={20} /></div>
          <div><strong>DCP</strong><span>CONTROLE DE EMPRESAS</span></div>
          <button className="icon-btn mobile-close" onClick={() => setMobileNav(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <div className="nav-label">MENU PRINCIPAL</div>
        <button className="nav-item selected" onClick={() => { setActiveOrg(null); setMobileNav(false); }}><LayoutDashboard size={18} /> Visão geral</button>
        <div className="nav-heading"><span>ÓRGÃOS E BATALHÕES</span><button className="tiny-add" onClick={() => setShowOrgForm(true)} aria-label="Cadastrar órgão"><Plus size={16} /></button></div>
        <div className="org-nav-list">
          {orgs.map(org => (
            <button key={org.id} className={`nav-item org-nav ${activeOrg?.id === org.id ? 'selected' : ''}`} onClick={() => { setActiveOrg(org); setMobileNav(false); }}>
              <span className="org-avatar">{(org.short_name || org.name).slice(0, 2).toUpperCase()}</span><span className="org-nav-name">{org.short_name || org.name}</span><ChevronRight size={15} />
            </button>
          ))}
          {!orgs.length && <p className="sidebar-empty">Seus órgãos cadastrados aparecerão aqui.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="secure-note"><ShieldCheck size={17} /><span><strong>Ambiente protegido</strong><small>Dados conectados ao Supabase</small></span></div>
          <button className="nav-item logout" onClick={signOut}><LogOut size={18} /> Sair do sistema</button>
        </div>
      </aside>
      {mobileNav && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-title"><button className="icon-btn menu-toggle" onClick={() => setMobileNav(true)} aria-label="Abrir menu"><Menu size={20} /></button><div><span className="eyebrow">DCP / {activeOrg ? 'ÓRGÃO' : 'PAINEL'}</span><h1>{activeOrg ? (activeOrg.short_name || activeOrg.name) : 'Visão geral'}</h1></div></div>
          <div className="topbar-actions"><span className="today"><CalendarDays size={16} /> {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date())}</span><div className="user-chip">{session.user.email?.slice(0, 1).toUpperCase()}<span>{session.user.email}</span></div></div>
        </header>
        <div className="page-content">
          {activeOrg ? (
            <>
              <div className="page-heading"><div><span className="eyebrow">ÁREA DO ÓRGÃO</span><h2>{activeOrg.name}</h2><p>Empenhos, lançamentos e histórico deste órgão serão organizados nesta área.</p></div><button className="primary-btn" onClick={() => alert('O cadastro de empenhos será habilitado na próxima etapa de implementação.')}><Plus size={17} /> Novo empenho</button></div>
              <div className="org-details-strip"><div><span>Nome de exibição</span><strong>{activeOrg.short_name || '—'}</strong></div><div><span>Esfera</span><strong>{activeOrg.government_level || 'Não informada'}</strong></div><div><span>Status</span><strong className="status-active">Ativo</strong></div></div>
              <div className="empty-state large"><div className="empty-icon"><FileText size={25} /></div><h3>Vamos começar pelos empenhos</h3><p>Esta área é exclusiva de {activeOrg.short_name || activeOrg.name}. Os saldos e pagamentos serão calculados individualmente por empenho.</p><button className="secondary-btn" onClick={() => alert('O cadastro de empenhos será implementado na próxima etapa.')}>Preparar primeiro empenho <ChevronRight size={16} /></button></div>
            </>
          ) : (
            <>
              <div className="welcome-row"><div><span className="eyebrow">ACOMPANHAMENTO FINANCEIRO</span><h2>Olá, vamos organizar a operação.</h2><p>Uma visão central dos órgãos, empenhos e pagamentos da DCP.</p></div><button className="primary-btn" onClick={() => setShowOrgForm(true)}><Plus size={17} /> Cadastrar órgão</button></div>
              <div className="stats-grid">
                <Stat icon={<Building2 size={19} />} label="Órgãos cadastrados" value={String(orgs.length).padStart(2, '0')} note="Áreas de controle independentes" />
                <Stat icon={<Wallet size={19} />} label="Empenhos ativos" value="—" note="Disponível após cadastrar empenhos" />
                <Stat icon={<CircleDollarSign size={19} />} label="Saldo operacional" value="—" note="Calculado por empenho" />
                <Stat icon={<Activity size={19} />} label="Pagamentos no mês" value="—" note="Solicitações e pagamentos confirmados" />
              </div>
              <section className="section-card">
                <div className="section-head"><div><h3>Órgãos e batalhões</h3><p>Entre na área de cada órgão para acompanhar sua movimentação.</p></div><span className="count-pill">{orgs.length} cadastrados</span></div>
                <div className="search-row"><div className="search-box"><Search size={17} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar órgão por nome ou sigla…" /></div><button className="secondary-btn" onClick={() => setShowOrgForm(true)}><Plus size={16} /> Novo órgão</button></div>
                {loadError && <div className="alert error">{loadError} — confira se a migração SQL já foi aplicada no Supabase.</div>}
                {loadingOrgs ? <div className="inline-loading"><div className="spinner" /> Carregando órgãos…</div> : filteredOrgs.length ? (
                  <div className="org-grid">{filteredOrgs.map(org => <button className="org-card" key={org.id} onClick={() => setActiveOrg(org)}><div className="org-card-top"><span className="org-avatar big">{(org.short_name || org.name).slice(0, 2).toUpperCase()}</span><span className="active-dot">Ativo</span></div><h4>{org.short_name || org.name}</h4><p>{org.name}</p><div className="org-card-foot"><span>{org.government_level || 'Esfera não informada'}</span><ChevronRight size={17} /></div></button>)}</div>
                ) : (
                  <div className="empty-state"><div className="empty-icon"><Building2 size={24} /></div><h3>{search ? 'Nenhum órgão encontrado' : 'Cadastre seu primeiro órgão'}</h3><p>{search ? 'Tente buscar por outra sigla ou nome.' : 'Comece cadastrando o 6º, 8º e 9º BEC. Cada cadastro cria sua própria área de controle.'}</p>{!search && <button className="primary-btn" onClick={() => setShowOrgForm(true)}><Plus size={17} /> Cadastrar primeiro órgão</button>}</div>
                )}
              </section>
              <div className="bottom-hint"><ShieldCheck size={17} /><span><strong>Controle individual por empenho</strong> — cada lançamento será vinculado ao órgão e ao empenho correspondente. Mudanças futuras de percentual não reescrevem o histórico anterior.</span></div>
            </>
          )}
        </div>
        <footer className="footer"><span>DCP • Controle de Empresas</span><span>Primeira versão · {new Date().getFullYear()}</span></footer>
      </main>
      {showOrgForm && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowOrgForm(false); }}><form className="modal-card" onSubmit={createOrganization}><div className="modal-head"><div><span className="eyebrow">CADASTRO</span><h2>Novo órgão público</h2><p>A área exclusiva do órgão será criada automaticamente.</p></div><button type="button" className="icon-btn" onClick={() => setShowOrgForm(false)} aria-label="Fechar"><X size={19} /></button></div><label>Nome oficial do órgão<input value={orgName} onChange={e => setOrgName(e.target.value)} required maxLength={180} placeholder="Ex.: 8º Batalhão de Engenharia de Construção" /></label><label>Sigla ou nome curto<input value={orgShortName} onChange={e => setOrgShortName(e.target.value)} maxLength={60} placeholder="Ex.: 8º BEC" /></label><label>Esfera de governo<select value={orgLevel} onChange={e => setOrgLevel(e.target.value)}><option>Federal</option><option>Estadual</option><option>Municipal</option><option>Outro</option></select></label>{orgError && <div className="alert error">{orgError}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={() => setShowOrgForm(false)}>Cancelar</button><button className="primary-btn" disabled={orgSaving}>{orgSaving ? 'Salvando…' : 'Salvar órgão'}</button></div></form></div>}
    </div>
  );
}

function Stat({ icon, label, value, note }) {
  return <div className="stat-card"><div className="stat-icon">{icon}</div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-note">{note}</span></div>;
}
