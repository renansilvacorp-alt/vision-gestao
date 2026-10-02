'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, auth } from './lib/platform';
import { AppSelect } from './components/AppSelect';
import { useConfirm } from './components/ConfirmProvider';
import { ContainerTemplates } from './features/master/ContainerTemplates';
import { StoreStructureEditor } from './components/StoreStructureEditor';
import { ContainerManager, type InstalledContainer } from './components/ContainerManager';
import { CustomPageView } from './components/CustomPageView';
import { normalizeCustomPages, type CustomPageDefinition } from './customPages';
import {
  customPageIdFromKey,
  isCustomNavigationKey,
  normalizeNavigationItems,
  type NavigationIconKey,
  type NavigationItem,
} from './navigation';
import {
  ArrowLeft,
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  ChefHat,
  CircleDollarSign,
  History,
  LogOut,
  Menu,
  Package,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Users,
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react';

type Role = 'superadmin' | 'admin' | 'operator';
type ChannelKey = 'porta' | 'ifood' | '99' | 'encomenda';

type ChannelConfig = {
  platformPct: number;
  cardPct: number;
  transferPct: number;
  fixedPerOrder: number;
  monthlyFee: number;
  monthlyThreshold: number;
  profitPct: number;
  monthlyPct: number;
  promoEnabled: boolean;
  promoFee: number;
};

type StoreData = {
  id: string;
  name: string;
  logoUrl?: string;
  visual?: { theme: 'light' | 'dark'; primary: string; accent: string; fontSize: 'small' | 'normal' | 'large' | 'xlarge' };
  role?: Role;
  modules: { encomendas: boolean };
  reserves: { generalPct: number; cashPct: number };
  channels: Record<ChannelKey, ChannelConfig>;
  members?: Array<{ email: string; role: 'admin' | 'operator' }>;
  navigation?: NavigationItem[];
  customPages?: CustomPageDefinition[];
  installedContainers?: InstalledContainer[];
  containerId?: string;
  containerVersion?: number;
  structureCustomized?: boolean;
};

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  packageQty: number;
  packageCost: number;
  unitCost: number;
  supplier?: string;
};

type Recipe = {
  id: string;
  name: string;
  yieldQty: number;
  totalCost: number;
  unitCost: number;
  items: Array<{
    ingredientId: string;
    ingredientName: string;
    quantity: number;
    unit: string;
    cost: number;
  }>;
};

type Product = {
  id: string;
  name: string;
  recipeId?: string;
  manualCost: number;
  packagingCost: number;
  cost: number;
  prices: Record<ChannelKey, number>;
};

type SessionData = {
  user: { id: string; email?: string; name?: string };
  isSuperadmin: boolean;
  stores: StoreData[];
  diagnostic?: string;
};

type FinanceData = {
  count: number;
  gross: number;
  productCost: number;
  fees: number;
  monthlyFees: number;
  promoFees: number;
  generalReserve: number;
  cashReserve: number;
  estimatedProfit: number;
  byChannel: Record<ChannelKey, number>;
  truncated: boolean;
};

type SaleHistoryItem = {
  id: string;
  channel: ChannelKey;
  paymentMethod: string;
  items: Array<{
    productName: string;
    quantity: number;
    unitPrice: number;
    revenue: number;
  }>;
  gross: number;
  createdAt: string;
};

type SaleHistoryData = {
  items: SaleHistoryItem[];
  count: number;
  gross: number;
  truncated: boolean;
};

const money = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const comparePtBr = (first: string, second: string) =>
  first.localeCompare(second, 'pt-BR', {
    sensitivity: 'base',
    numeric: true,
  });

function sortByName<T extends { name: string }>(items: T[]) {
  return [...items].sort((first, second) =>
    comparePtBr(first.name, second.name)
  );
}

function sortByEmail<T extends { email: string }>(items: T[]) {
  return [...items].sort((first, second) =>
    comparePtBr(first.email, second.email)
  );
}

const navigationIcons: Record<
  NavigationIconKey,
  React.ComponentType<{ size?: number }>
> = {
  'shopping-cart': ShoppingCart,
  'book-open': BookOpen,
  package: Package,
  'chef-hat': ChefHat,
  calculator: Calculator,
  'circle-dollar-sign': CircleDollarSign,
  history: History,
  settings: Settings,
  users: Users,
  store: Store,
  boxes: Boxes,
};

function NavigationIcon(props: { icon: NavigationIconKey }) {
  const Icon = navigationIcons[props.icon] ?? Store;
  return <Icon />;
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 10);
}

const today = localDateValue();
const monthStart = `${today.slice(0, 7)}-01`;
function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <span>{props.label}</span>
      {props.children}
    </div>
  );
}

function Empty(props: { text: string }) {
  return <div className="empty">{props.text}</div>;
}

function App() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [active, setActive] = useState('venda');
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientPreview, setClientPreview] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [financeStart, setFinanceStart] = useState(monthStart);
  const [financeEnd, setFinanceEnd] = useState(today);

  const currentStore = useMemo(
    () => session?.stores.find(store => store.id === storeId) ?? null,
    [session, storeId]
  );
  const currentRole: Role | null = session?.isSuperadmin
    ? 'superadmin'
    : (currentStore?.role ?? null);
  const canStructure = currentRole === 'superadmin' || currentRole === 'admin';
  const navigationItems = useMemo(
    () => normalizeNavigationItems(currentStore?.navigation),
    [currentStore?.navigation]
  );
  const visibleNavigation = useMemo(
    () =>
      navigationItems.filter(
        item =>
          item.enabled &&
          Boolean(currentRole) &&
          item.roles.includes(currentRole as Role) &&
          (!clientPreview || item.key !== 'usuarios')
      ),
    [navigationItems, currentRole, clientPreview]
  );
  const customPages = useMemo(
    () => normalizeCustomPages(currentStore?.customPages),
    [currentStore?.customPages]
  );
  const activeCustomPage = useMemo(() => {
    if (!isCustomNavigationKey(active)) return null;
    const pageId = customPageIdFromKey(active);
    return customPages.find(page => page.id === pageId) ?? null;
  }, [active, customPages]);
  const navigationGroups = useMemo(() => {
    const groups: Array<{ name: string; items: NavigationItem[] }> = [];
    for (const item of visibleNavigation) {
      const existing = groups.find(group => group.name === item.group);
      if (existing) existing.items.push(item);
      else groups.push({ name: item.group, items: [item] });
    }
    return groups;
  }, [visibleNavigation]);

  async function loadSession() {
    setLoading(true);
    try {
      const user = await auth.getUser();
      if (!user) {
        setSession(null);
        return;
      }
      const { data } = await api.get('/api/session');
      const next = data as SessionData;
      const sortedNext: SessionData = {
        ...next,
        stores: sortByName(next.stores).map(store => ({
          ...store,
          members: store.members ? sortByEmail(store.members) : store.members,
        })),
      };
      setSession(sortedNext);
      if (sortedNext.diagnostic) {
        setMessage(
          'Sua conta foi autenticada, mas houve uma falha interna ao montar a sessão. Código: ' +
            sortedNext.diagnostic
        );
      }
      if (!sortedNext.isSuperadmin && !storeId && sortedNext.stores.length)
        setStoreId(sortedNext.stores[0].id);
    } catch (cause) {
      setSession(null);
      const detail =
        cause && typeof cause === 'object' && 'message' in cause
          ? String((cause as { message?: string }).message ?? '')
          : '';
      setMessage(
        detail
          ? `Login concluído, mas a sessão não carregou: ${detail}`
          : 'Login concluído, mas não foi possível carregar sua sessão.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadStoreData(target = storeId, section = active) {
    if (!target) return;
    try {
      const { data } = await api.get(
        `/api/stores/${target}/workspace?scope=${encodeURIComponent(section)}`
      );
      const workspace = data as {
        ingredients?: Ingredient[];
        recipes?: Recipe[];
        products?: Product[];
        truncated?: {
          ingredients?: boolean;
          recipes?: boolean;
          products?: boolean;
        };
      };
      if (Array.isArray(workspace.ingredients))
        setIngredients(sortByName(workspace.ingredients));
      if (Array.isArray(workspace.recipes))
        setRecipes(sortByName(workspace.recipes));
      if (Array.isArray(workspace.products))
        setProducts(sortByName(workspace.products));
      if (
        workspace.truncated?.ingredients ||
        workspace.truncated?.recipes ||
        workspace.truncated?.products
      )
        setMessage(
          'Há mais de 500 registros neste módulo. A paginação avançada será usada para bases maiores.'
        );
    } catch {
      setMessage('Não foi possível carregar os dados desta empresa.');
    }
  }

  async function loadFinance() {
    if (!storeId) return;
    try {
      const { data } = await api.get(
        `/api/stores/${storeId}/finance?start=${financeStart}&end=${financeEnd}`
      );
      setFinance(data as FinanceData);
    } catch {
      setMessage('Não foi possível calcular o fechamento.');
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);
  useEffect(() => {
    const dataSections = [
      'venda',
      'insumos',
      'receitas',
      'precificacao',
      'cardapio',
    ];
    if (storeId && dataSections.includes(active))
      void loadStoreData(storeId, active);
  }, [storeId, active]);

  useEffect(() => {
    if (storeId && active === 'financeiro') void loadFinance();
  }, [storeId, active]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [menuOpen]);

  useEffect(() => {
    if (!currentStore || !currentRole) return;
    if (active === 'estrutura' && currentRole === 'superadmin' && !clientPreview)
      return;
    if (visibleNavigation.some(item => item.key === active)) return;
    const first = visibleNavigation[0];
    if (first) setActive(first.key);
  }, [currentStore?.id, currentRole, active, clientPreview, visibleNavigation]);

  async function signIn() {
    setMessage('');
    setLoading(true);
    try {
      await auth.signIn({ scope: 'openid email profile offline_access' });
      const user = await auth.getUser();
      if (!user) throw new Error('Sessão de autenticação não foi persistida.');
      await loadSession();
    } catch (cause) {
      setLoading(false);
      const code =
        cause && typeof cause === 'object' && 'code' in cause
          ? String((cause as { code?: string }).code)
          : '';
      const detail =
        cause instanceof Error && cause.message
          ? cause.message
          : '';
      setMessage(
        code === 'popup_blocked'
          ? 'Permita pop-ups para entrar.'
          : code === 'popup_closed'
            ? 'Login cancelado.'
            : detail
              ? `Não foi possível concluir o login: ${detail}`
              : 'Não foi possível concluir o login.'
      );
    }
  }

  async function signOut() {
    await auth.signOut();
    setSession(null);
    setStoreId('');
  }

  if (loading)
    return (
      <div className="center">
        <div className="loader" />
        <p>Carregando gestão...</p>
      </div>
    );

  if (!session) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark vision-brand-mark">
            <img src="/vision-icon.svg" alt="Vision" />
          </div>
          <p className="eyebrow">VISION · GESTÃO INTEGRADA</p>
          <h1>Uma plataforma. Cada empresa do seu jeito.</h1>
          <p className="muted">
            Cadastros, composição de custos, preços, vendas e gestão isolados
            por empresa, com identidade e operação próprias.
          </p>
          <button className="primary big" onClick={() => void signIn()}>
            Entrar com minha conta
          </button>
          {message && <div className="notice">{message}</div>}
        </section>
      </main>
    );
  }

  if (!session.stores.length && !session.isSuperadmin) {
    return (
      <main className="login-shell">
        <section className="login-card wide">
          <div className="brand-mark vision-brand-mark">
            <img src="/vision-icon.svg" alt="Vision" />
          </div>
          <p className="eyebrow">VISION · ACESSO AUTENTICADO</p>
          <h1>Conta sem loja vinculada</h1>
          <p className="muted">
            Seu login funcionou, mas este e-mail ainda não está vinculado a
            nenhuma loja. Confirme com o administrador se o mesmo e-mail usado
            no cadastro foi escolhido no login.
          </p>
          {message && <div className="notice">{message}</div>}
          <button className="ghost" onClick={() => void signOut()}>
            <LogOut size={18} /> Sair
          </button>
        </section>
      </main>
    );
  }

  if (session.isSuperadmin && !storeId) {
    return (
      <SuperadminRoot
        session={session}
        onSignOut={() => void signOut()}
        onSessionRefresh={() => void loadSession()}
        onEnterStore={id => {
          setStoreId(id);
          setActive('venda');
        }}
      />
    );
  }

  function openSection(section: string) {
    setActive(section);
    setMenuOpen(false);
  }

  const visual = currentStore?.visual ?? { theme: 'light' as const, primary: '#111827', accent: '#2563eb', fontSize: 'normal' as const };
  const fontScale = { small: 0.9, normal: 1, large: 1.12, xlarge: 1.25 }[visual.fontSize];
  const readableText = (hex: string) => {
    const value = hex.replace('#', '');
    const red = parseInt(value.slice(0, 2), 16) || 0;
    const green = parseInt(value.slice(2, 4), 16) || 0;
    const blue = parseInt(value.slice(4, 6), 16) || 0;
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance > 0.62 ? '#111827' : '#ffffff';
  };

  return (
    <div
      className={`app-shell store-shell theme-${visual.theme}`}
      style={{
        '--store-primary': visual.primary,
        '--store-accent': visual.accent,
        '--store-on-primary': readableText(visual.primary),
        '--store-on-accent': readableText(visual.accent),
        '--font-scale': fontScale,
      } as React.CSSProperties}
    >
      <header className="topbar">
        <div className="store-identity">
          <button
            className="icon-button menu-trigger"
            aria-label="Abrir menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={21} />
          </button>
          <div className="store-logo">
            {currentStore?.logoUrl ? (
              <img src={currentStore.logoUrl} alt="" />
            ) : (
              <Store size={22} />
            )}
          </div>
          <div>
            <strong>{currentStore?.name ?? 'Selecione uma loja'}</strong>
            <small>
              {clientPreview
                ? 'Ambiente da loja'
                : currentRole === 'superadmin'
                  ? 'Superadmin'
                  : currentRole === 'admin'
                    ? 'Administrador'
                    : 'Operador'}
            </small>
          </div>
        </div>
        <div className="top-actions">
          {!clientPreview && session.isSuperadmin ? (
            <button
              className="secondary master-return"
              onClick={() => {
                setStoreId('');
                setActive('venda');
              }}
            >
              <ArrowLeft size={18} /> Painel Master
            </button>
          ) : !clientPreview && session.stores.length > 1 ? (
            <AppSelect
              ariaLabel="Empresa atual"
              className="topbar-store-select"
              value={storeId}
              onValueChange={setStoreId}
              options={session.stores.map(store => ({
                value: store.id,
                label: store.name,
              }))}
            />
          ) : null}
          <button
            className="icon-button"
            title="Sair"
            onClick={() => void signOut()}
          >
            <LogOut size={19} />
          </button>
        </div>
      </header>

      {currentStore?.logoUrl && (
        <div className="store-brand-watermark" aria-hidden="true">
          <img src={currentStore.logoUrl} alt="" />
        </div>
      )}

      {clientPreview && (
        <button
          className="client-preview-exit"
          onClick={() => {
            setClientPreview(false);
            setActive('aparencia');
            setMenuOpen(false);
          }}
        >
          <ArrowLeft size={17} /> Sair da visualização
        </button>
      )}

      {menuOpen && (
        <div
          className="side-menu-backdrop"
          onClick={() => setMenuOpen(false)}
        >
          <aside
            className="side-menu"
            aria-label="Menu da loja"
            onClick={event => event.stopPropagation()}
          >
            <div className="side-menu-head">
              <div className="side-menu-brand">
                <div className="side-menu-brand-logo">
                  {currentStore?.logoUrl ? (
                    <img src={currentStore.logoUrl} alt="" />
                  ) : (
                    <Store size={20} />
                  )}
                </div>
                <div>
                  <strong>{currentStore?.name ?? 'Loja'}</strong>
                  <small>Ambiente personalizado</small>
                </div>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar menu"
                onClick={() => setMenuOpen(false)}
              >
                <X size={20} />
              </button>
            </div>

            <nav className="side-menu-nav">
              {navigationGroups.map(group => (
                <div className="side-menu-group" key={group.name}>
                  <span className="side-menu-group-label">{group.name}</span>
                  {group.items.map(item => (
                    <button
                      key={item.key}
                      className={active === item.key ? 'active' : ''}
                      onClick={() => openSection(item.key)}
                    >
                      <NavigationIcon icon={item.icon} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              ))}
              {currentRole === 'superadmin' && !clientPreview && (
                <div className="side-menu-group">
                  <span className="side-menu-group-label">Superadmin</span>
                  <button
                    className={active === 'estrutura' ? 'active' : ''}
                    onClick={() => openSection('estrutura')}
                  >
                    <Boxes />
                    <span>Estrutura da empresa</span>
                  </button>
                </div>
              )}
            </nav>
          </aside>
        </div>
      )}

      {message && (
        <div className="toast" onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      <main className="content">
        {active === 'venda' && currentStore && (
          <Sales
            store={currentStore}
            products={products}
            onSaved={() => {
              setMessage('Venda registrada.');
              setFinance(null);
            }}
          />
        )}
        {active === 'insumos' && (
          <Ingredients
            storeId={storeId}
            items={ingredients}
            onChanged={() => void loadStoreData()}
          />
        )}
        {active === 'receitas' && (
          <Recipes
            storeId={storeId}
            ingredients={ingredients}
            items={recipes}
            onChanged={() => void loadStoreData()}
          />
        )}
        {active === 'precificacao' && currentStore && (
          <Pricing
            store={currentStore}
            storeId={storeId}
            recipes={recipes}
            items={products}
            onChanged={() => void loadStoreData()}
          />
        )}
        {active === 'cardapio' && (
          <Catalog recipes={recipes} products={products} />
        )}
        {active === 'financeiro' && (
          <Finance
            data={finance}
            start={financeStart}
            end={financeEnd}
            onStart={setFinanceStart}
            onEnd={setFinanceEnd}
            onRun={() => void loadFinance()}
          />
        )}
        {active === 'historico' && (
          <SalesHistory storeId={storeId} onDeleted={() => setFinance(null)} />
        )}
        {activeCustomPage && currentStore && currentRole && (
          <CustomPageView
            storeId={storeId}
            page={activeCustomPage}
            role={currentRole}
          />
        )}
        {active === 'usuarios' && currentStore && canStructure && (
          <AccessManager
            store={currentStore}
            onUpdated={() => void loadSession()}
          />
        )}
        {active === 'estrutura' && currentStore && currentRole === 'superadmin' && (
          <StoreStructureEditor
            store={currentStore}
            onUpdated={() => void loadSession()}
          />
        )}
        {active === 'aparencia' && currentStore && (
          <Appearance
            store={currentStore}
            canEdit={Boolean(currentRole)}
            onUpdated={() => void loadSession()}
            onPreview={() => {
              setClientPreview(true);
              setActive('venda');
              setMenuOpen(false);
            }}
          />
        )}
        {active === 'config' && currentStore && (
          <Configuration
            store={currentStore}
            canStructure={canStructure}
            onUpdated={async () => {
              await loadSession();
              await loadStoreData();
            }}
          />
        )}
      </main>

    </div>
  );
}

type ContainerConfig = {
  modules: { encomendasAvailable: boolean };
};

function SuperadminRoot(props: {
  session: SessionData;
  onSignOut: () => void;
  onSessionRefresh: () => void;
  onEnterStore: (id: string) => void;
}) {
  const [view, setView] = useState<'home' | 'stores' | 'container'>('home');

  return (
    <div className="app-shell master-shell">
      <header className="topbar master-topbar">
        <div className="store-identity">
          <div className="store-logo vision-master-logo">
            <img src="/vision-icon.svg" alt="" />
          </div>
          <div>
            <strong>Vision</strong>
            <small>Gestão Integrada · Superadmin</small>
          </div>
        </div>
        <button className="icon-button" title="Sair" onClick={props.onSignOut}>
          <LogOut size={19} />
        </button>
      </header>

      <main className="content">
        {view === 'home' && (
          <SuperadminHome
            stores={props.session.stores}
            onStores={() => setView('stores')}
            onContainer={() => setView('container')}
          />
        )}
        {view === 'stores' && (
          <StoreAdmin
            stores={props.session.stores}
            onCreated={props.onSessionRefresh}
            onEnterStore={props.onEnterStore}
          />
        )}
        {view === 'container' && <ContainerTemplates />}
      </main>

      <nav className="bottom-nav master-nav">
        <button
          className={view === 'home' ? 'active' : ''}
          onClick={() => setView('home')}
        >
          <Building2 />
          <span>Master</span>
        </button>
        <button
          className={view === 'stores' ? 'active' : ''}
          onClick={() => setView('stores')}
        >
          <Store />
          <span>Empresas</span>
        </button>
        <button
          className={view === 'container' ? 'active' : ''}
          onClick={() => setView('container')}
        >
          <Boxes />
          <span>Studio</span>
        </button>
      </nav>
    </div>
  );
}

function SuperadminHome(props: {
  stores: StoreData[];
  onStores: () => void;
  onContainer: () => void;
}) {
  const accessCount = props.stores.reduce(
    (total, store) => total + (store.members?.length ?? 0),
    0
  );
  const encomendasCount = props.stores.filter(
    store => store.modules.encomendas
  ).length;

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">RAIZ DO SISTEMA</p>
          <h2>Gestão do container</h2>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric hero">
          <span>Empresas no sistema</span>
          <strong>{props.stores.length}</strong>
          <small>ambientes independentes</small>
        </div>
        <div className="metric">
          <span>Acessos cadastrados</span>
          <strong>{accessCount}</strong>
        </div>
        <div className="metric">
          <span>Empresas com Encomendas</span>
          <strong>{encomendasCount}</strong>
        </div>
      </div>

      <div className="master-action-grid">
        <button className="master-action-card" onClick={props.onStores}>
          <Store size={28} />
          <div>
            <strong>Empresas</strong>
            <span>Criar empresas, revisar acessos e entrar em cada ambiente.</span>
          </div>
        </button>
        <button className="master-action-card" onClick={props.onContainer}>
          <Boxes size={28} />
          <div>
            <strong>Container Studio</strong>
            <span>
              Criar, versionar e montar a estrutura que cada empresa recebe.
            </span>
          </div>
        </button>
      </div>

      <div className="info-card">
        <strong>Você está na raiz.</strong> Nenhuma empresa está aberta neste
        momento. Dados operacionais só aparecem depois que você escolhe entrar
        em uma empresa.
      </div>
    </section>
  );
}

function ContainerBase() {
  const [config, setConfig] = useState<ContainerConfig | null>(null);
  const [message, setMessage] = useState('');

  async function load() {
    try {
      const { data } = await api.get('/api/superadmin/config');
      setConfig(data as ContainerConfig);
    } catch {
      setMessage('Não foi possível carregar o Container Base.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!config) return;
    try {
      const { data } = await api.put('/api/superadmin/config', config);
      setConfig(data as ContainerConfig);
      setMessage('Container Base atualizado.');
    } catch {
      setMessage('Não foi possível salvar o Container Base.');
    }
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">ESTRUTURA GLOBAL</p>
          <h2>Container Base</h2>
        </div>
      </div>

      <div className="panel">
        <h3>Módulos principais fornecidos a todas as lojas</h3>
        <div className="base-module-grid">
          {['Insumos', 'Receitas', 'Produtos e Precificação', 'Vendas', 'Financeiro'].map(
            module => (
              <div className="base-module fixed" key={module}>
                <strong>{module}</strong>
                <span>Base do sistema</span>
              </div>
            )
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Módulos opcionais</h3>
        {!config ? (
          <div className="empty">Carregando configuração...</div>
        ) : (
          <>
            <label className="module-control">
              <div>
                <strong>Encomendas</strong>
                <small>
                  Quando disponível, o Administrador de uma loja pode ativar esse
                  módulo no próprio ambiente.
                </small>
              </div>
              <input
                type="checkbox"
                checked={config.modules.encomendasAvailable}
                onChange={event =>
                  setConfig({
                    modules: {
                      ...config.modules,
                      encomendasAvailable: event.target.checked,
                    },
                  })
                }
              />
            </label>
            <button className="primary" onClick={() => void save()}>
              <Settings size={18} /> Salvar Container Base
            </button>
          </>
        )}
        {message && <div className="notice">{message}</div>}
      </div>
    </section>
  );
}

type StoreTemplateSummary = {
  id: string;
  name: string;
  version?: number;
};

function CreateStore(props: {
  templates: StoreTemplateSummary[];
  onCreated: () => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [containerIds, setContainerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  async function save() {
    if (!name.trim()) {
      setErrorText('Informe o nome da empresa.');
      return;
    }
    setSaving(true);
    setErrorText('');
    try {
      await api.post('/api/stores', {
        name,
        containerIds,
      });
      setName('');
      setContainerIds([]);
      await props.onCreated();
    } catch {
      setErrorText('Não foi possível criar a loja.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="create-company-form create-company-with-containers">
      <label className="field">
        <span>Nome da empresa</span>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="Nome da empresa"
        />
      </label>
      <div className="container-pick-field">
        <strong>Containers para instalar agora</strong>
        <small>Opcional. Você também poderá instalar depois em qualquer empresa.</small>
        {props.templates.length === 0 ? (
          <div className="muted">Nenhum container disponível no Studio.</div>
        ) : (
          <div className="container-pick-list">
            {props.templates.map(template => (
              <label key={template.id}>
                <input
                  type="checkbox"
                  checked={containerIds.includes(template.id)}
                  onChange={event =>
                    setContainerIds(current =>
                      event.target.checked
                        ? [...current, template.id]
                        : current.filter(id => id !== template.id)
                    )
                  }
                />
                <span>{template.name} · v{template.version ?? 1}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <button className="primary" onClick={() => void save()} disabled={saving}>
        <Plus size={18} /> Criar empresa
      </button>
      {errorText && <small className="error-text">{errorText}</small>}
    </div>
  );
}

function accessError(cause: unknown, fallback: string) {
  if (cause instanceof Error && cause.message) return cause.message;
  return fallback;
}

function AccessManager(props: {
  store: StoreData;
  onUpdated: () => void | Promise<void>;
  embedded?: boolean;
}) {
  const confirmAction = useConfirm();
  const roleOptions = [
    { value: 'admin', label: 'Administrador' },
    { value: 'operator', label: 'Operador' },
  ];
  const members = sortByEmail(props.store.members ?? []);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'operator'>('operator');
  const [editingEmail, setEditingEmail] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<'admin' | 'operator'>('operator');
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');

  async function refresh(message: string) {
    await props.onUpdated();
    setFeedback(message);
  }

  async function createMember() {
    const email = newEmail.trim().toLowerCase();
    if (!email) {
      setFeedback('Informe o e-mail do novo usuário.');
      return;
    }
    setBusy('new');
    setFeedback('');
    try {
      await api.post(`/api/stores/${props.store.id}/members`, {
        email,
        role: newRole,
      });
      setNewEmail('');
      setNewRole('operator');
      await refresh(`Acesso de ${email} criado com sucesso.`);
    } catch (cause) {
      setFeedback(accessError(cause, 'Não foi possível criar o acesso.'));
    } finally {
      setBusy('');
    }
  }

  function startEdit(member: { email: string; role: 'admin' | 'operator' }) {
    setEditingEmail(member.email);
    setEditEmail(member.email);
    setEditRole(member.role);
    setFeedback('');
  }

  async function updateMember(
    currentEmail: string,
    email: string,
    role: 'admin' | 'operator'
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    setBusy(currentEmail);
    setFeedback('');
    try {
      await api.put(`/api/stores/${props.store.id}/members`, {
        currentEmail,
        email: normalizedEmail,
        role,
      });
      setEditingEmail('');
      await refresh(`Acesso de ${normalizedEmail} atualizado.`);
    } catch (cause) {
      setFeedback(accessError(cause, 'Não foi possível atualizar o acesso.'));
    } finally {
      setBusy('');
    }
  }

  async function removeMember(member: { email: string; role: 'admin' | 'operator' }) {
    const allowed = await confirmAction({
      title: 'Revogar acesso?',
      message: `${member.email} deixará de acessar esta empresa assim que a sessão for atualizada.`,
      confirmLabel: 'Revogar acesso',
      danger: true,
    });
    if (!allowed) return;

    setBusy(member.email);
    setFeedback('');
    try {
      await api.delete(`/api/stores/${props.store.id}/members`, {
        email: member.email,
      });
      if (editingEmail === member.email) setEditingEmail('');
      await refresh(`Acesso de ${member.email} revogado.`);
    } catch (cause) {
      setFeedback(accessError(cause, 'Não foi possível revogar o acesso.'));
    } finally {
      setBusy('');
    }
  }

  const content = (
    <div className="member-manager">
      <div className="member-create-grid">
        <Field label="E-mail do novo usuário">
          <input
            type="email"
            value={newEmail}
            onChange={event => setNewEmail(event.target.value)}
            placeholder="usuario@empresa.com"
          />
        </Field>
        <Field label="Função">
          <AppSelect
            value={newRole}
            options={roleOptions}
            onValueChange={value => setNewRole(value as 'admin' | 'operator')}
            ariaLabel="Função do novo usuário"
          />
        </Field>
        <button
          className="primary member-create-button"
          onClick={() => void createMember()}
          disabled={Boolean(busy)}
        >
          <Plus size={18} /> Liberar acesso
        </button>
      </div>
      <p className="muted access-hint">
        O usuário entra normalmente e recebe este perfil quando autenticar com o mesmo e-mail cadastrado.
      </p>
      {feedback && <div className="notice">{feedback}</div>}

      <div className="member-list">
        {members.length === 0 ? (
          <div className="member-empty">Nenhum usuário adicional cadastrado.</div>
        ) : (
          members.map(member => (
            <div className="member-row member-management-row" key={member.email}>
              {editingEmail === member.email ? (
                <div className="member-edit-grid">
                  <Field label="E-mail">
                    <input
                      type="email"
                      value={editEmail}
                      onChange={event => setEditEmail(event.target.value)}
                    />
                  </Field>
                  <Field label="Função">
                    <AppSelect
                      value={editRole}
                      options={roleOptions}
                      onValueChange={value => setEditRole(value as 'admin' | 'operator')}
                      ariaLabel={`Editar função de ${member.email}`}
                    />
                  </Field>
                  <div className="member-edit-actions">
                    <button
                      className="primary compact-action"
                      disabled={Boolean(busy)}
                      onClick={() => void updateMember(member.email, editEmail, editRole)}
                    >
                      <Check size={16} /> Salvar
                    </button>
                    <button
                      className="secondary compact-action"
                      disabled={Boolean(busy)}
                      onClick={() => setEditingEmail('')}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <strong>{member.email}</strong>
                    <small>{member.role === 'admin' ? 'Administrador' : 'Operador'}</small>
                  </div>
                  <div className="member-actions">
                    <div className="member-role-control">
                      <AppSelect
                        value={member.role}
                        options={roleOptions}
                        onValueChange={value =>
                          void updateMember(
                            member.email,
                            member.email,
                            value as 'admin' | 'operator'
                          )
                        }
                        disabled={Boolean(busy)}
                        ariaLabel={`Perfil de ${member.email}`}
                      />
                    </div>
                    <button
                      className="secondary compact-action"
                      disabled={Boolean(busy)}
                      onClick={() => startEdit(member)}
                    >
                      <Pencil size={15} /> Editar
                    </button>
                    <button
                      className="danger-link compact-action"
                      disabled={Boolean(busy)}
                      onClick={() => void removeMember(member)}
                    >
                      <Trash2 size={15} /> Revogar
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (props.embedded) return content;

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">ADMINISTRAÇÃO</p>
          <h2>Usuários</h2>
          <p className="muted">Crie, edite, altere funções ou revogue acessos desta empresa.</p>
        </div>
      </div>
      <div className="panel">{content}</div>
    </section>
  );
}

function StoreAdmin(props: {
  stores: StoreData[];
  onCreated: () => void;
  onEnterStore: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<StoreTemplateSummary[]>([]);

  useEffect(() => {
    api
      .get('/api/superadmin/templates')
      .then(response => {
        const items =
          (response.data as { items?: StoreTemplateSummary[] }).items ?? [];
        setTemplates(sortByName(items));
      })
      .catch(() => setTemplates([]));
  }, []);

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">SUPERADMIN</p>
          <h2>Empresas</h2>
        </div>
      </div>
      <div className="panel">
        <h3>Nova empresa</h3>
        <p className="muted">
          A empresa nasce com a base Vision. Se quiser, selecione um ou mais containers funcionais para já instalar nela.
        </p>
        <CreateStore templates={templates} onCreated={props.onCreated} />
      </div>
      <div className="store-admin-list">
        {sortByName(props.stores).map(store => {
          const members = store.members ?? [];
          return (
            <div className="store-admin-card" key={store.id}>
              <div className="store-admin-head">
                <div className="row-icon">
                  <Store />
                </div>
                <div className="grow">
                  <strong>{store.name}</strong>
                  <small>
                    {members.length} {members.length === 1 ? 'acesso cadastrado' : 'acessos cadastrados'}
                  </small>
                </div>
                <span className="badge">
                  {store.modules.encomendas ? 'Encomendas ativo' : 'Base'}
                </span>
              </div>

              <AccessManager store={store} onUpdated={props.onCreated} embedded />

              <ContainerManager
                store={store}
                templates={templates}
                onUpdated={props.onCreated}
                compact
              />

              <button
                className="primary enter-store"
                onClick={() => props.onEnterStore(store.id)}
              >
                <Store size={18} /> Abrir empresa
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Ingredients(props: {
  storeId: string;
  items: Ingredient[];
  onChanged: () => void;
}) {
  const confirmAction = useConfirm();
  const [form, setForm] = useState({
    name: '',
    unit: 'g',
    packageQty: '1000',
    packageCost: '',
    supplier: '',
  });
  const [errorText, setErrorText] = useState('');
  const [editingId, setEditingId] = useState('');
  const [editForm, setEditForm] = useState({
    name: '',
    unit: 'g',
    packageQty: '',
    packageCost: '',
    supplier: '',
  });
  const [actionMessage, setActionMessage] = useState('');
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const visibleItems = props.items.filter(item => {
    if (!normalizedSearch) return true;
    return [item.name, item.supplier ?? '', item.unit]
      .join(' ')
      .toLocaleLowerCase('pt-BR')
      .includes(normalizedSearch);
  });

  function startEdit(item: Ingredient) {
    setEditingId(item.id);
    setEditForm({
      name: item.name,
      unit: item.unit,
      packageQty: String(item.packageQty),
      packageCost: String(item.packageCost),
      supplier: item.supplier ?? '',
    });
    setActionMessage('');
  }

  async function saveEdit() {
    if (!editingId || !editForm.name.trim()) {
      setActionMessage('Informe o nome do insumo.');
      return;
    }

    try {
      const { data } = await api.put(
        `/api/stores/${props.storeId}/ingredients/${editingId}`,
        {
          ...editForm,
          packageQty: Number(editForm.packageQty),
          packageCost: Number(editForm.packageCost),
        }
      );
      const affectedRecipes =
        Number((data as { affectedRecipes?: number }).affectedRecipes) || 0;
      setActionMessage(
        affectedRecipes > 0
          ? `Insumo atualizado. ${affectedRecipes} receita(s) recalculada(s).`
          : 'Insumo atualizado.'
      );
      setEditingId('');
      props.onChanged();
    } catch {
      setActionMessage('Não foi possível atualizar o insumo.');
    }
  }

  async function save() {
    if (!form.name.trim()) {
      setErrorText('Informe o nome do insumo.');
      return;
    }
    setErrorText('');
    try {
      await api.post(`/api/stores/${props.storeId}/ingredients`, {
        ...form,
        packageQty: Number(form.packageQty),
        packageCost: Number(form.packageCost),
      });
      setForm({
        name: '',
        unit: 'g',
        packageQty: '1000',
        packageCost: '',
        supplier: '',
      });
      props.onChanged();
    } catch {
      setErrorText('Não foi possível cadastrar o insumo.');
    }
  }
  async function remove(id: string) {
    const allowed = await confirmAction({
      title: 'Excluir insumo?',
      message:
        'O insumo será removido do cadastro. Se ele estiver em alguma composição, a linha permanecerá marcada como erro até ser substituída ou removida.',
      confirmLabel: 'Excluir insumo',
      danger: true,
    });
    if (!allowed) return;
    try {
      await api.delete(`/api/stores/${props.storeId}/ingredients/${id}`);
      if (editingId === id) setEditingId('');
      setActionMessage('Insumo excluído.');
      props.onChanged();
    } catch {
      setActionMessage('Não foi possível excluir o insumo.');
    }
  }
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">BASE EXCLUSIVA DA LOJA</p>
          <h2>Insumos</h2>
        </div>
      </div>
      <div className="panel">
        <div className="form-grid">
          <Field label="Insumo">
            <input
              value={form.name}
              onChange={event => setForm({ ...form, name: event.target.value })}
              placeholder="Ex.: Leite condensado"
            />
          </Field>
          <Field label="Unidade de uso">
            <AppSelect
              value={form.unit}
              onValueChange={value => setForm({ ...form, unit: value })}
              options={[
                { value: 'g', label: 'g' },
                { value: 'kg', label: 'kg' },
                { value: 'ml', label: 'ml' },
                { value: 'l', label: 'l' },
                { value: 'un', label: 'un' },
              ]}
            />
          </Field>
          <Field label="Quantidade comprada">
            <input
              type="number"
              value={form.packageQty}
              onChange={event =>
                setForm({ ...form, packageQty: event.target.value })
              }
            />
          </Field>
          <Field label="Valor pago">
            <input
              type="number"
              step="0.01"
              value={form.packageCost}
              onChange={event =>
                setForm({ ...form, packageCost: event.target.value })
              }
              placeholder="0,00"
            />
          </Field>
          <Field label="Fornecedor">
            <input
              value={form.supplier}
              onChange={event =>
                setForm({ ...form, supplier: event.target.value })
              }
              placeholder="Opcional"
            />
          </Field>
        </div>
        <button className="primary" onClick={() => void save()}>
          <Plus size={18} /> Adicionar insumo
        </button>
        {errorText && <div className="error-text">{errorText}</div>}
      </div>
      <div className="list-toolbar">
        <div>
          <strong>{props.items.length} insumos</strong>
          <small>Organizados automaticamente em ordem alfabética</small>
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar insumo"
            aria-label="Buscar insumo"
          />
        </label>
      </div>
      <div className="list professional-list">
        {props.items.length === 0 && (
          <Empty text="Nenhum insumo cadastrado nesta loja." />
        )}
        {props.items.length > 0 && visibleItems.length === 0 && (
          <Empty text="Nenhum insumo encontrado para esta busca." />
        )}
        {visibleItems.map(item => (
          <div className="ingredient-record" key={item.id}>
            <div className="row-card">
              <div className="row-icon">
                <Package />
              </div>
              <div className="grow">
                <strong>{item.name}</strong>
                <small>
                  {money(item.packageCost)} por {item.packageQty} {item.unit} ·{' '}
                  {money(item.unitCost)}/{item.unit}
                  {item.supplier ? ` · ${item.supplier}` : ''}
                </small>
              </div>
              <div className="ingredient-actions">
                <button
                  className="secondary compact-action"
                  onClick={() => startEdit(item)}
                >
                  Editar
                </button>
                <button
                  className="danger-link compact-action"
                  onClick={() => void remove(item.id)}
                >
                  Excluir
                </button>
              </div>
            </div>

            {editingId === item.id && (
              <div className="ingredient-edit-panel">
                <div className="recipe-detail-head">
                  <div>
                    <strong>Editar insumo</strong>
                    <small>
                      Mudanças de custo recalculam as receitas vinculadas.
                    </small>
                  </div>
                  <button
                    className="ghost compact-action"
                    onClick={() => setEditingId('')}
                  >
                    Cancelar
                  </button>
                </div>

                <div className="form-grid">
                  <Field label="Insumo">
                    <input
                      value={editForm.name}
                      onChange={event =>
                        setEditForm({
                          ...editForm,
                          name: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Unidade de uso">
                    <AppSelect
                      value={editForm.unit}
                      onValueChange={value =>
                        setEditForm({
                          ...editForm,
                          unit: value,
                        })
                      }
                      options={[
                        { value: 'g', label: 'g' },
                        { value: 'kg', label: 'kg' },
                        { value: 'ml', label: 'ml' },
                        { value: 'l', label: 'l' },
                        { value: 'un', label: 'un' },
                      ]}
                    />
                  </Field>
                  <Field label="Quantidade comprada">
                    <input
                      type="number"
                      min="0.0001"
                      step="0.01"
                      value={editForm.packageQty}
                      onChange={event =>
                        setEditForm({
                          ...editForm,
                          packageQty: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Valor pago">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.packageCost}
                      onChange={event =>
                        setEditForm({
                          ...editForm,
                          packageCost: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Fornecedor">
                    <input
                      value={editForm.supplier}
                      onChange={event =>
                        setEditForm({
                          ...editForm,
                          supplier: event.target.value,
                        })
                      }
                      placeholder="Opcional"
                    />
                  </Field>
                </div>

                <button
                  className="primary"
                  onClick={() => void saveEdit()}
                >
                  Salvar alterações
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {actionMessage && <div className="notice">{actionMessage}</div>}
    </section>
  );
}

function Recipes(props: {
  storeId: string;
  ingredients: Ingredient[];
  items: Recipe[];
  onChanged: () => void;
}) {
  const confirmAction = useConfirm();
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [yieldQty, setYieldQty] = useState('1');
  const [ingredientId, setIngredientId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [lines, setLines] = useState<
    Array<{ ingredientId: string; quantity: number }>
  >([]);
  const [message, setMessage] = useState('');

  const selectedRecipe = props.items.find(
    recipe => recipe.id === selectedRecipeId
  );

  function resetEditor() {
    setName('');
    setYieldQty('1');
    setIngredientId('');
    setQuantity('');
    setLines([]);
  }

  function startNew() {
    resetEditor();
    setSelectedRecipeId('');
    setCreating(true);
    setEditing(false);
    setMessage('');
  }

  function selectRecipe(id: string) {
    setSelectedRecipeId(id);
    setCreating(false);
    setEditing(false);
    setMessage('');
  }

  function startEdit() {
    if (!selectedRecipe) return;
    setName(selectedRecipe.name);
    setYieldQty(String(selectedRecipe.yieldQty));
    setLines(
      selectedRecipe.items.map(item => ({
        ingredientId: item.ingredientId,
        quantity: item.quantity,
      }))
    );
    setIngredientId('');
    setQuantity('');
    setEditing(true);
    setCreating(false);
    setMessage('');
  }

  function addLine() {
    if (!ingredientId || Number(quantity) <= 0) return;
    setLines(current => [
      ...current,
      { ingredientId, quantity: Number(quantity) },
    ]);
    setIngredientId('');
    setQuantity('');
  }

  function updateLineQuantity(index: number, value: string) {
    const nextQuantity = Math.max(0, Number(value) || 0);
    setLines(current =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, quantity: nextQuantity }
          : line
      )
    );
  }

  function removeLine(index: number) {
    setLines(current => current.filter((_, lineIndex) => lineIndex !== index));
  }

  function validateEditor() {
    if (!name.trim()) {
      setMessage('Informe o nome da receita.');
      return false;
    }
    if (Number(yieldQty) <= 0) {
      setMessage('Informe um rendimento maior que zero.');
      return false;
    }
    if (!lines.length || lines.some(line => line.quantity <= 0)) {
      setMessage('Adicione pelo menos um insumo com quantidade válida.');
      return false;
    }
    return true;
  }

  async function saveNew() {
    if (!validateEditor()) return;
    try {
      const { data } = await api.post(
        `/api/stores/${props.storeId}/recipes`,
        {
          name,
          yieldQty: Number(yieldQty),
          items: lines,
        }
      );
      const created = data as { id?: string };
      setCreating(false);
      setEditing(false);
      setMessage('Receita cadastrada.');
      if (created.id) setSelectedRecipeId(created.id);
      resetEditor();
      props.onChanged();
    } catch {
      setMessage('Não foi possível cadastrar a receita.');
    }
  }

  async function saveEdit() {
    if (!selectedRecipe || !validateEditor()) return;
    try {
      await api.put(
        `/api/stores/${props.storeId}/recipes/${selectedRecipe.id}`,
        {
          name,
          yieldQty: Number(yieldQty),
          items: lines,
        }
      );
      setEditing(false);
      setMessage('Receita atualizada.');
      props.onChanged();
    } catch (cause) {
      const responseData = (
        cause as {
          response?: {
            data?: { message?: string; error?: string } | string;
          };
        }
      ).response?.data;

      const detail =
        typeof responseData === 'string'
          ? responseData
          : responseData?.message || responseData?.error;

      setMessage(
        detail
          ? `Não foi possível salvar: ${detail}`
          : 'Não foi possível salvar a receita. Verifique os insumos e tente novamente.'
      );
    }
  }

  async function removeRecipe() {
    if (!selectedRecipe) return;
    const allowed = await confirmAction({
      title: 'Excluir composição?',
      message: `“${selectedRecipe.name}” e sua precificação vinculada serão removidas. Vendas já registradas serão preservadas.`,
      confirmLabel: 'Excluir composição',
      danger: true,
    });
    if (!allowed) return;

    try {
      await api.delete(
        `/api/stores/${props.storeId}/recipes/${selectedRecipe.id}`
      );
      setSelectedRecipeId('');
      setEditing(false);
      setCreating(false);
      setMessage('Receita excluída.');
      props.onChanged();
    } catch {
      setMessage('Não foi possível excluir a receita.');
    }
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">FICHA TÉCNICA</p>
          <h2>Receita</h2>
        </div>
      </div>

      <div className="panel recipe-selector-panel">
        <div className="recipe-selector-grid">
          <Field label="Selecione a receita">
            <AppSelect
              value={selectedRecipeId}
              onValueChange={selectRecipe}
              placeholder="Escolha uma receita"
              options={props.items.map(recipe => ({
                value: recipe.id,
                label: recipe.name,
              }))}
            />
          </Field>
          <button className="secondary recipe-new-button" onClick={startNew}>
            <Plus size={18} /> Nova receita
          </button>
        </div>
      </div>

      {props.items.length === 0 && !creating && (
        <Empty text="Nenhuma receita cadastrada. Toque em Nova receita para começar." />
      )}

      {creating && (
        <div className="panel recipe-sheet">
          <div className="recipe-sheet-head">
            <div>
              <strong>Nova receita</strong>
              <small>Informe o rendimento e os insumos utilizados.</small>
            </div>
            <button
              className="ghost compact-action"
              onClick={() => {
                setCreating(false);
                resetEditor();
                setMessage('');
              }}
            >
              Cancelar
            </button>
          </div>

          <div className="recipe-main-fields">
            <Field label="Nome da receita">
              <input
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Ex.: Copão Bob Pinga"
              />
            </Field>
            <Field label="Quanto essa receita rende">
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={yieldQty}
                onChange={event => setYieldQty(event.target.value)}
              />
            </Field>
          </div>

          <RecipeEditorTable
            ingredients={props.ingredients}
            lines={lines}
            ingredientId={ingredientId}
            quantity={quantity}
            onIngredientChange={setIngredientId}
            onQuantityChange={setQuantity}
            onAdd={addLine}
            onLineQuantityChange={updateLineQuantity}
            onRemoveLine={removeLine}
          />

          <button className="primary" onClick={() => void saveNew()}>
            <ChefHat size={18} /> Salvar receita
          </button>
        </div>
      )}

      {selectedRecipe && !creating && (
        <div className="panel recipe-sheet">
          <div className="recipe-sheet-head">
            <div>
              <strong>{editing ? 'Editar receita' : selectedRecipe.name}</strong>
              <small>
                {editing
                  ? 'Edite diretamente os dados e a tabela abaixo.'
                  : 'Ficha técnica da receita selecionada.'}
              </small>
            </div>
            <div className="recipe-sheet-actions">
              {editing ? (
                <button
                  className="ghost compact-action"
                  onClick={() => {
                    setEditing(false);
                    setMessage('');
                  }}
                >
                  Cancelar
                </button>
              ) : (
                <>
                  <button
                    className="secondary compact-action"
                    onClick={startEdit}
                  >
                    Editar
                  </button>
                  <button
                    className="danger-link compact-action"
                    onClick={() => void removeRecipe()}
                  >
                    Excluir
                  </button>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <>
              <div className="recipe-main-fields">
                <Field label="Nome da receita">
                  <input
                    value={name}
                    onChange={event => setName(event.target.value)}
                  />
                </Field>
                <Field label="Quanto essa receita rende">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={yieldQty}
                    onChange={event => setYieldQty(event.target.value)}
                  />
                </Field>
              </div>

              <RecipeEditorTable
                ingredients={props.ingredients}
                lines={lines}
                ingredientId={ingredientId}
                quantity={quantity}
                onIngredientChange={setIngredientId}
                onQuantityChange={setQuantity}
                onAdd={addLine}
                onLineQuantityChange={updateLineQuantity}
                onRemoveLine={removeLine}
              />

              <button className="primary" onClick={() => void saveEdit()}>
                Salvar alterações
              </button>
            </>
          ) : (
            <>
              <div className="recipe-summary-grid">
                <div>
                  <span>Rendimento</span>
                  <strong>{selectedRecipe.yieldQty}</strong>
                </div>
                <div>
                  <span>Custo total</span>
                  <strong>{money(selectedRecipe.totalCost)}</strong>
                </div>
                <div>
                  <span>Custo por rendimento</span>
                  <strong>{money(selectedRecipe.unitCost)}</strong>
                </div>
              </div>

              <div className="recipe-table-wrap">
                <div className="recipe-table recipe-table-view">
                  <div className="recipe-table-header">
                    <span>Insumo</span>
                    <span>Quantidade</span>
                    <span>Custo</span>
                  </div>
                  {selectedRecipe.items.map((item, index) => {
                    const missing = !props.ingredients.some(
                      ingredient => ingredient.id === item.ingredientId
                    );
                    return (
                      <div
                        className={`recipe-table-row ${missing ? 'recipe-item-error' : ''}`}
                        key={`${item.ingredientId}-view-${index}`}
                      >
                        <strong>
                          {item.ingredientName}
                          {missing && (
                            <small>Insumo excluído · corrija esta linha</small>
                          )}
                        </strong>
                        <span>
                          {item.quantity} {item.unit}
                        </span>
                        <span>{missing ? 'Revisar' : money(item.cost)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {message && <div className="notice">{message}</div>}
    </section>
  );
}

function RecipeEditorTable(props: {
  ingredients: Ingredient[];
  lines: Array<{ ingredientId: string; quantity: number }>;
  ingredientId: string;
  quantity: string;
  onIngredientChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onAdd: () => void;
  onLineQuantityChange: (index: number, value: string) => void;
  onRemoveLine: (index: number) => void;
}) {
  return (
    <div className="recipe-table-wrap">
      <div className="recipe-table recipe-table-edit">
        <div className="recipe-table-header">
          <span>Insumo</span>
          <span>Quantidade</span>
          <span>Custo</span>
          <span>Ação</span>
        </div>

        {props.lines.map((line, index) => {
          const ingredient = props.ingredients.find(
            item => item.id === line.ingredientId
          );
          const cost = (ingredient?.unitCost ?? 0) * line.quantity;
          return (
            <div
              className="recipe-table-row"
              key={`${line.ingredientId}-edit-${index}`}
            >
              <strong className={!ingredient ? 'missing-ingredient-label' : ''}>
                {ingredient?.name ??
                  'Insumo excluído · remova ou substitua esta linha'}
              </strong>
              <div className="recipe-qty-input">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={line.quantity}
                  onChange={event =>
                    props.onLineQuantityChange(index, event.target.value)
                  }
                />
                <small>{ingredient?.unit ?? ''}</small>
              </div>
              <span>{money(cost)}</span>
              <button
                className="danger-link compact-action"
                onClick={() => props.onRemoveLine(index)}
              >
                Remover
              </button>
            </div>
          );
        })}

        <div className="recipe-table-add-row">
          <AppSelect
            value={props.ingredientId}
            onValueChange={props.onIngredientChange}
            placeholder="Adicionar insumo"
            options={props.ingredients.map(ingredient => ({
              value: ingredient.id,
              label: `${ingredient.name} (${ingredient.unit})`,
            }))}
          />
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={props.quantity}
            onChange={event => props.onQuantityChange(event.target.value)}
            placeholder="Quantidade"
          />
          <span />
          <button className="secondary compact-action" onClick={props.onAdd}>
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
function Pricing(props: {
  store: StoreData;
  storeId: string;
  recipes: Recipe[];
  items: Product[];
  onChanged: () => void;
}) {
  type PricingDraft = {
    porta: string;
    ifood: string;
    '99': string;
  };

  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [draft, setDraft] = useState<PricingDraft>({
    porta: '0',
    ifood: '0',
    '99': '0',
  });
  const [message, setMessage] = useState('');

  const selectedRecipe = props.recipes.find(
    recipe => recipe.id === selectedRecipeId
  );
  const selectedProduct = props.items.find(
    item => item.recipeId === selectedRecipeId
  );

  useEffect(() => {
    if (!selectedRecipeId) {
      setDraft({ porta: '0', ifood: '0', '99': '0' });
      return;
    }

    const product = props.items.find(
      item => item.recipeId === selectedRecipeId
    );
    setDraft({
      porta: String(product?.prices.porta ?? 0),
      ifood: String(product?.prices.ifood ?? 0),
      '99': String(product?.prices['99'] ?? 0),
    });
    setMessage('');
  }, [selectedRecipeId, props.items]);

  const productionCost =
    selectedProduct?.cost ?? selectedRecipe?.unitCost ?? 0;

  function costRate(channel: 'porta' | 'ifood' | '99') {
    const cfg = props.store.channels[channel];
    const cardPct = channel === 'porta' ? cfg.cardPct : 0;
    return (
      cfg.platformPct +
      cardPct +
      cfg.monthlyPct +
      props.store.reserves.generalPct +
      props.store.reserves.cashPct
    ) / 100;
  }

  function promoCost(channel: 'porta' | 'ifood' | '99') {
    const cfg = props.store.channels[channel];
    return cfg.promoEnabled ? cfg.promoFee : 0;
  }

  function profitFor(channel: 'porta' | 'ifood' | '99', price: number) {
    if (price <= 0) return null;
    return (
      price -
      productionCost -
      price * costRate(channel) -
      promoCost(channel)
    );
  }

  function portaSuggested() {
    const cfg = props.store.channels.porta;
    const portaRate =
      (cfg.platformPct + cfg.cardPct + cfg.monthlyPct) / 100;
    const denominator = 1 - portaRate - cfg.profitPct / 100;
    if (denominator <= 0) return null;
    return (productionCost + promoCost('porta')) / denominator;
  }

  function suggestedFor(channel: 'porta' | 'ifood' | '99') {
    if (channel === 'porta') return portaSuggested();

    if (channel === 'ifood') {
      const basePorta = portaSuggested();
      if (basePorta === null) return null;
      const cfg = props.store.channels.ifood;
      const ifoodRate =
        (cfg.platformPct +
          cfg.monthlyPct +
          props.store.reserves.generalPct +
          props.store.reserves.cashPct) /
        100;
      const denominator = 1 - ifoodRate;
      if (denominator <= 0) return null;
      return (basePorta + promoCost('ifood')) / denominator;
    }

    const cfg = props.store.channels[channel];
    const denominator = 1 - costRate(channel) - cfg.profitPct / 100;
    if (denominator <= 0) return null;
    return (productionCost + promoCost(channel)) / denominator;
  }

  const originalPrices = {
    porta: selectedProduct?.prices.porta ?? 0,
    ifood: selectedProduct?.prices.ifood ?? 0,
    '99': selectedProduct?.prices['99'] ?? 0,
  };

  const hasChanges =
    Boolean(selectedRecipe) &&
    (Number(draft.porta) !== originalPrices.porta ||
      Number(draft.ifood) !== originalPrices.ifood ||
      Number(draft['99']) !== originalPrices['99']);

  function updateDraft(field: keyof PricingDraft, value: string) {
    setDraft(current => ({ ...current, [field]: value }));
    setMessage('');
  }

  async function save() {
    if (!selectedRecipe || !hasChanges) return;

    const payload = {
      name: selectedRecipe.name,
      recipeId: selectedRecipe.id,
      manualCost: selectedProduct?.manualCost ?? 0,
      packagingCost: selectedProduct?.packagingCost ?? 0,
      prices: {
        porta: Math.max(0, Number(draft.porta) || 0),
        ifood: Math.max(0, Number(draft.ifood) || 0),
        '99': Math.max(0, Number(draft['99']) || 0),
        encomenda: selectedProduct?.prices.encomenda ?? 0,
      },
    };

    try {
      if (selectedProduct) {
        await api.put(
          `/api/stores/${props.storeId}/products/${selectedProduct.id}`,
          payload
        );
      } else {
        await api.post(`/api/stores/${props.storeId}/products`, payload);
      }
      setMessage(`${selectedRecipe.name}: preços salvos.`);
      props.onChanged();
    } catch {
      setMessage(
        `${selectedRecipe.name}: não foi possível salvar a precificação.`
      );
    }
  }

  const pricingChannels: Array<{
    key: 'porta' | 'ifood' | '99';
    label: string;
  }> = [
    { key: 'porta', label: 'Porta' },
    { key: 'ifood', label: 'iFood' },
    { key: '99', label: '99' },
  ];

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">CUSTO E PREÇO DE VENDA</p>
          <h2>Precificação</h2>
        </div>
      </div>

      {props.recipes.length === 0 ? (
        <Empty text="Cadastre uma receita antes de fazer a precificação." />
      ) : (
        <>
          <div className="panel pricing-selector">
            <Field label="Selecione o produto">
              <AppSelect
                value={selectedRecipeId}
                onValueChange={setSelectedRecipeId}
                placeholder="Escolha um produto"
                options={props.recipes.map(recipe => ({
                  value: recipe.id,
                  label: recipe.name,
                }))}
              />
            </Field>
          </div>

          {selectedRecipe && (
            <div className="panel pricing-detail">
              <div className="pricing-product-name">
                <strong>{selectedRecipe.name}</strong>
                <small>Rendimento da receita: {selectedRecipe.yieldQty}</small>
              </div>

              <div className="pricing-summary pricing-summary-single">
                <div>
                  <span>Custo Produção</span>
                  <strong>{money(productionCost)}</strong>
                </div>
              </div>

              <div className="pricing-channel-list">
                {pricingChannels.map(channel => {
                  const value = draft[channel.key];
                  const cfg = props.store.channels[channel.key];
                  const profit = profitFor(channel.key, Number(value) || 0);
                  const suggested = suggestedFor(channel.key);

                  return (
                    <div className="pricing-channel-row" key={channel.key}>
                      <Field label={`Preço ${channel.label}`}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={value}
                          onChange={event =>
                            updateDraft(channel.key, event.target.value)
                          }
                        />
                      </Field>

                      <div className="pricing-profit-box">
                        <span>Preço mínimo sugerido</span>
                        <strong>
                          {suggested === null ? 'Revisar taxas' : money(suggested)}
                        </strong>
                        <small>
                          {channel.key === 'ifood'
                            ? `Base Porta + taxas iFood · lucro aplicado na Porta: ${props.store.channels.porta.profitPct}%`
                            : `Lucro alvo: ${cfg.profitPct}%`}
                        </small>
                      </div>

                      <div className="pricing-profit-box">
                        <span>Lucro real</span>
                        <strong
                          className={
                            profit === null
                              ? ''
                              : profit >= 0
                                ? 'profit-positive'
                                : 'profit-negative'
                          }
                        >
                          {profit === null ? '—' : money(profit)}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasChanges && (
                <button className="primary" onClick={() => void save()}>
                  <Calculator size={18} /> Salvar
                </button>
              )}
            </div>
          )}
        </>
      )}

      {message && <div className="notice">{message}</div>}
    </section>
  );
}

function Catalog(props: { recipes: Recipe[]; products: Product[] }) {
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
  const allRows = sortByName(props.recipes).map(recipe => ({
    id: recipe.id,
    name: recipe.name,
    product: props.products.find(product => product.recipeId === recipe.id),
  }));
  const rows = allRows.filter(row =>
    row.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
  );

  const price = (value?: number) =>
    value && value > 0 ? money(value) : '—';

  return (
    <section className="catalog-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">CONSULTA RÁPIDA</p>
          <h2>Cardápio</h2>
        </div>
      </div>

      <div className="panel catalog-panel">
        <div className="catalog-summary">
          <div>
            <strong>{allRows.length} produtos</strong>
            <small>Preços cadastrados na Precificação · somente consulta</small>
          </div>
          <label className="search-box catalog-search">
            <Search size={17} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar produto"
              aria-label="Buscar produto no cardápio"
            />
          </label>
        </div>

        {allRows.length === 0 ? (
          <Empty text="Nenhum produto cadastrado nesta empresa." />
        ) : rows.length === 0 ? (
          <Empty text="Nenhum produto encontrado para esta busca." />
        ) : (
          <div className="catalog-table" role="table" aria-label="Cardápio e preços por canal">
            <div className="catalog-row catalog-header" role="row">
              <span role="columnheader">Produto</span>
              <span role="columnheader">Porta</span>
              <span role="columnheader">99</span>
              <span role="columnheader">iFood</span>
            </div>
            {rows.map(row => (
              <div className="catalog-row" role="row" key={row.id}>
                <strong role="cell" title={row.name}>{row.name}</strong>
                <span role="cell">{price(row.product?.prices.porta)}</span>
                <span role="cell">{price(row.product?.prices['99'])}</span>
                <span role="cell">{price(row.product?.prices.ifood)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Sales(props: {
  store: StoreData;
  products: Product[];
  onSaved: () => Promise<void> | void;
}) {
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [cart, setCart] = useState<
    Array<{ productId: string; quantity: number }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const availableProducts = props.products.filter(product => Boolean(product.recipeId));

  function add() {
    if (!productId) return;
    setCart([
      ...cart,
      { productId, quantity: Math.max(1, Number(quantity) || 1) },
    ]);
    setProductId('');
    setQuantity('1');
  }

  async function save() {
    if (!cart.length) {
      setErrorText('Adicione pelo menos um produto.');
      return;
    }
    setSaving(true);
    setErrorText('');
    try {
      await api.post(`/api/stores/${props.store.id}/sales`, {
        paymentMethod,
        items: cart,
      });
      setCart([]);
      await props.onSaved();
    } catch {
      setErrorText('Não foi possível registrar a venda.');
    } finally {
      setSaving(false);
    }
  }

  const gross = cart.reduce((total, line) => {
    const product = props.products.find(item => item.id === line.productId);
    return total + (product?.prices.porta ?? 0) * line.quantity;
  }, 0);

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">REGISTRO RÁPIDO</p>
          <h2>Nova venda</h2>
        </div>
      </div>
      <div className="panel">
        <div className="info-card sale-channel-note">
          <strong>Venda Porta</strong> — registre aqui somente vendas feitas fora
          das plataformas de delivery, como balcão, WhatsApp e Instagram.
        </div>
        <Field label="Pagamento">
          <AppSelect
            value={paymentMethod}
            onValueChange={setPaymentMethod}
            options={[
              { value: 'pix', label: 'PIX' },
              { value: 'dinheiro', label: 'Dinheiro' },
              { value: 'debito', label: 'Débito' },
              { value: 'credito', label: 'Crédito' },
            ]}
          />
        </Field>
        <div className="recipe-line">
          <AppSelect
            value={productId}
            onValueChange={setProductId}
            placeholder="Escolha um produto"
            options={availableProducts.map(product => ({
              value: product.id,
              label: `${product.name} · ${money(product.prices.porta)}`,
            }))}
          />
          <input
            type="number"
            min="1"
            value={quantity}
            onChange={event => setQuantity(event.target.value)}
          />
          <button className="secondary" onClick={add}>
            Adicionar
          </button>
        </div>
        <div className="cart">
          {cart.map((line, index) => {
            const product = props.products.find(
              item => item.id === line.productId
            );
            return (
              <div key={`${line.productId}-${index}`}>
                <span>
                  {line.quantity}× {product?.name}
                </span>
                <b>{money((product?.prices.porta ?? 0) * line.quantity)}</b>
                <button
                  onClick={() => setCart(cart.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </div>
            );
          })}
          {!cart.length && <Empty text="Adicione os itens desta venda." />}
        </div>
        <div className="sale-total">
          <span>Total</span>
          <strong>{money(gross)}</strong>
        </div>
        <button
          className="primary big"
          onClick={() => void save()}
          disabled={saving}
        >
          <ShoppingCart size={19} /> Registrar venda
        </button>
        {errorText && <div className="error-text">{errorText}</div>}
      </div>
    </section>
  );
}

function SalesHistory(props: { storeId: string; onDeleted: () => void }) {
  const confirmAction = useConfirm();
  const [mode, setMode] = useState<'day' | 'period'>('day');
  const [day, setDay] = useState(today);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [data, setData] = useState<SaleHistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');

  function isoBoundary(value: string, isEnd: boolean) {
    return new Date(
      `${value}T${isEnd ? '23:59:59.999' : '00:00:00.000'}`
    ).toISOString();
  }

  async function loadHistory() {
    const from = mode === 'day' ? day : start;
    const to = mode === 'day' ? day : end;

    if (!from || !to) {
      setErrorText('Selecione a data da consulta.');
      return;
    }
    if (from > to) {
      setErrorText('A data inicial não pode ser maior que a data final.');
      return;
    }

    setLoading(true);
    setErrorText('');
    try {
      const startAt = encodeURIComponent(isoBoundary(from, false));
      const endAt = encodeURIComponent(isoBoundary(to, true));
      const { data: response } = await api.get(
        `/api/stores/${props.storeId}/sales?startAt=${startAt}&endAt=${endAt}`
      );
      setData(response as SaleHistoryData);
    } catch {
      setErrorText('Não foi possível carregar o histórico de vendas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [props.storeId]);

  async function removeSale(id: string) {
    const allowed = await confirmAction({
      title: 'Excluir venda?',
      message:
        'Esta venda deixará de aparecer no Histórico e também deixará de compor os resultados financeiros.',
      confirmLabel: 'Excluir venda',
      danger: true,
    });
    if (!allowed) return;
    try {
      await api.delete(`/api/stores/${props.storeId}/sales/${id}`);
      await loadHistory();
      props.onDeleted();
    } catch {
      setErrorText('Não foi possível excluir a venda.');
    }
  }

  const paymentLabel: Record<string, string> = {
    pix: 'PIX',
    dinheiro: 'Dinheiro',
    debito: 'Débito',
    credito: 'Crédito',
  };

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">CONSULTA DE VENDAS</p>
          <h2>Histórico de vendas</h2>
        </div>
      </div>

      <div className="panel history-filter-panel">
        <div className="history-mode">
          <button
            className={mode === 'day' ? 'selected' : ''}
            onClick={() => setMode('day')}
          >
            Um dia
          </button>
          <button
            className={mode === 'period' ? 'selected' : ''}
            onClick={() => setMode('period')}
          >
            Período
          </button>
        </div>

        {mode === 'day' ? (
          <div className="history-filter-row single">
            <Field label="Data">
              <input
                type="date"
                value={day}
                onChange={event => setDay(event.target.value)}
              />
            </Field>
            <button className="primary" onClick={() => void loadHistory()}>
              Consultar
            </button>
          </div>
        ) : (
          <div className="history-filter-row">
            <Field label="De">
              <input
                type="date"
                value={start}
                onChange={event => setStart(event.target.value)}
              />
            </Field>
            <Field label="Até">
              <input
                type="date"
                value={end}
                onChange={event => setEnd(event.target.value)}
              />
            </Field>
            <button className="primary" onClick={() => void loadHistory()}>
              Consultar
            </button>
          </div>
        )}
      </div>

      {errorText && <div className="error-text">{errorText}</div>}

      {loading ? (
        <div className="panel history-loading">Carregando vendas...</div>
      ) : (
        <>
          <div className="history-summary">
            <div>
              <span>Vendas</span>
              <strong>{data?.count ?? 0}</strong>
            </div>
            <div>
              <span>Total vendido</span>
              <strong>{money(data?.gross ?? 0)}</strong>
            </div>
          </div>

          <div className="history-list">
            {!data?.items.length && (
              <Empty text="Nenhuma venda encontrada para a data selecionada." />
            )}

            {data?.items.map(sale => (
              <article className="history-sale" key={sale.id}>
                <div className="history-sale-head">
                  <div>
                    <strong>
                      {new Date(sale.createdAt).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </strong>
                    <small>
                      {paymentLabel[sale.paymentMethod] ?? sale.paymentMethod} ·{' '}
                      {sale.channel === 'porta' ? 'Porta' : sale.channel}
                    </small>
                  </div>
                  <div className="history-sale-actions"><strong>{money(sale.gross)}</strong><button className="danger-link compact-action" onClick={() => void removeSale(sale.id)}>Excluir</button></div>
                </div>

                <div className="history-items">
                  {sale.items.map((item, index) => (
                    <div
                      className="history-item"
                      key={`${sale.id}-${item.productName}-${index}`}
                    >
                      <span>
                        {item.quantity}× {item.productName}
                      </span>
                      <b>{money(item.revenue)}</b>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          {data?.truncated && (
            <div className="notice">
              A consulta mostra até 200 vendas do período selecionado.
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Finance(props: {
  data: FinanceData | null;
  start: string;
  end: string;
  onStart: (value: string) => void;
  onEnd: (value: string) => void;
  onRun: () => void;
}) {
  const data = props.data;
  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">FECHAMENTO GERENCIAL</p>
          <h2>Financeiro</h2>
        </div>
      </div>
      <div className="panel compact">
        <div className="date-row">
          <Field label="De">
            <input
              type="date"
              value={props.start}
              onChange={event => props.onStart(event.target.value)}
            />
          </Field>          <Field label="Até">
            <input
              type="date"
              value={props.end}
              onChange={event => props.onEnd(event.target.value)}
            />
          </Field>
          <button className="primary" onClick={props.onRun}>
            Calcular
          </button>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric hero">
          <span>Faturamento</span>
          <strong>{money(data?.gross ?? 0)}</strong>
          <small>{data?.count ?? 0} vendas</small>
        </div>
        <div className="metric">
          <span>Material / produção</span>
          <strong>{money(data?.productCost ?? 0)}</strong>
        </div>
        <div className="metric">
          <span>Taxas do canal</span>
          <strong>{money(data?.fees ?? 0)}</strong>
        </div>
        <div className="metric">
          <span>Mensalidade proporcional</span>
          <strong>{money(data?.monthlyFees ?? 0)}</strong>
        </div>
        <div className="metric">
          <span>Promoção Inteligente</span>
          <strong>{money(data?.promoFees ?? 0)}</strong>
        </div>
        <div className="metric">
          <span>Gastos incalculáveis e despesas</span>
          <strong>{money(data?.generalReserve ?? 0)}</strong>
        </div>
        <div className="metric">
          <span>Reserva caixa</span>
          <strong>{money(data?.cashReserve ?? 0)}</strong>
        </div>
        <div className="metric result">
          <span>Lucro Estimado</span>
          <strong>{money(data?.estimatedProfit ?? 0)}</strong>
        </div>
      </div>
      {data && (
        <div className="info-card finance-tax-note">
          O fechamento usa as taxas atualmente salvas na aba Taxas. O Lucro (%)
          configurado é meta de precificação e não é descontado como despesa.
        </div>
      )}
      {data?.truncated && (
        <div className="notice">
          Este fechamento mostra as 200 vendas mais recentes do período. A
          paginação completa entra na próxima evolução.
        </div>
      )}
    </section>
  );
}

function Configuration(props: {
  store: StoreData;
  canStructure: boolean;
  onUpdated: () => Promise<void> | void;
}) {
  const [store, setStore] = useState(props.store);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setStore(props.store);
  }, [props.store]);

  function updateReserve(
    key: 'generalPct' | 'cashPct',
    value: number
  ) {
    setStore(current => ({
      ...current,
      reserves: {
        ...current.reserves,
        [key]: Math.max(0, value || 0),
      },
    }));
  }

  function updateChannel(
    key: 'porta' | 'ifood' | '99',
    patch: Partial<ChannelConfig>
  ) {
    setStore(current => ({
      ...current,
      channels: {
        ...current.channels,
        [key]: {
          ...current.channels[key],
          ...patch,
        },
      },
    }));
  }

  async function save() {
    try {
      await api.put(`/api/stores/${store.id}/settings`, store);
      setMessage('Taxas salvas e aplicadas à precificação.');
      await props.onUpdated();
    } catch {
      setMessage('Não foi possível salvar as taxas.');
    }
  }

  const porta = store.channels.porta;
  const ifood = store.channels.ifood;
  const ninetyNine = store.channels['99'];

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">CONFIGURAÇÃO DE CÁLCULO</p>
          <h2>Taxas</h2>
        </div>
      </div>

      {props.canStructure ? (
        <>
          <div className="panel">
            <h3>Reservas da loja</h3>
            <div className="tax-reserve-grid">
              <Field label="Gastos incalculáveis e despesas (%)">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={store.reserves.generalPct}
                  onChange={event =>
                    updateReserve('generalPct', Number(event.target.value))
                  }
                />
              </Field>
              <Field label="Reserva fluxo de caixa (%)">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={store.reserves.cashPct}
                  onChange={event =>
                    updateReserve('cashPct', Number(event.target.value))
                  }
                />
              </Field>
            </div>
          </div>

          <div className="tax-channel-grid">
            <div className="panel tax-channel-card">
              <div className="tax-channel-head">
                <strong>Porta</strong>
                <small>Venda direta</small>
              </div>
              <div className="tax-fields">
                <Field label="Taxa da maquininha/cartão (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={porta.cardPct}
                    onChange={event =>
                      updateChannel('porta', {
                        cardPct: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                </Field>
                <Field label="Lucro (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={porta.profitPct}
                    onChange={event =>
                      updateChannel('porta', {
                        profitPct: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                  />
                </Field>
              </div>
            </div>

            <div className="panel tax-channel-card">
              <div className="tax-channel-head">
                <strong>iFood</strong>
                <small>Delivery</small>
              </div>
              <div className="tax-fields">
                <Field label="Taxa da plataforma (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ifood.platformPct}
                    onChange={event =>
                      updateChannel('ifood', {
                        platformPct: Math.max(
                          0,
                          Number(event.target.value) || 0
                        ),
                      })
                    }
                  />
                </Field>

                <label className="tax-promo-toggle">
                  <input
                    type="checkbox"
                    checked={ifood.promoEnabled}
                    onChange={event =>
                      updateChannel('ifood', {
                        promoEnabled: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Promoção Inteligente</strong>
                    <small>
                      {money(ifood.promoFee)} adicional quando aplicada
                    </small>
                  </span>
                </label>

                <Field label="Mensalidade (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={ifood.monthlyPct}
                    onChange={event =>
                      updateChannel('ifood', {
                        monthlyPct: Math.max(
                          0,
                          Number(event.target.value) || 0
                        ),
                      })
                    }
                  />
                </Field>

                <Field label="Lucro (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={ifood.profitPct}
                    onChange={event =>
                      updateChannel('ifood', {
                        profitPct: Math.max(
                          0,
                          Number(event.target.value) || 0
                        ),
                      })
                    }
                  />
                </Field>
              </div>
            </div>

            <div className="panel tax-channel-card">
              <div className="tax-channel-head">
                <strong>99</strong>
                <small>Delivery</small>
              </div>
              <div className="tax-fields">
                <Field label="Taxa da plataforma (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ninetyNine.platformPct}
                    onChange={event =>
                      updateChannel('99', {
                        platformPct: Math.max(
                          0,
                          Number(event.target.value) || 0
                        ),
                      })
                    }
                  />
                </Field>

                <label className="tax-promo-toggle">
                  <input
                    type="checkbox"
                    checked={ninetyNine.promoEnabled}
                    onChange={event =>
                      updateChannel('99', {
                        promoEnabled: event.target.checked,
                      })
                    }
                  />
                  <span>
                    <strong>Promoção Inteligente</strong>
                    <small>
                      {money(ninetyNine.promoFee)} adicional quando aplicada
                    </small>
                  </span>
                </label>

                <Field label="Mensalidade (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={ninetyNine.monthlyPct}
                    onChange={event =>
                      updateChannel('99', {
                        monthlyPct: Math.max(
                          0,
                          Number(event.target.value) || 0
                        ),
                      })
                    }
                  />
                </Field>

                <Field label="Lucro (%)">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={ninetyNine.profitPct}
                    onChange={event =>
                      updateChannel('99', {
                        profitPct: Math.max(
                          0,
                          Number(event.target.value) || 0
                        ),
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          </div>

          <button className="primary tax-save" onClick={() => void save()}>
            <Settings size={18} /> Salvar taxas
          </button>
        </>
      ) : (
        <div className="info-card">
          As taxas da loja são configuradas pelo Administrador.
        </div>
      )}

      {message && <div className="notice">{message}</div>}
    </section>
  );
}

function Appearance(props: {
  store: StoreData;
  canEdit: boolean;
  onUpdated: () => void;
  onPreview: () => void;
}) {
  const confirmAction = useConfirm();
  const fallback = {
    theme: 'light' as const,
    primary: '#111827',
    accent: '#2563eb',
    fontSize: 'normal' as const,
  };
  const [visual, setVisual] = useState(props.store.visual ?? fallback);
  const [message, setMessage] = useState('');
  const [detectedPalette, setDetectedPalette] = useState<{
    primary: string;
    accent: string;
  } | null>(null);

  useEffect(() => setVisual(props.store.visual ?? fallback), [props.store]);

  function fileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Falha ao ler imagem.'));
      reader.readAsDataURL(file);
    });
  }

  function rgbHex(red: number, green: number, blue: number) {
    return `#${[red, green, blue]
      .map(value => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0'))
      .join('')}`;
  }

  function colorDistance(
    first: { red: number; green: number; blue: number },
    second: { red: number; green: number; blue: number }
  ) {
    return Math.sqrt(
      (first.red - second.red) ** 2 +
        (first.green - second.green) ** 2 +
        (first.blue - second.blue) ** 2
    );
  }

  async function extractPalette(dataUrl: string) {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Imagem inválida.'));
      image.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = 72;
    canvas.height = 72;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Não foi possível analisar as cores.');
    context.clearRect(0, 0, 72, 72);
    context.drawImage(image, 0, 0, 72, 72);

    const pixels = context.getImageData(0, 0, 72, 72).data;
    const buckets = new Map<
      string,
      { red: number; green: number; blue: number; count: number; saturation: number }
    >();

    for (let index = 0; index < pixels.length; index += 16) {
      const alpha = pixels[index + 3];
      if (alpha < 150) continue;
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const maximum = Math.max(red, green, blue);
      const minimum = Math.min(red, green, blue);
      const saturation = maximum - minimum;
      const brightness = (red + green + blue) / 3;
      if (brightness > 244 && saturation < 18) continue;

      const quantize = (value: number) => Math.min(255, Math.round(value / 32) * 32);
      const qr = quantize(red);
      const qg = quantize(green);
      const qb = quantize(blue);
      const key = `${qr}-${qg}-${qb}`;
      const current = buckets.get(key);
      if (current) {
        current.red += red;
        current.green += green;
        current.blue += blue;
        current.count += 1;
        current.saturation += saturation;
      } else {
        buckets.set(key, {
          red,
          green,
          blue,
          count: 1,
          saturation,
        });
      }
    }

    const colors = [...buckets.values()]
      .map(bucket => ({
        red: bucket.red / bucket.count,
        green: bucket.green / bucket.count,
        blue: bucket.blue / bucket.count,
        count: bucket.count,
        saturation: bucket.saturation / bucket.count,
      }))
      .sort(
        (first, second) =>
          second.count * (1 + second.saturation / 180) -
          first.count * (1 + first.saturation / 180)
      );

    if (!colors.length) return { primary: fallback.primary, accent: fallback.accent };

    const colorful = colors.filter(color => color.saturation >= 28);
    const primaryColor = colorful[0] ?? colors[0];
    const accentColor =
      colorful.find(color => colorDistance(primaryColor, color) >= 85) ??
      colors.find(color => colorDistance(primaryColor, color) >= 110);

    const primary = rgbHex(primaryColor.red, primaryColor.green, primaryColor.blue);
    let accent: string;
    if (accentColor) {
      accent = rgbHex(accentColor.red, accentColor.green, accentColor.blue);
    } else {
      const average = (primaryColor.red + primaryColor.green + primaryColor.blue) / 3;
      const factor = average > 145 ? 0.58 : 1.45;
      accent = rgbHex(
        primaryColor.red * factor,
        primaryColor.green * factor,
        primaryColor.blue * factor
      );
    }

    return { primary, accent };
  }

  async function save(next = visual, refresh = true) {
    if (!props.canEdit) return false;
    try {
      await api.put(`/api/stores/${props.store.id}/visual`, { visual: next });
      setMessage('Aparência salva para esta loja.');
      if (refresh) props.onUpdated();
      return true;
    } catch {
      setMessage('Não foi possível salvar a aparência.');
      return false;
    }
  }

  async function applyPalette(palette = detectedPalette) {
    if (!palette) return;
    const next = { ...visual, ...palette };
    setVisual(next);
    if (await save(next, false)) {
      setMessage('Paleta do logo aplicada e salva para toda a loja.');
      props.onUpdated();
    }
  }

  async function applyCurrentLogoPalette() {
    if (!props.canEdit) return;
    if (!props.store.logoUrl) {
      setMessage('Esta loja ainda não possui logo cadastrado.');
      return;
    }

    setMessage('Lendo o logo atual e calculando a paleta...');
    try {
      const { data } = await api.get(
        `/api/stores/${props.store.id}/logo-source`
      );
      const source = data as { base64?: string; contentType?: string };
      if (!source.base64 || !source.contentType)
        throw new Error('Logo atual indisponível.');

      const palette = await extractPalette(
        `data:${source.contentType};base64,${source.base64}`
      );
      setDetectedPalette(palette);
      const next = { ...visual, ...palette };
      setVisual(next);
      if (await save(next, false)) {
        setMessage(
          'Cores extraídas do logo atual e aplicadas em toda a interface desta loja.'
        );
        props.onUpdated();
      }
    } catch {
      setMessage('Não foi possível extrair as cores do logo atual.');
    }
  }

  async function uploadLogo(file: File) {
    if (!props.canEdit) return;
    setMessage('Analisando o logo...');
    try {
      const dataUrl = await fileAsDataUrl(file);
      const palette = await extractPalette(dataUrl);
      const base64 = dataUrl.split(',')[1] ?? '';
      await api.post(`/api/stores/${props.store.id}/logo`, {
        base64,
        contentType: file.type,
      });
      setDetectedPalette(palette);

      if (
        await confirmAction({
          title: 'Aplicar paleta do logo?',
          message:
            'O sistema identificou as cores dominantes do novo logo. Deseja aplicá-las agora na identidade visual desta empresa?',
          confirmLabel: 'Aplicar paleta',
        })
      ) {
        const next = { ...visual, ...palette };
        setVisual(next);
        if (await save(next, false)) {
          setMessage('Logo e paleta aplicados e salvos para toda a loja.');
        }
      } else {
        setMessage('Logo atualizado. A paleta detectada ficou disponível para aplicar abaixo.');
      }
      props.onUpdated();
    } catch {
      setMessage('Não foi possível atualizar o logo ou analisar a paleta.');
    }
  }

  if (!props.canEdit) {
    return (
      <section>
        <div className="section-head">
          <div>
            <p className="eyebrow">VISUAL DA LOJA</p>
            <h2>Configurações</h2>
          </div>
        </div>
        <div className="info-card">A aparência desta loja não pode ser alterada por este acesso.</div>
      </section>
    );
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">VISUAL DA LOJA</p>
          <h2>Configurações</h2>
        </div>
      </div>

      <div className="panel real-store-preview">
        <div>
          <strong>Visualizar página atual da loja</strong>
          <small>
            Abre a interface real desta loja com os dados, logo, cores, fonte e modo
            que estão salvos agora. Não é uma amostra genérica.
          </small>
        </div>
        <button className="primary" onClick={props.onPreview}>
          Visualizar como a loja está agora
        </button>
      </div>

      <div className="panel appearance-grid">
        <Field label="Modo">
          <AppSelect
            value={visual.theme}
            onValueChange={value =>
              setVisual({
                ...visual,
                theme: value as 'light' | 'dark',
              })
            }
            options={[
              { value: 'light', label: 'Claro' },
              { value: 'dark', label: 'Escuro' },
            ]}
          />
        </Field>
        <Field label="Cor principal">
          <input
            type="color"
            value={visual.primary}
            onChange={event => setVisual({ ...visual, primary: event.target.value })}
          />
        </Field>
        <Field label="Cor de destaque">
          <input
            type="color"
            value={visual.accent}
            onChange={event => setVisual({ ...visual, accent: event.target.value })}
          />
        </Field>
        <Field label="Tamanho das letras">
          <AppSelect
            value={visual.fontSize}
            onValueChange={value =>
              setVisual({
                ...visual,
                fontSize: value as typeof visual.fontSize,
              })
            }
            options={[
              { value: 'small', label: 'Pequeno' },
              { value: 'normal', label: 'Normal' },
              { value: 'large', label: 'Grande' },
              { value: 'xlarge', label: 'Muito grande' },
            ]}
          />
        </Field>
        <label className="upload-button">
          Substituir logo
          <input
            type="file"
            accept="image/*"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void uploadLogo(file);
            }}
          />
        </label>
      </div>

      <div className="panel detected-palette">
        <div>
          <strong>Usar as cores do logo atual</strong>
          <small>
            Lê o logo que já está salvo nesta loja, identifica as cores dominantes
            e aplica a identidade visual somente neste ambiente.
          </small>
        </div>
        <button
          className="primary"
          disabled={!props.store.logoUrl}
          onClick={() => void applyCurrentLogoPalette()}
        >
          Aplicar cores do logo atual
        </button>
        {!props.store.logoUrl && (
          <small>Adicione um logo primeiro para liberar esta função.</small>
        )}
      </div>

      {detectedPalette && (
        <div className="panel detected-palette">
          <div>
            <strong>Paleta detectada no logo</strong>
            <small>Você pode aplicar novamente sem precisar reenviar a imagem.</small>
          </div>
          <div className="palette-swatches">
            <span style={{ background: detectedPalette.primary }} title={detectedPalette.primary} />
            <span style={{ background: detectedPalette.accent }} title={detectedPalette.accent} />
            <code>{detectedPalette.primary}</code>
            <code>{detectedPalette.accent}</code>
          </div>
          <button className="primary" onClick={() => void applyPalette()}>
            Aplicar paleta do logo
          </button>
        </div>
      )}

      <div className="appearance-actions">
        <button className="primary" onClick={() => void save()}>
          Salvar aparência
        </button>
        <button
          className="secondary"
          onClick={() => {
            setVisual(fallback);
            void save(fallback);
          }}
        >
          Restaurar aparência padrão
        </button>
      </div>
      {message && <div className="notice">{message}</div>}
    </section>
  );
}
export default App;
