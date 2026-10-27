import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Building2, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign,
  Clock3, FileText, LayoutDashboard, LogOut, Menu, Paperclip, Plus, RefreshCw,
  Search, ShieldCheck, Wallet, X, Upload
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
        <div className="login-logo-wrap"><img className="dcp-logo dcp-logo-login" src="/dcp-logo.png" alt="DCP Comércio" /></div>
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
        <div className="login-logo-wrap"><img className="dcp-logo dcp-logo-login" src="/dcp-logo.png" alt="DCP Comércio" /></div>
        <span className="eyebrow">CONFIGURAÇÃO INICIAL</span>
        <h1>O DCP está pronto para receber a conexão.</h1>
        <p>A conexão padrão com o projeto Supabase já está definida. Publique a versão mais recente para habilitar o login e os dados reais.</p>
        <div className="env-list">
          <code>VITE_SUPABASE_URL</code>
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>
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
  const [overviewStats, setOverviewStats] = useState({ empenhos: 0, original: 0, balance: 0, paidMonth: 0, profit: 0 });
  const [overviewLoading, setOverviewLoading] = useState(false);
  const isAdmin = session?.user?.app_metadata?.role === 'admin' || session?.user?.user_metadata?.role === 'admin' || session?.user?.app_metadata?.is_admin === true || session?.user?.user_metadata?.is_admin === true;

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

  const loadOverview = useCallback(async () => {
    if (!supabase || !session) return;
    setOverviewLoading(true);
    const [balanceResult, entryResult] = await Promise.all([
      supabase.from('empenho_balances').select('empenho_id,organization_id,original_amount,operational_balance,confirmed_paid_amount,pending_amount'),
      supabase.from('payment_entries').select('empenho_id,request_date,paid_date,status,paid_amount,entry_type,order_amount,invoice_amount,percentage_amount_snapshot')
    ]);
    if (!balanceResult.error) {
      const rows = balanceResult.data || [];
      const activeIds = new Set(orgs.map(org => org.id));
      const scoped = rows.filter(row => activeIds.has(row.organization_id));
      const original = scoped.reduce((sum, row) => sum + Number(row.original_amount || 0), 0);
      const balance = scoped.reduce((sum, row) => sum + Number(row.operational_balance || 0), 0);
      const empenhos = new Set(scoped.map(row => row.empenho_id)).size;
      const month = new Date().toISOString().slice(0, 7);
      const empenhoIds = new Set(scoped.map(row => row.empenho_id));
      const entries = (entryResult.data || []).filter(row => empenhoIds.has(row.empenho_id));
      const paidMonth = entries.filter(row => row.status === 'pago' && (row.paid_date || row.request_date || '').slice(0, 7) === month)
        .reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
      const orders = entries.filter(row => row.entry_type === 'pedido');
      const profit = orders.reduce((sum, row) => sum + Number(row.percentage_amount_snapshot ?? (Number(row.invoice_amount || 0) - Number(row.order_amount || 0))), 0);
      setOverviewStats({ empenhos, original, balance, paidMonth, profit });
    }
    setOverviewLoading(false);
  }, [session, orgs]);

  useEffect(() => { loadOverview(); }, [loadOverview]);

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
          <img className="dcp-logo dcp-logo-sidebar" src="/dcp-logo.png" alt="DCP Comércio" />
          <div className="sidebar-brand-copy"><strong>DCP</strong><span>CONTROLE DE EMPRESAS</span></div>
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
              <OrgDetail key={activeOrg.id} organization={activeOrg} />
            </>
          ) : (
            <>
              <div className="welcome-row"><div><span className="eyebrow">ACOMPANHAMENTO FINANCEIRO</span><h2>Olá, vamos organizar a operação.</h2><p>Uma visão central dos órgãos, empenhos e pagamentos da DCP.</p></div><button className="primary-btn" onClick={() => setShowOrgForm(true)}><Plus size={17} /> Cadastrar órgão</button></div>
              <div className="stats-grid">
                <Stat icon={<Building2 size={19} />} label="Órgãos cadastrados" value={String(orgs.length).padStart(2, '0')} note="Áreas de controle independentes" />
                <Stat icon={<Wallet size={19} />} label="Empenhos registrados" value={overviewLoading ? "…" : String(overviewStats.empenhos).padStart(2, "0")} note="Soma dos órgãos cadastrados" />
                <Stat icon={<CircleDollarSign size={19} />} label="Valor total dos empenhos" value={overviewLoading ? "…" : money(overviewStats.original)} note="Valor original consolidado" />
                <Stat icon={<Activity size={19} />} label="Pagamentos no mês" value={overviewLoading ? "…" : money(overviewStats.paidMonth)} note="Pagamentos com status confirmado" />
                {isAdmin && <Stat icon={<CircleDollarSign size={19} />} label="Lucro sobre o total" value={overviewLoading ? "…" : money(overviewStats.profit > 0 ? overviewStats.profit : overviewStats.original * 0.2)} note={overviewStats.profit > 0 ? "Lucro calculado nos pedidos lançados" : "Estimativa de 20% sobre o valor total"} />}
                <Stat icon={<Wallet size={19} />} label="Saldo operacional" value={overviewLoading ? "…" : money(overviewStats.balance)} note="Saldo operacional consolidado" />
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


function OrgDetail({ organization }) {
  const [balances, setBalances] = useState([]);
  const [archivedIds, setArchivedIds] = useState(new Set());
  const [archiveTab, setArchiveTab] = useState('ativos');
  const [itemBalances, setItemBalances] = useState([]);
  const [entries, setEntries] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [showEmpenhoForm, setShowEmpenhoForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [selectedEmpenho, setSelectedEmpenho] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [number, setNumber] = useState('');
  const [description, setDescription] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [itemDrafts, setItemDrafts] = useState([{ description: '', amount: '', discount: '0', itemNumber: '', purchaseCode: '', quantity: '', unit: '', unitPrice: '' }]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [percentage, setPercentage] = useState('20');
  const [calculationBase, setCalculationBase] = useState('valor_empenho');
  const [deductionMode, setDeductionMode] = useState('valor_integral');
  const [balancePolicy, setBalancePolicy] = useState('recalcular_limite_com_taxa_vigente');
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0,10));
  const [paymentDescription, setPaymentDescription] = useState('');
  const [requestAmount, setRequestAmount] = useState('');
  const [entryType, setEntryType] = useState('pedido');
  const [markupPercentage, setMarkupPercentage] = useState('20');
  const [relatedOrderId, setRelatedOrderId] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0,7));
  const [editingEmpenhoId, setEditingEmpenhoId] = useState(null);
  const [expandedEmpenhos, setExpandedEmpenhos] = useState(new Set());

  const loadData = useCallback(async () => {
    setBusy(true); setError('');
    const [balanceResult, itemResult, entryResult, archiveResult] = await Promise.all([
      supabase.from('empenho_balances').select('*').eq('organization_id', organization.id).order('number'),
      supabase.from('empenho_item_balances').select('*').eq('organization_id', organization.id).order('empenho_number').order('item_description'),
      supabase.from('payment_entries').select('id,empenho_id,empenho_item_id,request_date,paid_date,description,requested_amount,status,paid_amount,percentage_snapshot,percentage_amount_snapshot,balance_deduction_snapshot,entry_type,order_amount,markup_percentage,invoice_amount,related_order_id,created_at,payment_attachments(id,original_filename,storage_path)').order('request_date', { ascending: false }),
      supabase.from('empenhos').select('id,archived_at').eq('organization_id', organization.id)
    ]);
    if (balanceResult.error) setError(balanceResult.error.message);
    else setBalances(balanceResult.data || []);
    if (archiveResult.error) setError(current => current ? current + ' | ' + archiveResult.error.message : archiveResult.error.message);
    else setArchivedIds(new Set((archiveResult.data || []).filter(x => x.archived_at).map(x => x.id)));
    if (itemResult.error) setError(current => current ? current + ' | ' + itemResult.error.message : itemResult.error.message);
    else setItemBalances(itemResult.data || []);
    if (entryResult.error) setError(current => current ? current + ' | ' + entryResult.error.message : entryResult.error.message);
    else {
      const ids = new Set((balanceResult.data || []).map(x => x.empenho_id));
      setEntries((entryResult.data || []).filter(x => ids.has(x.empenho_id)));
    }
    setBusy(false);
  }, [organization.id]);

  useEffect(() => { loadData(); }, [loadData]);

  async function createEmpenho(event) {
    event.preventDefault(); setSaving(true); setFormError(''); setFormMessage('');
    const normalizedItems = itemDrafts.map(i => ({ description: i.description.trim(), amount: Number(i.amount), discount: Number(i.discount || 0), itemNumber: i.itemNumber.trim(), purchaseCode: i.purchaseCode.trim(), quantity: i.quantity === '' ? null : Number(i.quantity), unit: i.unit.trim(), unitPrice: i.unitPrice === '' ? null : Number(i.unitPrice) }));
    if (!normalizedItems.length || normalizedItems.some(i => !i.description || !Number.isFinite(i.amount) || i.amount <= 0 || !Number.isFinite(i.discount) || i.discount < 0 || i.discount > 100 || (i.quantity !== null && (!Number.isFinite(i.quantity) || i.quantity <= 0)) || (i.unitPrice !== null && (!Number.isFinite(i.unitPrice) || i.unitPrice < 0)))) {
      setFormError('Informe descrição, valor positivo e desconto entre 0% e 100%. Quantidade e preço unitário, quando preenchidos, também devem ser válidos.'); setSaving(false); return;
    }
    const amount = Math.round((normalizedItems.reduce((sum, i) => sum + i.amount, 0) + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) { setFormError('A soma dos itens precisa ser maior que zero.'); setSaving(false); return; }
    const { data: existingEmpenho, error: duplicateCheckError } = await supabase.from('empenhos').select('id').eq('organization_id', organization.id).eq('number', number.trim()).maybeSingle();
    if (duplicateCheckError) { setFormError('Não foi possível verificar se o número do empenho já existe: ' + duplicateCheckError.message); setSaving(false); return; }
    if (existingEmpenho) { setFormError('Este número de empenho já está cadastrado neste órgão. O registro existente foi preservado; atualize a lista e use Alterar ou cadastre os itens nele, sem criar outro empenho.'); setSaving(false); await loadData(); return; }
    const { error: rpcError } = await supabase.rpc('create_empenho_with_rule', {
      p_organization_id: organization.id,
      p_number: number.trim(),
      p_description: description.trim(),
      p_original_amount: amount,
      p_percentage: 20,
      p_calculation_base: 'valor_pedido',
      p_deduction_mode: 'valor_integral',
      p_issued_on: issuedOn || null,
      p_reason: 'Regra inicial do empenho',
      p_current_balance_policy: 'preservar_limite_original'
    });
    if (rpcError) setFormError('Não foi possível salvar o empenho. Confirme se as migrações SQL foram aplicadas. Detalhe: ' + rpcError.message);
    else {
      const { data: created, error: findError } = await supabase.from('empenhos').select('id').eq('organization_id', organization.id).eq('number', number.trim()).single();
      if (findError || !created) setFormError('Empenho criado, mas não foi possível localizar o registro para cadastrar os itens: ' + (findError?.message || 'registro não encontrado'));
      else {
        const { error: itemsError } = await supabase.from('empenho_items').insert(normalizedItems.map((i, index) => ({ empenho_id: created.id, description: i.description, original_amount: i.amount, discount_percentage: i.discount, item_number: i.itemNumber || null, purchase_code: i.purchaseCode || null, quantity: i.quantity, unit: i.unit || null, unit_price: i.unitPrice, sort_order: index })));
        if (itemsError) setFormError('Empenho criado, mas os itens não foram salvos. Confira se a migração 009 foi executada. Detalhe: ' + itemsError.message);
        else {
          setShowEmpenhoForm(false); setNumber(''); setDescription(''); setOriginalAmount(''); setItemDrafts([{ description: '', amount: '', discount: '0', itemNumber: '', purchaseCode: '', quantity: '', unit: '', unitPrice: '' }]); setIssuedOn(''); setPercentage('20'); setCalculationBase('valor_empenho'); setDeductionMode('valor_integral'); setBalancePolicy('recalcular_limite_com_taxa_vigente');
          setFormMessage('Empenho e itens cadastrados. O saldo total será a soma dos saldos operacionais dos itens.'); await loadData();
        }
      }
    }
    setSaving(false);
  }

  async function saveRuleChange(event) {
    event.preventDefault();
    if (!selectedEmpenho) return;
    setSaving(true); setFormError(''); setFormMessage('');
    const pct = Number(percentage);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setFormError('O percentual deve estar entre 0 e 100.'); setSaving(false); return;
    }
    const { error: ruleError } = await supabase.rpc('change_empenho_rule', {
      p_empenho_id: selectedEmpenho.empenho_id,
      p_percentage: pct,
      p_calculation_base: calculationBase,
      p_deduction_mode: deductionMode,
      p_effective_from: new Date().toISOString(),
      p_reason: 'Alteração registrada pela interface do DCP'
    });
    if (ruleError) setFormError('Não foi possível alterar a regra. Confirme se as migrações SQL foram aplicadas. Detalhe: ' + ruleError.message);
    else {
      setShowRuleForm(false);
      setFormMessage('Nova regra registrada. Os lançamentos anteriores mantêm os parâmetros originais.');
      await loadData();
    }
    setSaving(false);
  }

  function openEntryForm(item, itemId = '') {
    const parent = balances.find(b => b.empenho_id === item.empenho_id) || item;
    setSelectedEmpenho(parent);
    setEntryType('pedido');
    setRequestAmount('');
    setPaymentDescription('');
    setMarkupPercentage('20');
    setRelatedOrderId('');
    setSelectedItemId(itemId || itemBalances.find(i => i.empenho_id === parent.empenho_id)?.empenho_item_id || '');
    setAttachment(null);
    setFormError('');
    setShowPaymentForm(true);
  }

  async function createPayment(event) {
    event.preventDefault(); setSaving(true); setFormError(''); setFormMessage('');
    const enteredAmount = Number(requestAmount);
    const markup = Number(markupPercentage);
    if (!selectedEmpenho || !selectedItemId || !Number.isFinite(enteredAmount) || enteredAmount <= 0 || !paymentDescription.trim()) {
      setFormError('Selecione um empenho, preencha a descrição e informe um valor válido.'); setSaving(false); return;
    }
    if (entryType === 'pedido' && (!Number.isFinite(markup) || markup < 0 || markup > 100)) {
      setFormError('Informe um percentual entre 0 e 100.'); setSaving(false); return;
    }
    if (entryType === 'pagamento' && relatedOrderId && !entries.some(e => e.id === relatedOrderId && e.entry_type === 'pedido')) {
      setFormError('Selecione um pedido válido para vincular este pagamento.'); setSaving(false); return;
    }
    if (attachment && !['application/pdf','image/jpeg','image/png','image/webp'].includes(attachment.type)) {
      setFormError('Anexe apenas PDF, JPG, PNG ou WEBP.'); setSaving(false); return;
    }
    if (attachment && attachment.size > 10 * 1024 * 1024) {
      setFormError('O arquivo deve ter no máximo 10 MB.'); setSaving(false); return;
    }

    const invoiceAmount = entryType === 'pedido'
      ? Math.round((enteredAmount * (1 + markup / 100) + Number.EPSILON) * 100) / 100
      : enteredAmount;
    const linkedOrder = entryType === 'pagamento' && relatedOrderId
      ? entries.find(e => e.id === relatedOrderId) : null;
    const deduction = entryType === 'pedido' ? invoiceAmount : (linkedOrder ? 0 : enteredAmount);
    const { data: payment, error: insertError } = await supabase.from('payment_entries').insert({
      empenho_id: selectedEmpenho.empenho_id,
      empenho_item_id: selectedItemId,
      request_date: requestDate,
      paid_date: entryType === 'pagamento' ? requestDate : null,
      description: paymentDescription.trim(),
      requested_amount: invoiceAmount,
      status: entryType === 'pagamento' ? 'pago' : 'solicitado',
      entry_type: entryType,
      order_amount: entryType === 'pedido' ? enteredAmount : null,
      markup_percentage: entryType === 'pedido' ? markup : 0,
      invoice_amount: invoiceAmount,
      related_order_id: linkedOrder?.id || null,
      rule_id: selectedEmpenho.rule_id,
      percentage_snapshot: entryType === 'pedido' ? markup : 0,
      calculation_base_snapshot: 'valor_pedido',
      deduction_mode_snapshot: 'valor_integral',
      percentage_amount_snapshot: entryType === 'pedido' ? invoiceAmount - enteredAmount : 0,
      balance_deduction_snapshot: deduction,
      calculation_base_amount_snapshot: enteredAmount,
      paid_amount: entryType === 'pagamento' ? enteredAmount : 0
    }).select('id').single();
    if (insertError) {
      setFormError('Não foi possível registrar o lançamento: ' + insertError.message); setSaving(false); return;
    }
    let uploadError = '';
    if (attachment) {
      const safeName = attachment.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = organization.id + '/' + selectedEmpenho.empenho_id + '/' + payment.id + '/' + crypto.randomUUID() + '-' + safeName;
      const { error: storageError } = await supabase.storage.from('dcp-payment-attachments').upload(path, attachment, { contentType: attachment.type, upsert: false });
      if (storageError) uploadError = storageError.message;
      else {
        const { error: metadataError } = await supabase.from('payment_attachments').insert({
          payment_entry_id: payment.id, storage_path: path, original_filename: attachment.name,
          content_type: attachment.type, size_bytes: attachment.size
        });
        if (metadataError) uploadError = metadataError.message;
      }
    }
    setShowPaymentForm(false); setPaymentDescription(''); setRequestAmount(''); setAttachment(null);
    setEntryType('pedido'); setMarkupPercentage('20'); setRelatedOrderId('');
    setFormMessage(uploadError ? 'Lançamento registrado, mas houve erro no anexo: ' + uploadError :
      entryType === 'pedido'
        ? 'Pedido registrado. Valor do pedido + percentual calculado e comprometido no saldo do empenho.'
        : linkedOrder
          ? 'Pagamento registrado e vinculado ao pedido; não houve segundo abatimento do empenho.'
          : 'Pagamento registrado e abatido do saldo do empenho.');
    await loadData(); setSaving(false);
  }

  async function editEmpenho(item) {
    const nextNumber = window.prompt('Número do empenho:', item.number);
    if (nextNumber === null) return;
    const nextDescription = window.prompt('Descrição do empenho:', item.description || '');
    if (nextDescription === null) return;
    if (!nextNumber.trim() || !nextDescription.trim()) { setError('Número e descrição do empenho são obrigatórios.'); return; }
    const { error: updateError } = await supabase.from('empenhos').update({ number: nextNumber.trim(), description: nextDescription.trim() }).eq('id', item.empenho_id);
    if (updateError) setError('Não foi possível alterar o empenho: ' + updateError.message);
    else { setFormMessage('Dados do empenho atualizados. Os lançamentos e o histórico financeiro foram preservados.'); await loadData(); }
  }

  async function deleteEmpenho(item) {
    const confirmation = window.prompt(
      'Digite EXCLUIR para apagar definitivamente o empenho ' + item.number +
      '. Se houver qualquer lançamento financeiro vinculado, a exclusão será bloqueada para preservar o histórico.'
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== 'EXCLUIR') {
      setError('Exclusão cancelada: o texto digitado precisa ser exatamente EXCLUIR.');
      return;
    }

    setError('');
    setFormMessage('');
    setSaving(true);
    try {
      // Preflight: identify the common reason why one empenho can be deleted
      // while another cannot. Any financial entry, including cancelled entries,
      // is retained as audit history and blocks physical deletion.
      const { data: linkedEntries, error: entriesCheckError } = await supabase
        .from('payment_entries')
        .select('id,status,entry_type,description')
        .eq('empenho_id', item.empenho_id)
        .limit(1);

      if (entriesCheckError) {
        throw new Error(
          'Não foi possível verificar os lançamentos vinculados a este empenho: ' +
          entriesCheckError.message + '. Nenhum registro foi excluído.'
        );
      }
      if (linkedEntries && linkedEntries.length > 0) {
        throw new Error(
          'Este empenho não pode ser excluído porque possui lançamento financeiro vinculado' +
          (linkedEntries[0].description ? ': "' + linkedEntries[0].description + '"' : '') +
          '. Para preservar a auditoria, use Inativar ou Arquivar. Nenhum dado foi apagado.'
        );
      }

      const { data: result, error: rpcError } = await supabase.rpc('delete_empenho_safely', {
        p_empenho_id: item.empenho_id
      });
      if (rpcError) {
        throw new Error(
          'O Supabase recusou a exclusão (' + (rpcError.code || 'sem código') + '): ' + rpcError.message +
          '. Se o erro mencionar regras históricas, aplique a migração 202610270003_fix_safe_empenho_delete.sql no SQL Editor do Supabase.'
        );
      }
      if (result?.success !== true) {
        throw new Error(result?.message || 'O banco não confirmou a exclusão.');
      }

      const { data: verification, error: verificationError } = await supabase
        .from('empenhos').select('id').eq('id', item.empenho_id).maybeSingle();
      if (verificationError) {
        throw new Error('A operação retornou sucesso, mas não foi possível confirmar no banco: ' + verificationError.message);
      }
      if (verification) {
        throw new Error('O empenho ainda existe no banco. A exclusão não foi concluída; verifique as dependências no Supabase.');
      }

      setFormMessage('Exclusão confirmada: o empenho não existe mais no banco.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha inesperada ao excluir o empenho.');
      await loadData();
    } finally {
      setSaving(false);
    }
  }

  async function archiveEmpenho(item) {
    const archived = archivedIds.has(item.empenho_id);
    if (!window.confirm(archived ? 'Restaurar o empenho ' + item.number + ' para os ativos?' : 'Arquivar o empenho ' + item.number + '? O histórico será preservado.')) return;
    setSaving(true); setError(''); setFormMessage('');
    const { error: updateError } = await supabase.from('empenhos').update({ archived_at: archived ? null : new Date().toISOString() }).eq('id', item.empenho_id).eq('organization_id', organization.id);
    if (updateError) setError('Falha ao ' + (archived ? 'restaurar' : 'arquivar') + ': ' + updateError.message + '. Aplique a migração de arquivamento no Supabase.');
    else { setFormMessage(archived ? 'Empenho restaurado aos ativos.' : 'Empenho arquivado; histórico preservado.'); setArchiveTab(archived ? 'ativos' : 'arquivo'); await loadData(); }
    setSaving(false);
  }

  async function cancelEmpenho(item) {
    const reason = window.prompt('Informe o motivo para inativar este empenho. Ele não será apagado para preservar o histórico:');
    if (reason === null) return;
    if (!reason.trim()) { setError('Informe o motivo da inativação.'); return; }
    const { error: updateError } = await supabase.from('empenhos').update({ is_active: false, notes: reason.trim() }).eq('id', item.empenho_id);
    if (updateError) setError('Não foi possível inativar o empenho: ' + updateError.message);
    else { setFormMessage('Empenho inativado sem apagar o histórico. Confira eventuais notas fiscais emitidas e regularize-as fora do sistema, se necessário.'); await loadData(); }
  }

  async function editEntry(entry) {
    const date = window.prompt('Data do lançamento (AAAA-MM-DD):', entry.request_date || '');
    if (date === null) return;
    const description = window.prompt('Descrição do lançamento:', entry.description || '');
    if (description === null) return;
    const amountText = window.prompt(entry.entry_type === 'pedido' ? 'Valor original do pedido (R$):' : 'Valor pago (R$):', String(entry.entry_type === 'pedido' ? entry.order_amount ?? entry.requested_amount : entry.paid_amount ?? entry.requested_amount));
    if (amountText === null) return;
    const amount = Number(amountText.replace(',', '.'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !description.trim() || !Number.isFinite(amount) || amount <= 0) { setError('Data, descrição ou valor inválido.'); return; }
    if (entry.entry_type === 'pedido' && !window.confirm('ATENÇÃO: se uma NF-e já foi emitida, alterar o valor no DCP NÃO cancela nem corrige a nota fiscal. Confirme que você verificou a situação fiscal antes de continuar.')) return;
    const invoiceAmount = entry.entry_type === 'pedido' ? Math.round((amount * (1 + Number(entry.markup_percentage || 0) / 100) + Number.EPSILON) * 100) / 100 : amount;
    const patch = { request_date: date, description: description.trim(), requested_amount: invoiceAmount };
    if (entry.entry_type === 'pedido') {
      patch.order_amount = amount; patch.invoice_amount = invoiceAmount;
      patch.percentage_amount_snapshot = Math.round((invoiceAmount - amount + Number.EPSILON) * 100) / 100;
      patch.balance_deduction_snapshot = invoiceAmount;
    } else {
      patch.paid_amount = amount;
      if (!entry.related_order_id) patch.balance_deduction_snapshot = amount;
      if (entry.status === 'pago') patch.paid_date = date;
    }
    const { error: updateError } = await supabase.from('payment_entries').update(patch).eq('id', entry.id);
    if (updateError) setError('Não foi possível alterar o lançamento: ' + updateError.message);
    else { setFormMessage('Lançamento alterado e registrado na auditoria. Se houver NF-e emitida, faça a regularização fiscal correspondente fora do DCP.'); await loadData(); }
  }

  async function deleteEntry(entry) {
    const label = entry.description || (entry.entry_type === 'pedido' ? 'Pedido' : 'Pagamento');
    if (entry.related_order_id) {
      setError('Este pagamento está vinculado a outro pedido. Exclua primeiro o pagamento dependente.');
      return;
    }
    if (entries.some(candidate => candidate.related_order_id === entry.id)) {
      setError('Este lançamento possui pagamentos vinculados. Exclua primeiro os pagamentos dependentes.');
      return;
    }
    const confirmation = window.prompt(
      'Excluir definitivamente o lançamento "' + label + '"? Os anexos vinculados também serão removidos.\n\nDigite EXCLUIR para confirmar.'
    );
    if (confirmation === null) return;
    if (confirmation.trim() !== 'EXCLUIR') {
      setError('Exclusão cancelada. Digite exatamente EXCLUIR para confirmar.');
      return;
    }
    setSaving(true); setError(''); setFormMessage('');
    try {
      const attachments = entry.payment_attachments || [];
      const paths = attachments.map(file => file.storage_path).filter(Boolean);
      const { data: result, error: deleteError } = await supabase.rpc('delete_payment_entry_safely', {
        p_payment_entry_id: entry.id
      });
      if (deleteError) throw new Error('O Supabase recusou a exclusão do lançamento: ' + deleteError.message + '. Confira se a migração 202610270004_delete_payment_entry_safely.sql foi aplicada.');
      if (result?.success !== true) throw new Error(result?.message || 'O banco não confirmou a exclusão do lançamento.');
      // Remove physical files only after the database confirms the audited delete.
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from('dcp-payment-attachments').remove(paths);
        if (storageError) {
          setFormMessage('Lançamento excluído e auditoria preservada, mas alguns arquivos anexos precisam de limpeza no Storage: ' + storageError.message);
        }
      }
      const { data: remaining, error: verifyError } = await supabase
        .from('payment_entries').select('id').eq('id', entry.id).maybeSingle();
      if (verifyError) throw new Error('Não foi possível confirmar a exclusão: ' + verifyError.message);
      if (remaining) throw new Error('O lançamento ainda existe no banco. Verifique as permissões e a migração SQL.');
      setFormMessage('Lançamento excluído. A auditoria da operação foi preservada.');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao excluir o lançamento.');
      await loadData();
    } finally { setSaving(false); }
  }

  async function cancelEntry(entry) {
    const reason = window.prompt('Motivo do cancelamento/inativação (o registro ficará no histórico):');
    if (reason === null) return;
    if (!reason.trim()) { setError('Informe o motivo do cancelamento.'); return; }
    if (entry.entry_type === 'pedido' && !window.confirm('Se a NF-e já foi emitida, o cancelamento no DCP não cancela a nota fiscal. Você deverá regularizá-la no sistema fiscal competente. Deseja prosseguir com o cancelamento apenas no DCP?')) return;
    const { error: updateError } = await supabase.from('payment_entries').update({ status: 'cancelado', notes: reason.trim() }).eq('id', entry.id);
    if (updateError) setError('Não foi possível cancelar o lançamento: ' + updateError.message);
    else { setFormMessage('Lançamento cancelado no DCP; o registro e a auditoria foram preservados.'); await loadData(); }
  }

  async function confirmPaid(entry) {
    if (!window.confirm('Confirmar que este pagamento foi efetivamente realizado? O saldo será atualizado.')) return;
    const { error: updateError } = await supabase.rpc('confirm_payment', { p_payment_entry_id: entry.id });
    if (updateError) setError(updateError.message);
    else { setFormMessage('Pagamento confirmado e histórico preservado.'); await loadData(); }
  }

  async function openAttachment(item) {
    const { data, error: urlError } = await supabase.storage.from('dcp-payment-attachments').createSignedUrl(item.storage_path, 60);
    if (urlError) setError(urlError.message);
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const selectedItemBalance = itemBalances.find(i => i.empenho_item_id === selectedItemId && i.empenho_id === selectedEmpenho?.empenho_id);
  const totalOriginal = balances.reduce((sum, item) => sum + Number(item.original_amount || 0), 0);
  const totalBalance = balances.reduce((sum, item) => sum + Number(item.operational_balance || 0), 0);
  const totalPaid = balances.reduce((sum, item) => sum + Number(item.confirmed_paid_amount || 0), 0);
  const totalPending = balances.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0);
  const visibleBalances = balances.filter(item => archiveTab === 'arquivo' ? archivedIds.has(item.empenho_id) : !archivedIds.has(item.empenho_id));
  const filteredEntries = entries.filter(entry => !monthFilter || entry.request_date?.slice(0,7) === monthFilter);

  return <>
    <div className="page-heading"><div><span className="eyebrow">ÁREA DO ÓRGÃO</span><h2>{organization.name}</h2><p>Empenhos, solicitações, pagamentos e documentos deste órgão.</p></div><button className="primary-btn" onClick={() => { setFormError(''); setShowEmpenhoForm(true); }}><Plus size={17}/> Novo empenho</button></div>
    <div className="org-details-strip"><div><span>Nome de exibição</span><strong>{organization.short_name || '—'}</strong></div><div><span>Esfera</span><strong>{organization.government_level || 'Não informada'}</strong></div><div><span>Status</span><strong className="status-active">Ativo</strong></div></div>
    {formMessage && <div className="alert success">{formMessage}</div>}
    {error && <div className="alert error">{error} <button className="text-button" onClick={loadData}>Tentar novamente</button></div>}
    <div className="stats-grid detail-stats">
      <Stat icon={<FileText size={19}/>} label="Empenhos" value={String(balances.length).padStart(2,'0')} note="Vinculados a este órgão"/>
      <Stat icon={<Wallet size={19}/>} label="Valor original" value={money(totalOriginal)} note="Soma dos empenhos"/>
      <Stat icon={<CircleDollarSign size={19}/>} label="Saldo operacional" value={money(totalBalance)} note="Saldo atual dos empenhos"/>
      <Stat icon={<CheckCircle2 size={19}/>} label="Pagamentos confirmados" value={money(totalPaid)} note={money(totalPending) + ' em solicitações pendentes'}/>
    </div>
    <section className="section-card detail-section">
      <div className="section-head"><div><h3>{archiveTab === 'arquivo' ? 'Arquivo de empenhos' : 'Empenhos ativos'}</h3><p>{archiveTab === 'arquivo' ? 'Consulta dos registros arquivados.' : 'Empenhos em operação neste órgão.'}</p></div><button className="secondary-btn" onClick={loadData}><RefreshCw size={15}/> Atualizar</button></div>
      <div className="history-tools" style={{marginBottom: '18px'}}><button className={archiveTab === 'ativos' ? 'primary-btn' : 'secondary-btn'} onClick={() => setArchiveTab('ativos')}>Ativos ({balances.filter(x => !archivedIds.has(x.empenho_id)).length})</button><button className={archiveTab === 'arquivo' ? 'primary-btn' : 'secondary-btn'} onClick={() => setArchiveTab('arquivo')}>Arquivo ({balances.filter(x => archivedIds.has(x.empenho_id)).length})</button></div>
      {busy ? <div className="inline-loading"><div className="spinner"/> Carregando empenhos…</div> : visibleBalances.length ? <div className="empenho-card-list">{visibleBalances.map(item => {
        const relatedItems = itemBalances.filter(i => i.empenho_id === item.empenho_id);
        const relatedEntries = filteredEntries.filter(entry => entry.empenho_id === item.empenho_id);
        const isExpanded = expandedEmpenhos.has(item.empenho_id);
        return <article className={'empenho-panel ' + (isExpanded ? 'is-expanded' : 'is-compact')} key={item.empenho_id}>
          <header className="empenho-panel-head"><div className="empenho-card-identity"><span className="eyebrow">EMPENHO</span><h3>{item.number}</h3><p>{item.description}</p><span className={'status-pill ' + (item.is_active === false ? 'cancelled' : 'paid')}>{item.is_active === false ? 'Inativo' : 'Ativo'}</span></div>
          <div className="empenho-panel-actions">{archiveTab === 'arquivo' ? <button className="secondary-btn compact" onClick={()=>archiveEmpenho(item)}>Restaurar</button> : <><button className="secondary-btn compact" onClick={()=>openEntryForm(item)} disabled={item.is_active === false}>+ Lançamento</button><button className="secondary-btn compact" onClick={()=>editEmpenho(item)}>Alterar</button><button className="secondary-btn compact" onClick={()=>archiveEmpenho(item)}>Arquivar</button><button className="danger-btn compact" onClick={()=>deleteEmpenho(item)}>Excluir empenho</button></>}</div></header>
          <div className="empenho-metrics"><div><span>Valor total</span><strong>{money(item.original_amount)}</strong></div><div><span>Utilizado</span><strong>{money(item.used_balance)}</strong></div><div><span>Saldo disponível</span><strong>{money(item.operational_balance)}</strong></div><div><span>Pendências</span><strong>{item.pending_count || 0}</strong></div></div>
          <button type="button" className="empenho-details-toggle" aria-expanded={isExpanded} onClick={()=>setExpandedEmpenhos(current=>{const next=new Set(current); if(next.has(item.empenho_id)) next.delete(item.empenho_id); else next.add(item.empenho_id); return next;})}>{isExpanded ? 'Ocultar detalhes' : 'Ver itens e lançamentos'} <ChevronRight size={16}/><span>{relatedItems.length} itens · {relatedEntries.length} lançamentos</span></button>
          {isExpanded && <div className="empenho-expanded-content"><section className="empenho-subsection"><div className="subsection-heading"><h4>Itens deste empenho</h4><span>{relatedItems.length} item(ns)</span></div>
          {relatedItems.length ? <div className="empenho-item-list">{relatedItems.map(i=><div className="empenho-item-card" key={i.empenho_item_id}><div><strong>{i.item_number ? 'Item ' + i.item_number + ' · ' : ''}{i.item_description}</strong><p>{i.purchase_code ? 'Código de compra ' + i.purchase_code + ' · ' : ''}{i.quantity != null ? 'Quantidade: ' + new Intl.NumberFormat('pt-BR',{maximumFractionDigits:4}).format(Number(i.quantity)) + (i.unit ? ' ' + i.unit : '') + ' · ' : ''}{i.unit_price != null ? 'Unitário: ' + money(i.unit_price) + ' · ' : ''}Desconto: {i.discount_percentage}%</p></div><div className="item-values"><span>Total <strong>{money(i.original_amount)}</strong></span><span>Utilizado <strong>{money(i.used_balance)}</strong></span><span>Saldo <strong>{money(i.operational_balance)}</strong></span><button className="secondary-btn compact" onClick={()=>openEntryForm(item,i.empenho_item_id)} disabled={item.is_active === false}>Lançar neste item</button></div></div>)}</div> : <p className="muted">Nenhum item vinculado a este empenho.</p>}
          </section>
          <section className="empenho-subsection"><div className="subsection-heading"><h4>Lançamentos deste empenho</h4><span>{relatedEntries.length} registro(s)</span></div>
          {relatedEntries.length ? <div className="empenho-entry-list">{relatedEntries.map(entry=><div className="empenho-entry-card" key={entry.id}><div className="entry-main"><strong>{entry.description}</strong><p>{new Date(entry.request_date+'T12:00:00').toLocaleDateString('pt-BR')} · {entry.entry_type==='pedido'?'Pedido':'Pagamento'} · {entry.entry_type==='pedido'?'Pedido: '+money(entry.order_amount)+' · NF: '+money(entry.invoice_amount):'Valor: '+money(entry.paid_amount)}</p><small>{relatedItems.find(i=>i.empenho_item_id===entry.empenho_item_id)?.item_description || 'Item não identificado'}{entry.entry_type==='pedido'?' · Acréscimo '+entry.markup_percentage+'%':''}</small>{(entry.payment_attachments||[]).map(a=><button key={a.id} className="file-link" onClick={()=>openAttachment(a)}><Paperclip size={13}/>{a.original_filename}</button>)}</div><div className="entry-actions"><span className={'status-pill '+(entry.status==='cancelado'?'cancelled':entry.status==='pago'?'paid':'pending')}>{entry.status==='cancelado'?'Cancelado':entry.status==='pago'?'Pago':entry.entry_type==='pedido'?'Pedido registrado':'Solicitado'}</span><button className="secondary-btn compact" onClick={()=>editEntry(entry)}>Alterar</button>{entry.status !== 'cancelado' && <button className="secondary-btn compact" onClick={()=>cancelEntry(entry)}>Cancelar</button>}<button className="danger-btn compact" onClick={()=>deleteEntry(entry)} disabled={saving}>Excluir lançamento</button></div></div>)}</div> : <p className="muted">Nenhum lançamento vinculado a este empenho.</p>}
          </section></div>}
        </article>;
      })}</div>  : <div className="empty-state"><div className="empty-icon"><FileText size={24}/></div><h3>{archiveTab === 'arquivo' ? 'Nenhum empenho arquivado' : 'Nenhum empenho ativo'}</h3><p>{archiveTab === 'arquivo' ? 'Os empenhos arquivados aparecerão aqui para consulta.' : 'Cadastre um empenho ou restaure um registro do arquivo.'}</p>{archiveTab === 'ativos' && <button className="primary-btn" onClick={()=>setShowEmpenhoForm(true)}><Plus size={16}/> Cadastrar empenho</button>}</div>}
    </section>
    <section className="section-card detail-section"><div className="section-head"><div><h3>Filtro dos lançamentos</h3><p>O filtro de mês se aplica aos lançamentos dentro de cada empenho.</p></div><div className="history-tools"><label className="month-filter">Mês de referência<input type="month" value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}/></label><span className="count-pill">{filteredEntries.length} registros</span></div></div></section>
    {showEmpenhoForm && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowEmpenhoForm(false);}}><form className="modal-card wide-modal" onSubmit={createEmpenho}><div className="modal-head"><div><span className="eyebrow">NOVO REGISTRO</span><h2>Cadastrar empenho</h2><p>O empenho e sua regra inicial serão salvos juntos.</p></div><button type="button" className="icon-btn" onClick={()=>setShowEmpenhoForm(false)}><X size={19}/></button></div><div className="form-grid"><label>Número do empenho<input value={number} onChange={e=>setNumber(e.target.value)} required maxLength={80} placeholder="Ex.: 2026NE000123"/></label><label>Data do empenho<input type="date" value={issuedOn} onChange={e=>setIssuedOn(e.target.value)}/></label></div><label>Descrição geral do empenho<input value={description} onChange={e=>setDescription(e.target.value)} required maxLength={250} placeholder="Descrição ou objeto geral do empenho"/></label><div className="section-head"><div><h3>Itens do empenho</h3><p>O total é calculado pela soma dos valores dos itens.</p></div><button type="button" className="secondary-btn" onClick={()=>setItemDrafts(v=>[...v,{description:'',amount:'',discount:'0',itemNumber:'',purchaseCode:'',quantity:'',unit:'',unitPrice:''}])}><Plus size={15}/> Adicionar item</button></div>{itemDrafts.map((item,index)=><div className="rule-panel" key={index}><div className="form-grid"><label>Nº do item no empenho<input value={item.itemNumber} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,itemNumber:e.target.value}:x))} placeholder="Ex.: 001" /></label><label>Código do item de compra<input value={item.purchaseCode} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,purchaseCode:e.target.value}:x))} placeholder="Ex.: 00012" /></label></div><label>Descrição oficial do item<input value={item.description} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,description:e.target.value}:x))} required placeholder={`Item ${index+1} — descrição oficial`}/></label><div className="form-grid"><label>Quantidade<input type="number" min="0.0001" step="0.0001" value={item.quantity} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,quantity:e.target.value}:x))} placeholder="Ex.: 59392" /></label><label>Unidade<input value={item.unit} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,unit:e.target.value}:x))} placeholder="Ex.: unidade, conjunto" /></label></div><div className="form-grid"><label>Valor unitário (R$)<input type="number" min="0" step="0.0001" value={item.unitPrice} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,unitPrice:e.target.value}:x))} placeholder="Ex.: 0.1425" /></label><label>Valor total do item (R$)<input type="number" min="0.01" step="0.01" value={item.amount} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,amount:e.target.value}:x))} required placeholder="10000.00"/></label></div><label>Desconto do item (%)<input type="number" min="0" max="100" step="0.01" value={item.discount} onChange={e=>setItemDrafts(v=>v.map((x,i)=>i===index?{...x,discount:e.target.value}:x))} required/></label>{itemDrafts.length>1&&<button type="button" className="text-button" onClick={()=>setItemDrafts(v=>v.filter((_,i)=>i!==index))}>Remover item</button>}</div>)}<div className="rule-summary"><span>Valor total do empenho</span><strong>{money(itemDrafts.reduce((sum,i)=>sum+Number(i.amount||0),0))}</strong><small>O saldo total será a soma dos saldos dos itens, descontando o percentual informado em cada item.</small></div>{formError&&<div className="alert error">{formError}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowEmpenhoForm(false)}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving?'Salvando…':'Salvar empenho'}</button></div></form></div>}
    {showRuleForm && selectedEmpenho && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowRuleForm(false);}}><form className="modal-card wide-modal" onSubmit={saveRuleChange}><div className="modal-head"><div><span className="eyebrow">HISTÓRICO DE REGRAS</span><h2>Alterar regra do empenho</h2><p>Empenho {selectedEmpenho.number}. A regra atual não será sobrescrita.</p></div><button type="button" className="icon-btn" onClick={()=>setShowRuleForm(false)}><X size={19}/></button></div><div className="rule-panel"><label>Percentual (%)<input type="number" min="0" max="100" step="0.01" value={percentage} onChange={e=>setPercentage(e.target.value)} required/></label><label>Base de cálculo<select value={calculationBase} onChange={e=>setCalculationBase(e.target.value)}><option value="valor_empenho">Valor total do empenho</option><option value="valor_pedido">Cada pedido solicitado</option></select></label><label>Abatimento do saldo<select value={deductionMode} onChange={e=>setDeductionMode(e.target.value)}><option value="valor_integral">Valor integral do pedido</option><option value="valor_liquido">Valor líquido após percentual</option></select></label></div><div className="rule-summary"><span>Regra atual</span><strong>{selectedEmpenho.current_percentage}% · {selectedEmpenho.current_calculation_base==='valor_empenho'?'base no empenho':'base no pedido'}</strong><small>A nova regra terá vigência a partir de agora. Os cálculos salvos nos lançamentos anteriores não serão modificados.</small></div>{formError&&<div className="alert error">{formError}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowRuleForm(false)}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving?'Salvando…':'Registrar nova regra'}</button></div></form></div>}
    {showPaymentForm && selectedEmpenho && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowPaymentForm(false);}}><form className="modal-card wide-modal" onSubmit={createPayment}>
      <div className="modal-head"><div><span className="eyebrow">LANÇAMENTO FINANCEIRO</span><h2>Novo lançamento</h2><p>Empenho {selectedEmpenho?.number || 'Selecione um empenho'} · saldo disponível {money(selectedItemBalance?.operational_balance ?? selectedEmpenho?.operational_balance)}</p></div><button type="button" className="icon-btn" onClick={()=>setShowPaymentForm(false)}><X size={19}/></button></div>
      <label>Item do empenho<select value={selectedItemId} onChange={e=>setSelectedItemId(e.target.value)} required><option value="">Selecione o item</option>{itemBalances.filter(i=>i.empenho_id===selectedEmpenho.empenho_id).map(i=><option key={i.empenho_item_id} value={i.empenho_item_id}>{i.item_description} · Saldo {money(i.operational_balance)}</option>)}</select></label>
      <label>Tipo de lançamento<select value={entryType} onChange={e=>{setEntryType(e.target.value);setRequestAmount('');setRelatedOrderId('');}}><option value="pedido">Pedido recebido (calcular NF e comprometer saldo)</option><option value="pagamento">Pagamento realizado (abater valor pago)</option></select></label>
      <div className="form-grid"><label>Data do lançamento<input type="date" value={requestDate} onChange={e=>setRequestDate(e.target.value)} required/></label><label>{entryType==='pedido'?'Valor original do pedido (R$)':'Valor pago (R$)'}<input type="number" min="0.01" step="0.01" value={requestAmount} onChange={e=>setRequestAmount(e.target.value)} required placeholder="1000.00"/></label></div>
      {entryType==='pedido' ? <><label>Acréscimo aplicado (%)<input type="number" min="0" max="100" step="0.01" value={markupPercentage} onChange={e=>setMarkupPercentage(e.target.value)} required/></label><div className="rule-summary"><span>Prévia da nota fiscal</span><strong>{money(Number(requestAmount||0)*(1+Number(markupPercentage||0)/100))}</strong><small>{money(Number(requestAmount||0))} de pedido + {money(Number(requestAmount||0)*Number(markupPercentage||0)/100)} de acréscimo. Esse total será abatido/comprometido no empenho ao registrar o pedido.</small>{Number(requestAmount||0)*(1+Number(markupPercentage||0)/100)>Number(selectedItemBalance?.operational_balance ?? selectedEmpenho.operational_balance ?? 0)&&<div className="alert error">Atenção: este lançamento ultrapassa o saldo disponível do item e deixará o item negativo em {money(Number(requestAmount||0)*(1+Number(markupPercentage||0)/100)-Number(selectedItemBalance?.operational_balance ?? selectedEmpenho.operational_balance ?? 0))}.</div>}</div></> :
        <label>Vincular a pedido existente (opcional)<select value={relatedOrderId} onChange={e=>setRelatedOrderId(e.target.value)}><option value="">Pagamento independente — abater este valor do empenho</option>{entries.filter(e=>e.entry_type==='pedido' && e.empenho_id===selectedEmpenho.empenho_id && e.status!=='cancelado').map(e=><option key={e.id} value={e.id}>{e.description} — NF {money(e.invoice_amount||e.requested_amount)}</option>)}</select><small>Se vinculado a um pedido já registrado, o pagamento será relacionado ao pedido e não abaterá o empenho uma segunda vez.</small></label>}
      <label>Descrição<input value={paymentDescription} onChange={e=>setPaymentDescription(e.target.value)} required maxLength={250} placeholder={entryType==='pedido'?'Ex.: Pedido recebido do órgão / objeto':'Ex.: Pagamento realizado pelo órgão / referência'}/></label>
      <label className="upload-field"><span><Upload size={18}/> Anexar documento (PDF/JPG/PNG/WEBP, até 10 MB)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setAttachment(e.target.files?.[0]||null)}/>{attachment&&<small>Arquivo selecionado: {attachment.name}</small>}</label>
      {formError&&<div className="alert error">{formError}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowPaymentForm(false)}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving?'Salvando…':entryType==='pedido'?'Registrar pedido e calcular NF':'Registrar pagamento'}</button></div>
    </form></div>}
  </>;
}
