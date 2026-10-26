import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Building2, CalendarDays, CheckCircle2, ChevronRight, CircleDollarSign,
  Clock3, FileText, LayoutDashboard, LogOut, Menu, Paperclip, Plus, RefreshCw,
  Search, ShieldCheck, Wallet, X, UploadCloud
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
              <OrgDetail key={activeOrg.id} organization={activeOrg} />
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


function OrgDetail({ organization }) {
  const [balances, setBalances] = useState([]);
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

  const loadData = useCallback(async () => {
    setBusy(true); setError('');
    const [balanceResult, entryResult] = await Promise.all([
      supabase.from('empenho_balances').select('*').eq('organization_id', organization.id).order('number'),
      supabase.from('payment_entries').select('id,empenho_id,request_date,paid_date,description,requested_amount,status,paid_amount,percentage_snapshot,percentage_amount_snapshot,balance_deduction_snapshot,entry_type,order_amount,markup_percentage,invoice_amount,related_order_id,created_at,payment_attachments(id,original_filename,storage_path)').order('request_date', { ascending: false })
    ]);
    if (balanceResult.error) setError(balanceResult.error.message);
    else setBalances(balanceResult.data || []);
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
    const amount = Number(originalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Informe um valor total do empenho maior que zero.'); setSaving(false); return;
    }
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
      setShowEmpenhoForm(false); setNumber(''); setDescription(''); setOriginalAmount(''); setIssuedOn(''); setPercentage('20'); setCalculationBase('valor_empenho'); setDeductionMode('valor_integral'); setBalancePolicy('recalcular_limite_com_taxa_vigente');
      setFormMessage('Empenho cadastrado. O limite de saldo corresponde ao valor total informado.'); await loadData();
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

  async function createPayment(event) {
    event.preventDefault(); setSaving(true); setFormError(''); setFormMessage('');
    const enteredAmount = Number(requestAmount);
    const markup = Number(markupPercentage);
    if (!selectedEmpenho || !Number.isFinite(enteredAmount) || enteredAmount <= 0 || !paymentDescription.trim()) {
      setFormError('Preencha a descrição e um valor válido.'); setSaving(false); return;
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

  const totalOriginal = balances.reduce((sum, item) => sum + Number(item.original_amount || 0), 0);
  const totalBalance = balances.reduce((sum, item) => sum + Number(item.operational_balance || 0), 0);
  const totalPaid = balances.reduce((sum, item) => sum + Number(item.confirmed_paid_amount || 0), 0);
  const totalPending = balances.reduce((sum, item) => sum + Number(item.pending_amount || 0), 0);
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
      <div className="section-head"><div><h3>Empenhos deste órgão</h3><p>Cada empenho mantém seu próprio percentual, saldo e histórico.</p></div><button className="secondary-btn" onClick={loadData}><RefreshCw size={15}/> Atualizar</button></div>
      {busy ? <div className="inline-loading"><div className="spinner"/> Carregando empenhos…</div> : balances.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Empenho</th><th>Valor total</th><th>Valor utilizado</th><th>Saldo disponível</th><th>Ações</th></tr></thead><tbody>{balances.map(item=><tr key={item.empenho_id}><td><strong>{item.number}</strong><small>{item.description}</small></td><td>{money(item.original_amount)}</td><td>{money(item.used_balance)}</td><td><strong className={Number(item.operational_balance)<0 ? "balance-value negative" : "balance-value"}>{money(item.operational_balance)}</strong><small>{item.pending_count} solicitações pendentes</small></td><td><div className="row-actions"><button className="secondary-btn compact" onClick={()=>{setSelectedEmpenho(item);setEntryType('pedido');setRequestAmount('');setPaymentDescription('');setMarkupPercentage('20');setRelatedOrderId('');setFormError('');setShowPaymentForm(true);}}>Novo lançamento</button></div></td></tr>)}</tbody></table></div> : <div className="empty-state"><div className="empty-icon"><FileText size={24}/></div><h3>Nenhum empenho cadastrado</h3><p>Cadastre o primeiro empenho para começar a registrar solicitações e acompanhar o saldo deste órgão.</p><button className="primary-btn" onClick={()=>setShowEmpenhoForm(true)}><Plus size={16}/> Cadastrar empenho</button></div>}
    </section>
    <section className="section-card detail-section">
      <div className="section-head"><div><h3>Histórico de solicitações e pagamentos</h3><p>Os registros anteriores preservam os parâmetros utilizados no lançamento.</p></div><div className="history-tools"><label className="month-filter">Mês de referência<input type="month" value={monthFilter} onChange={e=>setMonthFilter(e.target.value)}/></label><span className="count-pill">{filteredEntries.length} registros</span></div></div>
      {filteredEntries.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Solicitação</th><th>Empenho</th><th>Tipo / valor</th><th>Acréscimo</th><th>Situação</th><th>Documentos</th><th></th></tr></thead><tbody>{filteredEntries.map(entry=>{const linked=balances.find(b=>b.empenho_id===entry.empenho_id);return <tr key={entry.id}><td><strong>{new Date(entry.request_date+'T12:00:00').toLocaleDateString('pt-BR')}</strong><small>{entry.description}</small></td><td>{linked?.number || '—'}</td><td><strong>{entry.entry_type==='pedido'?'Pedido':'Pagamento'}</strong><small>{entry.entry_type==='pedido'?'Pedido: '+money(entry.order_amount)+' · NF: '+money(entry.invoice_amount):'Valor registrado: '+money(entry.paid_amount)}</small></td><td>{entry.entry_type==='pedido'?entry.markup_percentage+'% · '+money(entry.invoice_amount-entry.order_amount):entry.related_order_id?'Vinculado ao pedido':'Sem acréscimo'}</td><td><span className={'status-pill '+(entry.status==='cancelado'?'cancelled':entry.entry_type==='pedido'?'pending':entry.status==='pago'?'paid':'pending')}>{entry.status==='cancelado'?'Cancelado':entry.entry_type==='pedido'?'Pedido registrado':entry.status==='pago'?'Pago':'Solicitado'}</span>{entry.paid_date&&<small>Pago em {new Date(entry.paid_date+'T12:00:00').toLocaleDateString('pt-BR')}</small>}</td><td>{(entry.payment_attachments||[]).map(a=><button key={a.id} className="file-link" onClick={()=>openAttachment(a)}><Paperclip size={13}/>{a.original_filename}</button>)}</td><td>{entry.entry_type==='pedido' && entry.status==='solicitado' ? <span className="muted">Aguardando registro do pagamento</span> : null}</td></tr>})}</tbody></table></div> : <div className="empty-inline"><Clock3 size={18}/><span>{monthFilter ? 'Não há lançamentos para este mês.' : 'As solicitações registradas aparecerão aqui.'}</span></div>}
    </section>
    {showEmpenhoForm && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowEmpenhoForm(false);}}><form className="modal-card wide-modal" onSubmit={createEmpenho}><div className="modal-head"><div><span className="eyebrow">NOVO REGISTRO</span><h2>Cadastrar empenho</h2><p>O empenho e sua regra inicial serão salvos juntos.</p></div><button type="button" className="icon-btn" onClick={()=>setShowEmpenhoForm(false)}><X size={19}/></button></div><div className="form-grid"><label>Número do empenho<input value={number} onChange={e=>setNumber(e.target.value)} required maxLength={80} placeholder="Ex.: 2026NE000123"/></label><label>Data do empenho<input type="date" value={issuedOn} onChange={e=>setIssuedOn(e.target.value)}/></label></div><label>Descrição<input value={description} onChange={e=>setDescription(e.target.value)} required maxLength={250} placeholder="Descrição ou objeto do empenho"/></label><label>Valor original (R$)<input type="number" min="0.01" step="0.01" value={originalAmount} onChange={e=>setOriginalAmount(e.target.value)} required placeholder="10000,00"/></label><div className="rule-summary"><span>Regra do empenho</span><strong>O saldo é controlado pelo valor total do empenho.</strong><small>O acréscimo percentual será informado em cada pedido, no momento do lançamento. Nenhum percentual será aplicado ao valor total do empenho.</small></div>{formError&&<div className="alert error">{formError}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowEmpenhoForm(false)}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving?'Salvando…':'Salvar empenho'}</button></div></form></div>}
    {showRuleForm && selectedEmpenho && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowRuleForm(false);}}><form className="modal-card wide-modal" onSubmit={saveRuleChange}><div className="modal-head"><div><span className="eyebrow">HISTÓRICO DE REGRAS</span><h2>Alterar regra do empenho</h2><p>Empenho {selectedEmpenho.number}. A regra atual não será sobrescrita.</p></div><button type="button" className="icon-btn" onClick={()=>setShowRuleForm(false)}><X size={19}/></button></div><div className="rule-panel"><label>Percentual (%)<input type="number" min="0" max="100" step="0.01" value={percentage} onChange={e=>setPercentage(e.target.value)} required/></label><label>Base de cálculo<select value={calculationBase} onChange={e=>setCalculationBase(e.target.value)}><option value="valor_empenho">Valor total do empenho</option><option value="valor_pedido">Cada pedido solicitado</option></select></label><label>Abatimento do saldo<select value={deductionMode} onChange={e=>setDeductionMode(e.target.value)}><option value="valor_integral">Valor integral do pedido</option><option value="valor_liquido">Valor líquido após percentual</option></select></label></div><div className="rule-summary"><span>Regra atual</span><strong>{selectedEmpenho.current_percentage}% · {selectedEmpenho.current_calculation_base==='valor_empenho'?'base no empenho':'base no pedido'}</strong><small>A nova regra terá vigência a partir de agora. Os cálculos salvos nos lançamentos anteriores não serão modificados.</small></div>{formError&&<div className="alert error">{formError}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowRuleForm(false)}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving?'Salvando…':'Registrar nova regra'}</button></div></form></div>}
    {showPaymentForm && selectedEmpenho && <div className="modal-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setShowPaymentForm(false);}}><form className="modal-card wide-modal" onSubmit={createPayment}>
      <div className="modal-head"><div><span className="eyebrow">LANÇAMENTO FINANCEIRO</span><h2>Novo lançamento</h2><p>Empenho {selectedEmpenho.number} · saldo disponível {money(selectedEmpenho.operational_balance)}</p></div><button type="button" className="icon-btn" onClick={()=>setShowPaymentForm(false)}><X size={19}/></button></div>
      <label>Tipo de lançamento<select value={entryType} onChange={e=>{setEntryType(e.target.value);setRequestAmount('');setRelatedOrderId('');}}><option value="pedido">Pedido recebido (calcular NF e comprometer saldo)</option><option value="pagamento">Pagamento realizado (abater valor pago)</option></select></label>
      <div className="form-grid"><label>Data do lançamento<input type="date" value={requestDate} onChange={e=>setRequestDate(e.target.value)} required/></label><label>{entryType==='pedido'?'Valor original do pedido (R$)':'Valor pago (R$)'}<input type="number" min="0.01" step="0.01" value={requestAmount} onChange={e=>setRequestAmount(e.target.value)} required placeholder="1000.00"/></label></div>
      {entryType==='pedido' ? <><label>Acréscimo aplicado (%)<input type="number" min="0" max="100" step="0.01" value={markupPercentage} onChange={e=>setMarkupPercentage(e.target.value)} required/></label><div className="rule-summary"><span>Prévia da nota fiscal</span><strong>{money(Number(requestAmount||0)*(1+Number(markupPercentage||0)/100))}</strong><small>{money(Number(requestAmount||0))} de pedido + {money(Number(requestAmount||0)*Number(markupPercentage||0)/100)} de acréscimo. Esse total será abatido/comprometido no empenho ao registrar o pedido.</small>{Number(requestAmount||0)*(1+Number(markupPercentage||0)/100)>Number(selectedEmpenho.operational_balance||0)&&<div className="alert error">Atenção: este lançamento ultrapassa o saldo disponível e deixará o empenho negativo em {money(Number(requestAmount||0)*(1+Number(markupPercentage||0)/100)-Number(selectedEmpenho.operational_balance||0))}.</div>}</div></> :
        <label>Vincular a pedido existente (opcional)<select value={relatedOrderId} onChange={e=>setRelatedOrderId(e.target.value)}><option value="">Pagamento independente — abater este valor do empenho</option>{entries.filter(e=>e.entry_type==='pedido' && e.empenho_id===selectedEmpenho.empenho_id && e.status!=='cancelado').map(e=><option key={e.id} value={e.id}>{e.description} — NF {money(e.invoice_amount||e.requested_amount)}</option>)}</select><small>Se vinculado a um pedido já registrado, o pagamento será relacionado ao pedido e não abaterá o empenho uma segunda vez.</small></label>}
      <label>Descrição<input value={paymentDescription} onChange={e=>setPaymentDescription(e.target.value)} required maxLength={250} placeholder={entryType==='pedido'?'Ex.: Pedido recebido do órgão / objeto':'Ex.: Pagamento realizado pelo órgão / referência'}/></label>
      <label className="upload-field"><span><UploadCloud size={18}/> Anexar documento (PDF/JPG/PNG/WEBP, até 10 MB)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setAttachment(e.target.files?.[0]||null)}/>{attachment&&<small>Arquivo selecionado: {attachment.name}</small>}</label>
      {formError&&<div className="alert error">{formError}</div>}<div className="modal-actions"><button type="button" className="secondary-btn" onClick={()=>setShowPaymentForm(false)}>Cancelar</button><button className="primary-btn" disabled={saving}>{saving?'Salvando…':entryType==='pedido'?'Registrar pedido e calcular NF':'Registrar pagamento'}</button></div>
    </form></div>}
  </>;
}
