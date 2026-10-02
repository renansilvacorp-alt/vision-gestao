import { db, error, json, requireAuth, router, storage } from '@/lib/runtime';

type Role = 'superadmin' | 'admin' | 'operator';
type ChannelKey = 'porta' | 'ifood' | '99' | 'encomenda';

type SystemModules = {
  encomendasAvailable: boolean;
};

type SystemRecord = {
  ownerUserId: string;
  createdAt: string;
  updatedAt?: string;
  modules?: SystemModules;
};

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

type StoreMember = {
  email: string;
  role: Exclude<Role, 'superadmin'>;
};

type StoreVisual = {
  theme: 'light' | 'dark';
  primary: string;
  accent: string;
  fontSize: 'small' | 'normal' | 'large' | 'xlarge';
};

type NativeNavigationKey =
  | 'venda'
  | 'cardapio'
  | 'insumos'
  | 'receitas'
  | 'precificacao'
  | 'financeiro'
  | 'historico'
  | 'config'
  | 'usuarios'
  | 'aparencia';

type NavigationKey = NativeNavigationKey | string;

type CustomPageField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  placeholder?: string;
  required: boolean;
  options?: string[];
};

type CustomPageBlock = {
  id: string;
  type: 'heading' | 'text' | 'notice' | 'kpi' | 'link' | 'divider' | 'form';
  title?: string;
  subtitle?: string;
  text?: string;
  label?: string;
  value?: string;
  hint?: string;
  url?: string;
  buttonLabel?: string;
  submitLabel?: string;
  fields?: CustomPageField[];
};

type CustomPageDefinition = {
  id: string;
  title: string;
  description?: string;
  layout: 'single' | 'two-column';
  blocks: CustomPageBlock[];
};

type CustomPageSubmission = {
  pageId: string;
  blockId: string;
  values: Record<string, string | number | boolean>;
  createdAt: string;
  createdBy: string;
};

type NavigationItem = {
  key: NavigationKey;
  label: string;
  group: string;
  icon: string;
  order: number;
  enabled: boolean;
  roles: Role[];
};

type InstalledContainer = {
  containerId: string;
  version: number;
  installedAt: string;
  updatedAt?: string;
};

type StoreRecord = {
  name: string;
  logoPath?: string;
  visual?: StoreVisual;
  createdAt: string;
  modules: { encomendas: boolean };
  reserves: { generalPct: number; cashPct: number };
  channels: Record<ChannelKey, ChannelConfig>;
  members?: StoreMember[];
  navigation?: NavigationItem[];
  customPages?: CustomPageDefinition[];
  installedContainers?: InstalledContainer[];
  containerId?: string;
  containerVersion?: number;
  structureCustomized?: boolean;
  structureUpdatedAt?: string;
  dataImports?: Record<string, string>;
};

type StoreTemplateRecord = {
  name: string;
  sourceLabel?: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
  modules: { encomendas: boolean };
  reserves: { generalPct: number; cashPct: number };
  channels: Record<ChannelKey, ChannelConfig>;
  navigation?: NavigationItem[];
  customPages?: CustomPageDefinition[];
  visual: StoreVisual;
};

type IngredientRecord = {
  name: string;
  unit: string;
  packageQty: number;
  packageCost: number;
  unitCost: number;
  supplier?: string;
  updatedAt: string;
};

type RecipeItem = {
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  cost: number;
};

type RecipeRecord = {
  name: string;
  yieldQty: number;
  items: RecipeItem[];
  totalCost: number;
  unitCost: number;
  updatedAt: string;
};

type ProductRecord = {
  name: string;
  recipeId?: string;
  manualCost: number;
  packagingCost: number;
  cost: number;
  prices: Record<ChannelKey, number>;
  updatedAt: string;
};

type SaleItem = {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  revenue: number;
  cost: number;
};

type SaleRecord = {
  channel: ChannelKey;
  paymentMethod: string;
  items: SaleItem[];
  gross: number;
  productCost: number;
  fees: number;
  channelFees?: number;
  monthlyFees?: number;
  promoFees?: number;
  generalReserve: number;
  cashReserve: number;
  estimatedProfit: number;
  pricingSnapshot?: {
    channel: ChannelConfig;
    appliedCardPct: number;
    reserves: { generalPct: number; cashPct: number };
  };
  createdAt: string;
  createdBy: string;
};

const now = () => new Date().toISOString();
const table = (kind: string, storeId: string) => `${kind}:${storeId}`;
const defaultSystemModules: SystemModules = { encomendasAvailable: true };

const navigationOrder: NativeNavigationKey[] = [
  'venda',
  'cardapio',
  'insumos',
  'receitas',
  'precificacao',
  'financeiro',
  'historico',
  'config',
  'usuarios',
  'aparencia',
];

const navigationCatalog: Record<
  NativeNavigationKey,
  Omit<NavigationItem, 'key' | 'order' | 'enabled'>
> = {
  venda: { label: 'Venda', group: 'Operação', icon: 'shopping-cart', roles: ['superadmin', 'admin', 'operator'] },
  cardapio: { label: 'Cardápio', group: 'Operação', icon: 'book-open', roles: ['superadmin', 'admin', 'operator'] },
  insumos: { label: 'Insumos', group: 'Produtos', icon: 'package', roles: ['superadmin', 'admin', 'operator'] },
  receitas: { label: 'Receita', group: 'Produtos', icon: 'chef-hat', roles: ['superadmin', 'admin', 'operator'] },
  precificacao: { label: 'Precificação', group: 'Produtos', icon: 'calculator', roles: ['superadmin', 'admin', 'operator'] },
  financeiro: { label: 'Financeiro', group: 'Gestão', icon: 'circle-dollar-sign', roles: ['superadmin', 'admin', 'operator'] },
  historico: { label: 'Histórico de vendas', group: 'Gestão', icon: 'history', roles: ['superadmin', 'admin', 'operator'] },
  config: { label: 'Taxas', group: 'Administração', icon: 'settings', roles: ['superadmin', 'admin', 'operator'] },
  usuarios: { label: 'Usuários', group: 'Administração', icon: 'users', roles: ['superadmin', 'admin'] },
  aparencia: { label: 'Configurações', group: 'Administração', icon: 'store', roles: ['superadmin', 'admin', 'operator'] },
};

const navigationIcons = new Set([
  'shopping-cart',
  'book-open',
  'package',
  'chef-hat',
  'calculator',
  'circle-dollar-sign',
  'history',
  'settings',
  'users',
  'store',
  'boxes',
]);

function defaultNavigation(): NavigationItem[] {
  return navigationOrder.map((key, order) => ({
    key,
    ...navigationCatalog[key],
    roles: [...navigationCatalog[key].roles],
    order,
    enabled: true,
  }));
}

function normalizeNavigation(input: unknown): NavigationItem[] {
  if (!Array.isArray(input) || input.length === 0) return defaultNavigation();
  const seen = new Set<string>();
  const parsed: NavigationItem[] = [];

  input.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const raw = entry as Record<string, unknown>;
    const key = String(raw.key ?? '');
    const native = navigationOrder.includes(key as NativeNavigationKey);
    const custom = /^custom:[a-zA-Z0-9_-]{1,80}$/.test(key);
    if ((!native && !custom) || seen.has(key)) return;
    seen.add(key);
    const fallback = native
      ? navigationCatalog[key as NativeNavigationKey]
      : {
          label: 'Página personalizada',
          group: 'Personalizado',
          icon: 'boxes',
          roles: ['superadmin', 'admin', 'operator'] as Role[],
        };
    const label = typeof raw.label === 'string' && raw.label.trim()
      ? raw.label.trim().slice(0, 60)
      : fallback.label;
    const group = typeof raw.group === 'string' && raw.group.trim()
      ? raw.group.trim().slice(0, 60)
      : fallback.group;
    const icon = typeof raw.icon === 'string' && navigationIcons.has(raw.icon)
      ? raw.icon
      : fallback.icon;
    const rawRoles = Array.isArray(raw.roles) ? raw.roles : fallback.roles;
    let roles = rawRoles.filter(
      (role): role is Role => role === 'superadmin' || role === 'admin' || role === 'operator'
    );
    if (key === 'usuarios') roles = roles.filter(role => role !== 'operator');
    if (roles.length === 0) roles = [...fallback.roles];

    parsed.push({
      key,
      label,
      group,
      icon,
      roles: Array.from(new Set(roles)),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : index,
      enabled: raw.enabled !== false,
    });
  });

  if (parsed.length === 0) return defaultNavigation();
  return parsed
    .sort((first, second) => first.order - second.order)
    .map((item, order) => ({ ...item, order }));
}

function safeDefinitionId(value: unknown) {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function normalizeCustomPages(input: unknown): CustomPageDefinition[] {
  if (!Array.isArray(input)) return [];
  const allowedBlocks = new Set(['heading', 'text', 'notice', 'kpi', 'link', 'divider', 'form']);
  const allowedFields = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);

  return input.slice(0, 30).flatMap(rawPage => {
    if (!rawPage || typeof rawPage !== 'object') return [];
    const page = rawPage as Record<string, unknown>;
    const id = safeDefinitionId(page.id);
    if (!id) return [];
    const rawBlocks = Array.isArray(page.blocks) ? page.blocks : [];
    const blocks: CustomPageBlock[] = rawBlocks.slice(0, 40).flatMap(rawBlock => {
      if (!rawBlock || typeof rawBlock !== 'object') return [];
      const block = rawBlock as Record<string, unknown>;
      const blockId = safeDefinitionId(block.id);
      const type = String(block.type ?? '');
      if (!blockId || !allowedBlocks.has(type)) return [];
      const rawFields = Array.isArray(block.fields) ? block.fields : [];
      const fields: CustomPageField[] = type === 'form'
        ? rawFields.slice(0, 30).flatMap(rawField => {
            if (!rawField || typeof rawField !== 'object') return [];
            const field = rawField as Record<string, unknown>;
            const fieldId = safeDefinitionId(field.id);
            const fieldType = String(field.type ?? '');
            if (!fieldId || !allowedFields.has(fieldType)) return [];
            return [{
              id: fieldId,
              label: stringValue(field.label).slice(0, 80) || 'Campo',
              type: fieldType as CustomPageField['type'],
              placeholder: stringValue(field.placeholder).slice(0, 120),
              required: field.required === true,
              options: Array.isArray(field.options)
                ? field.options.map(option => String(option).trim()).filter(Boolean).slice(0, 30)
                : [],
            }];
          })
        : [];
      const rawUrl = stringValue(block.url).slice(0, 500);
      const url = /^(https?:\/\/|mailto:|tel:)/i.test(rawUrl) ? rawUrl : '';
      return [{
        id: blockId,
        type: type as CustomPageBlock['type'],
        title: stringValue(block.title).slice(0, 120),
        subtitle: stringValue(block.subtitle).slice(0, 220),
        text: stringValue(block.text).slice(0, 5000),
        label: stringValue(block.label).slice(0, 120),
        value: stringValue(block.value).slice(0, 120),
        hint: stringValue(block.hint).slice(0, 220),
        url,
        buttonLabel: stringValue(block.buttonLabel).slice(0, 80),
        submitLabel: stringValue(block.submitLabel).slice(0, 80),
        fields,
      }];
    });
    return [{
      id,
      title: stringValue(page.title).slice(0, 120) || 'Página personalizada',
      description: stringValue(page.description).slice(0, 1000),
      layout: page.layout === 'two-column' ? 'two-column' : 'single',
      blocks,
    }];
  });
}

function customPageTable(storeId: string, pageId: string) {
  return `custom_page_entries:${storeId}:${safeDefinitionId(pageId)}`;
}

function normalizeContainerNavigation(input: unknown): NavigationItem[] {
  return normalizeNavigation(input).filter(item =>
    String(item.key).startsWith('custom:')
  );
}

function containerPrefix(containerId: string) {
  return 'pkg_' + safeDefinitionId(containerId) + '__';
}

function removeContainerPackage(
  store: StoreRecord,
  containerId: string
): StoreRecord {
  const prefix = containerPrefix(containerId);
  return {
    ...store,
    navigation: normalizeNavigation(store.navigation).filter(item =>
      !String(item.key).startsWith('custom:' + prefix)
    ),
    customPages: normalizeCustomPages(store.customPages).filter(
      page => !page.id.startsWith(prefix)
    ),
    installedContainers: (store.installedContainers ?? []).filter(
      item => item.containerId !== containerId
    ),
  };
}

function installContainerPackage(
  store: StoreRecord,
  containerId: string,
  container: StoreTemplateRecord
): StoreRecord {
  const previous = (store.installedContainers ?? []).find(
    item => item.containerId === containerId
  );
  const clean = removeContainerPackage(store, containerId);
  const prefix = containerPrefix(containerId);
  const sourcePages = normalizeCustomPages(container.customPages);
  const installedPages = sourcePages.map(page => ({
    ...page,
    id: prefix + page.id,
  }));
  const sourceNavigation = normalizeContainerNavigation(container.navigation);
  const installedNavigation = sourcePages.map((page, index) => {
    const source = sourceNavigation.find(
      item => item.key === 'custom:' + page.id
    );
    return {
      key: 'custom:' + prefix + page.id,
      label: source?.label || page.title,
      group: source?.group || 'Container · ' + container.name,
      icon: source?.icon || 'boxes',
      order: normalizeNavigation(clean.navigation).length + index,
      enabled: source?.enabled !== false,
      roles: source?.roles?.length
        ? [...source.roles]
        : ['superadmin', 'admin', 'operator'] as Role[],
    } satisfies NavigationItem;
  });
  const installedAt = previous?.installedAt ?? now();
  return {
    ...clean,
    modules: {
      ...clean.modules,
      encomendas: clean.modules.encomendas || container.modules.encomendas,
    },
    navigation: [
      ...normalizeNavigation(clean.navigation),
      ...installedNavigation,
    ].map((item, order) => ({ ...item, order })),
    customPages: [
      ...normalizeCustomPages(clean.customPages),
      ...installedPages,
    ],
    installedContainers: [
      ...(clean.installedContainers ?? []),
      {
        containerId,
        version: container.version ?? 1,
        installedAt,
        updatedAt: now(),
      },
    ],
    structureUpdatedAt: now(),
  };
}

const defaultChannel = (): ChannelConfig => ({
  platformPct: 0,
  cardPct: 0,
  transferPct: 0,
  fixedPerOrder: 0,
  monthlyFee: 0,
  monthlyThreshold: 0,
  profitPct: 30,
  monthlyPct: 0,
  promoEnabled: false,
  promoFee: 0,
});

const defaultStore = (name: string): StoreRecord => ({
  name,
  createdAt: now(),
  modules: { encomendas: false },
  reserves: { generalPct: 0, cashPct: 0 },
  channels: {
    porta: defaultChannel(),
    ifood: defaultChannel(),
    '99': defaultChannel(),
    encomenda: defaultChannel(),
  },
  members: [],
  navigation: defaultNavigation(),
  customPages: [],
  installedContainers: [],
  structureCustomized: false,
  visual: {
    theme: 'light',
    primary: '#111827',
    accent: '#2563eb',
    fontSize: 'normal',
  },
});

function templateFromStore(
  name: string,
  store: StoreRecord,
  sourceLabel?: string
): StoreTemplateRecord {
  return {
    name,
    sourceLabel,
    createdAt: now(),
    updatedAt: now(),
    version: 1,
    modules: { ...store.modules },
    reserves: { ...store.reserves },
    channels: {
      porta: { ...store.channels.porta },
      ifood: { ...store.channels.ifood },
      '99': { ...store.channels['99'] },
      encomenda: { ...store.channels.encomenda },
    },
    navigation: normalizeContainerNavigation(store.navigation),
    customPages: normalizeCustomPages(store.customPages),
    visual: {
      ...(store.visual ?? {
        theme: 'light',
        primary: '#111827',
        accent: '#2563eb',
        fontSize: 'normal',
      }),
    },
  };
}

function normalizeChannelConfig(
  key: ChannelKey,
  input?: Partial<ChannelConfig>
): ChannelConfig {
  const isModern =
    typeof input?.profitPct === 'number' ||
    typeof input?.monthlyPct === 'number' ||
    typeof input?.promoEnabled === 'boolean' ||
    typeof input?.promoFee === 'number';

  const platformDefault = key === 'ifood' ? 27.5 : key === '99' ? 12 : 0;
  const platformPct = isModern
    ? numberValue(input?.platformPct, platformDefault)
    : key === 'ifood' || key === '99'
      ? platformDefault
      : numberValue(input?.platformPct, 0);

  return {
    platformPct: Math.max(0, platformPct),
    cardPct: Math.max(0, numberValue(input?.cardPct, 0)),
    transferPct: 0,
    fixedPerOrder: 0,
    monthlyFee: 0,
    monthlyThreshold: 0,
    profitPct: Math.max(0, numberValue(input?.profitPct, 30)),
    monthlyPct: Math.max(0, numberValue(input?.monthlyPct, 0)),
    promoEnabled:
      typeof input?.promoEnabled === 'boolean' ? input.promoEnabled : false,
    promoFee: Math.max(
      0,
      numberValue(
        input?.promoFee,
        key === 'ifood' || key === '99' ? 5 : 0
      )
    ),
  };
}

function normalizeChannels(
  channels?: Partial<Record<ChannelKey, Partial<ChannelConfig>>>
): Record<ChannelKey, ChannelConfig> {
  return {
    porta: normalizeChannelConfig('porta', channels?.porta),
    ifood: normalizeChannelConfig('ifood', channels?.ifood),
    '99': normalizeChannelConfig('99', channels?.['99']),
    encomenda: normalizeChannelConfig('encomenda', channels?.encomenda),
  };
}

const CUBO_IMPORT = {
  version: 'cubo_precificacao_2026_09_20',
  source: 'Cópia de CUBO DO GOLE - Precificação 2026',
  sourceSpreadsheetId: '1EYLOHhv829GrPc97baWaMOzMAILb-oF8GXV_ytGCQPI',
  ingredients: [
    {
      name: 'leite condensado',
      unit: 'g',
      packageQty: 395,
      packageCost: 6.4
    },
    {
      name: 'Garrafinha',
      unit: 'un',
      packageQty: 100,
      packageCost: 94.6
    },
    {
      name: 'Copão 770ml sem tampa',
      unit: 'un',
      packageQty: 50,
      packageCost: 21
    },
    {
      name: 'Ice 51 limão',
      unit: 'un',
      packageQty: 1,
      packageCost: 7
    },
    {
      name: 'curaçau blue stock',
      unit: 'ml',
      packageQty: 720,
      packageCost: 50
    },
    {
      name: 'Cubo de gelo aproximado',
      unit: 'un',
      packageQty: 1,
      packageCost: 0.01
    },
    {
      name: 'Limão',
      unit: 'un',
      packageQty: 13,
      packageCost: 5
    },
    {
      name: 'Canudo mexedor',
      unit: 'un',
      packageQty: 100,
      packageCost: 10.35
    },
    {
      name: 'Gelo Good Ice',
      unit: 'un',
      packageQty: 1,
      packageCost: 0.99
    },
    {
      name: 'sacola 40x50',
      unit: 'un',
      packageQty: 400,
      packageCost: 54
    },
    {
      name: 'whisky',
      unit: 'ml',
      packageQty: 1000,
      packageCost: 56.9
    },
    {
      name: 'energetico',
      unit: 'un',
      packageQty: 1,
      packageCost: 7.69
    },
    {
      name: 'cerveja',
      unit: 'un',
      packageQty: 1,
      packageCost: 2.75
    },
    {
      name: 'gin',
      unit: 'ml',
      packageQty: 900,
      packageCost: 18
    },
    {
      name: 'energetico bally',
      unit: 'ml',
      packageQty: 2000,
      packageCost: 8
    },
    {
      name: 'energetico bally lata 250ml',
      unit: 'un',
      packageQty: 1,
      packageCost: 4.49
    },
    {
      name: 'saquinho',
      unit: 'un',
      packageQty: 1,
      packageCost: 0.07
    },
    {
      name: 'energetico bally lata 250ml Sabor',
      unit: 'un',
      packageQty: 1,
      packageCost: 4.71
    },
    {
      name: 'lacre saco',
      unit: 'kg',
      packageQty: 1,
      packageCost: 29.65
    },
    {
      name: 'saco pp',
      unit: 'un',
      packageQty: 75,
      packageCost: 16.52
    },
    {
      name: 'vaso simples',
      unit: 'un',
      packageQty: 1,
      packageCost: 9.99
    },
    {
      name: 'rosh tiger',
      unit: 'un',
      packageQty: 1,
      packageCost: 9.99
    },
    {
      name: 'essencia ziggy',
      unit: 'un',
      packageQty: 1,
      packageCost: 9.5
    },
    {
      name: 'essencia Nay',
      unit: 'un',
      packageQty: 1,
      packageCost: 9.5
    },
    {
      name: 'borracha rosh',
      unit: 'un',
      packageQty: 1,
      packageCost: 2.62
    },
    {
      name: 'canelinha',
      unit: 'ml',
      packageQty: 900,
      packageCost: 11.54
    },
    {
      name: 'Aluminio Stan Relevo',
      unit: 'un',
      packageQty: 50,
      packageCost: 13.65
    },
    {
      name: 'Aluminio Stan Liso',
      unit: 'un',
      packageQty: 50,
      packageCost: 12.6
    },
    {
      name: 'Seda Zomo',
      unit: 'un',
      packageQty: 25,
      packageCost: 36.75
    },
    {
      name: 'Tampa',
      unit: 'un',
      packageQty: 50,
      packageCost: 10.5
    },
    {
      name: 'Mansão Maromba',
      unit: 'ml',
      packageQty: 1000,
      packageCost: 15.99
    },
    {
      name: 'whisky chanceler',
      unit: 'ml',
      packageQty: 1000,
      packageCost: 15.75
    },
    {
      name: 'Cerveja Original',
      unit: 'un',
      packageQty: 8,
      packageCost: 30.32
    },
    {
      name: 'Cerveja Heineken 269',
      unit: 'un',
      packageQty: 8,
      packageCost: 31.92
    },
    {
      name: 'Energetico Baly 2L',
      unit: 'ml',
      packageQty: 2000,
      packageCost: 7.99
    },
    {
      name: 'Energetico Vibe 2L',
      unit: 'ml',
      packageQty: 2000,
      packageCost: 7.99
    },
    {
      name: 'Licor MALU Doce de Leite',
      unit: 'ml',
      packageQty: 500,
      packageCost: 34.9
    },
    {
      name: 'Amendoim com alho (porção)',
      unit: 'un',
      packageQty: 20,
      packageCost: 9.5
    },
    {
      name: 'fini',
      unit: 'un',
      packageQty: 12,
      packageCost: 8
    },
    {
      name: 'freegels',
      unit: 'un',
      packageQty: 12,
      packageCost: 10.49
    },
    {
      name: 'Ebicem',
      unit: 'un',
      packageQty: 10,
      packageCost: 25.25
    },
    {
      name: 'Calda de menta MARVI',
      unit: 'g',
      packageQty: 1000,
      packageCost: 16.49
    },
    {
      name: 'Coca cola garrafinha 200 ml',
      unit: 'un',
      packageQty: 12,
      packageCost: 25.5
    },
    {
      name: 'kiwi fruta',
      unit: 'un',
      packageQty: 1,
      packageCost: 3
    },
    {
      name: 'carvão fumax',
      unit: 'un',
      packageQty: 52,
      packageCost: 25.19
    },
    {
      name: 'Energetico baly tadala',
      unit: 'ml',
      packageQty: 2000,
      packageCost: 10.49
    },
    {
      name: 'Busca Brisa Azul',
      unit: 'ml',
      packageQty: 1000,
      packageCost: 27.99
    },
    {
      name: 'Busca Brisa Brisa Magica Lua Violeta',
      unit: 'ml',
      packageQty: 1000,
      packageCost: 22.99
    },
    {
      name: 'Bob Pinga',
      unit: 'ml',
      packageQty: 1000,
      packageCost: 22
    },
    {
      name: 'Cachaça 51',
      unit: 'ml',
      packageQty: 1000,
      packageCost: 12
    },
    {
      name: 'Copão 700ml sem tampa NOVO',
      unit: 'un',
      packageQty: 25,
      packageCost: 10.99
    },
    {
      name: 'Canudo Preto NOVO',
      unit: 'un',
      packageQty: 200,
      packageCost: 8
    },
    {
      name: 'Energetico baly Latão',
      unit: 'un',
      packageQty: 6,
      packageCost: 40.74
    },
    {
      name: 'Morango Swift',
      unit: 'g',
      packageQty: 1000,
      packageCost: 15
    },
    {
      name: 'beats vermelha',
      unit: 'un',
      packageQty: 1,
      packageCost: 4.79
    },
    {
      name: 'Energetico bob latão',
      unit: 'un',
      packageQty: 1,
      packageCost: 8.9
    }
  ],
  recipes: [
    {
      ref: '1',
      name: 'Copão Gin Energetico Baly  Latão',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'gin',
          quantity: 100
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'energetico bally lata 250ml',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        }
      ],
      manualCost: 0.1,
      prices: {
        '99': 0,
        porta: 15,
        ifood: 20.99,
        encomenda: 0
      }
    },
    {
      ref: '2',
      name: 'Batida Morango Super',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Cachaça 51',
          quantity: 200
        },
        {
          ingredientName: 'beats vermelha',
          quantity: 1
        },
        {
          ingredientName: 'leite condensado',
          quantity: 100
        },
        {
          ingredientName: 'Morango Swift',
          quantity: 150
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 25,
        ifood: 25,
        encomenda: 0
      }
    },
    {
      ref: '3',
      name: 'Copão Bob Pinga',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Bob Pinga',
          quantity: 120
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'Energetico bob latão',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 25,
        ifood: 29.99,
        encomenda: 0
      }
    },
    {
      ref: '4',
      name: 'Copão Busca Brisa',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Busca Brisa Azul',
          quantity: 120
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'Energetico baly Latão',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 25,
        ifood: 25.99,
        encomenda: 0
      }
    },
    {
      ref: '5',
      name: 'Copão Cubo Verde',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'whisky chanceler',
          quantity: 50
        },
        {
          ingredientName: 'Bob Pinga',
          quantity: 100
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'Energetico baly Latão',
          quantity: 1
        },
        {
          ingredientName: 'Copão 770ml sem tampa',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 25,
        ifood: 25.99,
        encomenda: 0
      }
    },
    {
      ref: '6',
      name: 'Copão Briza Encontrada',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Busca Brisa Azul',
          quantity: 100
        },
        {
          ingredientName: 'Cachaça 51',
          quantity: 50
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'Energetico baly Latão',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        }
      ],
      manualCost: 0.1,
      prices: {
        '99': 0,
        porta: 25,
        ifood: 25.99,
        encomenda: 0
      }
    },
    {
      ref: '7',
      name: 'Briza dobrada',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Bob Pinga',
          quantity: 120
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'Energetico bob latão',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Busca Brisa Azul',
          quantity: 120
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'Energetico baly Latão',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 0,
        ifood: 57.33,
        encomenda: 0
      }
    },
    {
      ref: '8',
      name: 'copão Cavalo Branco',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'whisky',
          quantity: 100
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'energetico bally lata 250ml Sabor',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo mexedor',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 30,
        ifood: 27.33,
        encomenda: 0
      }
    },
    {
      ref: '9',
      name: 'Copao chanceler',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'whisky chanceler',
          quantity: 100
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 1
        },
        {
          ingredientName: 'energetico bally lata 250ml Sabor',
          quantity: 1
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo mexedor',
          quantity: 1
        }
      ],
      manualCost: 0.1,
      prices: {
        '99': 0,
        porta: 20,
        ifood: 18,
        encomenda: 0
      }
    },
    {
      ref: '10',
      name: 'Combinado de imperio 3',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Cerveja Original',
          quantity: 3
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 0,
        ifood: 20.99,
        encomenda: 0
      }
    },
    {
      ref: '11',
      name: 'Combo Maromba',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Mansão Maromba',
          quantity: 1000
        },
        {
          ingredientName: 'Gelo Good Ice',
          quantity: 2
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 2
        },
        {
          ingredientName: 'Canudo mexedor',
          quantity: 2
        },
        {
          ingredientName: 'Energetico baly Latão',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 0,
        ifood: 57.6,
        encomenda: 0
      }
    },
    {
      ref: '12',
      name: 'Fronzen Busca Brisa',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Busca Brisa Azul',
          quantity: 120
        },
        {
          ingredientName: 'leite condensado',
          quantity: 150
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 18,
        ifood: 18,
        encomenda: 0
      }
    },
    {
      ref: '13',
      name: 'fronzen bob pinga',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'Bob Pinga',
          quantity: 120
        },
        {
          ingredientName: 'leite condensado',
          quantity: 150
        },
        {
          ingredientName: 'Copão 700ml sem tampa NOVO',
          quantity: 1
        },
        {
          ingredientName: 'Tampa',
          quantity: 1
        },
        {
          ingredientName: 'Canudo Preto NOVO',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 18,
        ifood: 18,
        encomenda: 0
      }
    },
    {
      ref: '20',
      name: 'rosh tiger',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'rosh tiger',
          quantity: 1
        },
        {
          ingredientName: 'borracha rosh',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 0,
        ifood: 32,
        encomenda: 0
      }
    },
    {
      ref: '21',
      name: 'Copão boca de fogo',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'whisky',
          quantity: 50
        },
        {
          ingredientName: 'Licor MALU Doce de Leite',
          quantity: 50
        },
        {
          ingredientName: 'Coca cola garrafinha 200 ml',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 0,
        ifood: 26,
        encomenda: 0
      }
    },
    {
      ref: '22',
      name: 'Kit sessao',
      yieldQty: 1,
      items: [
        {
          ingredientName: 'carvão fumax',
          quantity: 3
        },
        {
          ingredientName: 'Aluminio Stan Relevo',
          quantity: 1
        },
        {
          ingredientName: 'essencia ziggy',
          quantity: 1
        }
      ],
      manualCost: 0,
      prices: {
        '99': 0,
        porta: 0,
        ifood: 29.99,
        encomenda: 0
      }
    }
  ]
};

const KYFAZ_IMPORT = {
  version: 'kyfaz_insumos_2026_09_21',
  ingredients: [
    ['embalagem','l',1,1],['isopor geladinho','un',100,47],['sacola azul e verde','un',50,15.34],['papel toalha rolo 120 folhas','un',120,8],['etiqueta rosa lacre','un',50,2],['kraft rosa','un',50,50],['Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas','un',1,1],['Kit Embalagem Geladinho com 4 ( 1 isopor + 3 etiqueta)','un',1,0.59],['Nutella 3kg','g',3000,276],['leite','ml',1000,5.59],['creme de leite','g',200,3.2],['leite condensado piracanjuba','g',395,6.29],['leite ninho lata','g',385,19],['açucar refinado','g',1000,5.6],['liga neutra','g',1000,32],['suco tang','un',1,1.4],['saquinho regna 6x24','un',100,5.99],['pó sabor','g',1000,32],['fruta','g',300,5],['caixa de isopor dividido por 4 geladinhos 0,5 unidade','un',4,0.5],['Embalagem colher guardanapo','un',1,1.05],['emulsificante marvi','g',1000,28],['geleia caseira aprox','g',350,13.3],['chocolate preto barra','g',1000,98],['chocolate branco barra','g',1000,98],['chocolate preto casquinha','g',1000,47],['chocolate branco casquinha','g',1000,47],['amendoim granulado','g',100,3],['leite de coco','un',1,7.39],['coco sweet floco','g',1000,50],['morango swift','g',1000,26],['fava de baunilha','g',5,28],['pó sabor pistache','g',1000,49],['corante verde','ml',30,9],['manteiga','g',200,14],['chocolate pó 100','g',1000,55],['BASE Brigadeiro meio amargo minha mae kyfaz','g',800,18.03],['embalagem para bolo caixinha de plastico','un',10,12],['confeitos','g',1000,25],['ovo','un',20,20],['óleo','ml',900,8.8],['farinha de trigo 5k','g',5000,20],['fermento pó','g',100,5.6],['conhaque','ml',900,22],['papel manteiga','un',300,7],['morango fruta','un',10,10],['talher descartavel','un',100,35],['coca cola lata 350','un',1,4.4],['Fatia de bolo','un',1,7.05],['caixinha pra bolo7x7','un',50,50],['canela em pó','g',50,8.74],['cravo em pó','g',20,8.34],['agua','ml',500,1.69],['açucar mascavo','g',500,10.17],['Mel','ml',1000,50],['saquinho transparente para pão de mel','un',100,11.65],['fitilho 50 m','un',5000,6.4]
  ] as Array<[string,string,number,number]>,
};

type KyfazProductSeed = {
  name: string;
  yieldQty: number;
  items: Array<{ ingredientName: string; quantity: number }>;
  sourceTotalCost?: number;
  prices: { porta: number; ifood: number; '99': number };
};

const KYFAZ_PRODUCTS_IMPORT = {
  version: 'kyfaz_produtos_1_10_16_2026_09_21',
  recipes: [
    {
      name: 'Geladão Gourmet',
      yieldQty: 9,
      items: [
        { ingredientName: 'leite', quantity: 1000 },
        { ingredientName: 'creme de leite', quantity: 200 },
        { ingredientName: 'leite condensado piracanjuba', quantity: 395 },
        { ingredientName: 'emulsificante marvi', quantity: 10 },
        { ingredientName: 'açucar refinado', quantity: 20 },
        { ingredientName: 'liga neutra', quantity: 15 },
        { ingredientName: 'suco tang', quantity: 1 },
        { ingredientName: 'saquinho regna 6x24', quantity: 9 },
        { ingredientName: 'pó sabor', quantity: 40 },
        { ingredientName: 'fruta', quantity: 300 },
        { ingredientName: 'Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas', quantity: 2 },
        { ingredientName: 'Kit Embalagem Geladinho com 4 ( 1 isopor + 3 etiqueta)', quantity: 2 },
        { ingredientName: 'leite de coco', quantity: 0.3333 },
        { ingredientName: 'coco sweet floco', quantity: 30 },
      ],
      prices: { porta: 7, ifood: 8.95, '99': 7.85 },
    },
    {
      name: 'Geladão Gourmet Ninho com Nutella',
      yieldQty: 9,
      items: [
        { ingredientName: 'leite', quantity: 1000 },
        { ingredientName: 'creme de leite', quantity: 200 },
        { ingredientName: 'leite condensado piracanjuba', quantity: 395 },
        { ingredientName: 'Nutella 3kg', quantity: 162 },
        { ingredientName: 'açucar refinado', quantity: 20 },
        { ingredientName: 'liga neutra', quantity: 15 },
        { ingredientName: 'suco tang', quantity: 1 },
        { ingredientName: 'saquinho regna 6x24', quantity: 9 },
        { ingredientName: 'pó sabor', quantity: 40 },
        { ingredientName: 'fruta', quantity: 300 },
        { ingredientName: 'leite ninho lata', quantity: 90 },
        { ingredientName: 'emulsificante marvi', quantity: 10 },
        { ingredientName: 'Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas', quantity: 2 },
        { ingredientName: 'Kit Embalagem Geladinho com 4 ( 1 isopor + 3 etiqueta)', quantity: 2 },
      ],
      prices: { porta: 9, ifood: 12.85, '99': 10.85 },
    },
    {
      name: 'Geladão Gourmet Morango Especial',
      yieldQty: 30,
      items: [
        { ingredientName: 'leite', quantity: 3000 },
        { ingredientName: 'creme de leite', quantity: 600 },
        { ingredientName: 'leite condensado piracanjuba', quantity: 1185 },
        { ingredientName: 'açucar refinado', quantity: 260 },
        { ingredientName: 'liga neutra', quantity: 45 },
        { ingredientName: 'suco tang', quantity: 3 },
        { ingredientName: 'saquinho regna 6x24', quantity: 30 },
        { ingredientName: 'pó sabor', quantity: 120 },
        { ingredientName: 'emulsificante marvi', quantity: 30 },
        { ingredientName: 'chocolate branco barra', quantity: 720 },
        { ingredientName: 'morango swift', quantity: 1000 },
        { ingredientName: 'Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas', quantity: 6 },
        { ingredientName: 'Kit Embalagem Geladinho com 4 ( 1 isopor + 3 etiqueta)', quantity: 6 },
      ],
      prices: { porta: 13, ifood: 15.95, '99': 13.85 },
    },
    {
      name: 'Geladão Gourmet Tablito',
      yieldQty: 30,
      items: [
        { ingredientName: 'leite', quantity: 3000 },
        { ingredientName: 'creme de leite', quantity: 600 },
        { ingredientName: 'leite condensado piracanjuba', quantity: 1185 },
        { ingredientName: 'leite ninho lata', quantity: 270 },
        { ingredientName: 'açucar refinado', quantity: 60 },
        { ingredientName: 'liga neutra', quantity: 45 },
        { ingredientName: 'saquinho regna 6x24', quantity: 30 },
        { ingredientName: 'fava de baunilha', quantity: 0.06 },
        { ingredientName: 'emulsificante marvi', quantity: 300 },
        { ingredientName: 'amendoim granulado', quantity: 450 },
        { ingredientName: 'chocolate preto barra', quantity: 300 },
        { ingredientName: 'chocolate branco barra', quantity: 600 },
        { ingredientName: 'Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas', quantity: 6 },
        { ingredientName: 'Kit Embalagem Geladinho com 4 ( 1 isopor + 3 etiqueta)', quantity: 6 },
      ],
      prices: { porta: 13, ifood: 15.95, '99': 13.85 },
    },
    {
      name: 'Geladão Gourmet Pistache com Nutella',
      yieldQty: 9,
      items: [
        { ingredientName: 'leite', quantity: 1000 },
        { ingredientName: 'creme de leite', quantity: 200 },
        { ingredientName: 'leite condensado piracanjuba', quantity: 395 },
        { ingredientName: 'Nutella 3kg', quantity: 162 },
        { ingredientName: 'açucar refinado', quantity: 20 },
        { ingredientName: 'liga neutra', quantity: 15 },
        { ingredientName: 'saquinho regna 6x24', quantity: 9 },
        { ingredientName: 'pó sabor pistache', quantity: 50 },
        { ingredientName: 'corante verde', quantity: 5 },
        { ingredientName: 'emulsificante marvi', quantity: 10 },
        { ingredientName: 'Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas', quantity: 2 },
        { ingredientName: 'Kit Embalagem Geladinho com 4 ( 1 isopor + 3 etiqueta)', quantity: 2 },
      ],
      prices: { porta: 13, ifood: 15.95, '99': 0 },
    },
    {
      name: 'BASE Brigadeiro meio amargo Minha Mãe Kyfáz',
      yieldQty: 800,
      items: [
        { ingredientName: 'leite condensado piracanjuba', quantity: 396 },
        { ingredientName: 'creme de leite', quantity: 400 },
        { ingredientName: 'manteiga', quantity: 5 },
        { ingredientName: 'chocolate preto barra', quantity: 40 },
        { ingredientName: 'chocolate pó 100', quantity: 40 },
      ],
      prices: { porta: 0, ifood: 0, '99': 0 },
    },
    {
      name: 'Bolo em fatia',
      yieldQty: 10,
      items: [
        { ingredientName: 'ovo', quantity: 3 },
        { ingredientName: 'açucar refinado', quantity: 270 },
        { ingredientName: 'óleo', quantity: 80 },
        { ingredientName: 'farinha de trigo 5k', quantity: 240 },
        { ingredientName: 'chocolate pó 100', quantity: 40 },
        { ingredientName: 'fermento pó', quantity: 14 },
        { ingredientName: 'conhaque', quantity: 10 },
        { ingredientName: 'leite', quantity: 240 },
        { ingredientName: 'embalagem para bolo caixinha de plastico', quantity: 10 },
        { ingredientName: 'etiqueta rosa lacre', quantity: 10 },
        { ingredientName: 'confeitos', quantity: 100 },
        { ingredientName: 'BASE Brigadeiro meio amargo minha mae kyfaz', quantity: 1200 },
        { ingredientName: 'papel manteiga', quantity: 40 },
        { ingredientName: 'morango fruta', quantity: 1 },
        { ingredientName: 'talher descartavel', quantity: 10 },
        { ingredientName: 'Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas', quantity: 10 },
      ],
      prices: { porta: 17, ifood: 21.95, '99': 17.85 },
    },
    {
      name: 'Pão de mel',
      yieldQty: 1,
      items: [{ ingredientName: 'ovo', quantity: 3 }],
      prices: { porta: 8, ifood: 9.3, '99': 8.85 },
    },
    {
      name: 'Combo Geladinho 4 Nutella',
      yieldQty: 1,
      items: [
        { ingredientName: 'leite', quantity: 444.4444444 },
        { ingredientName: 'creme de leite', quantity: 88.88888889 },
        { ingredientName: 'leite condensado piracanjuba', quantity: 175.5555556 },
        { ingredientName: 'Nutella 3kg', quantity: 72 },
        { ingredientName: 'açucar refinado', quantity: 8.888888889 },
        { ingredientName: 'liga neutra', quantity: 6.666666667 },
        { ingredientName: 'suco tang', quantity: 0.4444444444 },
        { ingredientName: 'saquinho regna 6x24', quantity: 4 },
        { ingredientName: 'pó sabor', quantity: 17.77777778 },
        { ingredientName: 'fruta', quantity: 133.3333333 },
        { ingredientName: 'leite ninho lata', quantity: 40 },
        { ingredientName: 'emulsificante marvi', quantity: 4.444444444 },
        { ingredientName: 'Kit Embalagem Ifood  (1 kraft ou sacola + 3 etiquetas', quantity: 1 },
        { ingredientName: 'Kit Embalagem Geladinho com 4 ( 1 isopor + 3 etiqueta)', quantity: 1 },
      ],
      prices: { porta: 0, ifood: 48.95, '99': 39.85 },
    },
    {
      name: 'Combo Bolo e Coca-Cola',
      yieldQty: 1,
      items: [
        { ingredientName: 'Fatia de bolo', quantity: 1 },
        { ingredientName: 'coca cola lata 350', quantity: 1 },
      ],
      prices: { porta: 22, ifood: 29.99, '99': 23.85 },
    },
    {
      name: 'Bolo branco leite Ninho com geleia de morango',
      yieldQty: 10,
      items: [],
      sourceTotalCost: 70.33,
      prices: { porta: 0, ifood: 16.99, '99': 16.99 },
    },
  ] as KyfazProductSeed[],
};

const normalizeImportName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

async function importCuboOfficialData() {
  const stores = await db.list<StoreRecord>('stores', { limit: 50 });
  const exact = stores.items.filter(
    store => normalizeImportName(store.name) === 'cubo do gole'
  );
  const candidates =
    exact.length > 0
      ? exact
      : stores.items.filter(store =>
          normalizeImportName(store.name).includes('cubo do gole')
        );

  if (candidates.length !== 1) {
    if (candidates.length > 1)
      console.warn('CUBO_IMPORT_SKIPPED_MULTIPLE_STORES', candidates.length);
    return { status: candidates.length ? 'ambiguous' : 'store_not_found' };
  }

  const target = candidates[0];
  if (target.dataImports?.[CUBO_IMPORT.version])
    return { status: 'already_imported' };

  const ingredientTable = table('ingredients', target.id);
  const recipeTable = table('recipes', target.id);
  const productTable = table('products', target.id);

  const existingIngredients = await db.list<IngredientRecord>(ingredientTable, {
    limit: 200,
  });
  const ingredientMap = new Map<
    string,
    IngredientRecord & { id: string }
  >();
  existingIngredients.items.forEach(item =>
    ingredientMap.set(normalizeImportName(item.name), item)
  );

  const missingIngredientSeeds = CUBO_IMPORT.ingredients.filter(
    item => !ingredientMap.has(normalizeImportName(item.name))
  );
  if (missingIngredientSeeds.length) {
    const records: IngredientRecord[] = missingIngredientSeeds.map(item => ({
      name: item.name,
      unit: item.unit,
      packageQty: item.packageQty,
      packageCost: item.packageCost,
      unitCost: item.packageCost / item.packageQty,
      updatedAt: now(),
    }));
    const ids = await db.add(ingredientTable, records);
    for (let i = 0; i < records.length; i += 1) {
      const id = ids[i];
      if (id)
        ingredientMap.set(normalizeImportName(records[i].name), {
          id,
          ...records[i],
        });
    }
  }

  const existingRecipes = await db.list<RecipeRecord>(recipeTable, {
    limit: 100,
  });
  const recipeMap = new Map<string, RecipeRecord & { id: string }>();
  existingRecipes.items.forEach(item =>
    recipeMap.set(normalizeImportName(item.name), item)
  );

  const missingRecipeSeeds = CUBO_IMPORT.recipes.filter(
    recipe => !recipeMap.has(normalizeImportName(recipe.name))
  );
  if (missingRecipeSeeds.length) {
    const recipeRecords: RecipeRecord[] = missingRecipeSeeds.map(recipe => {
      const items: RecipeItem[] = recipe.items.map(seedItem => {
        const ingredient = ingredientMap.get(
          normalizeImportName(seedItem.ingredientName)
        );
        if (!ingredient)
          throw new Error(
            'Insumo ausente durante importação: ' + seedItem.ingredientName
          );
        const cost = seedItem.quantity * ingredient.unitCost;
        return {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          quantity: seedItem.quantity,
          unit: ingredient.unit,
          unitCost: ingredient.unitCost,
          cost,
        };
      });
      const totalCost = items.reduce((sum, item) => sum + item.cost, 0);
      return {
        name: recipe.name,
        yieldQty: recipe.yieldQty,
        items,
        totalCost,
        unitCost: totalCost / recipe.yieldQty,
        updatedAt: now(),
      };
    });
    const ids = await db.add(recipeTable, recipeRecords);
    for (let i = 0; i < recipeRecords.length; i += 1) {
      const id = ids[i];
      if (id)
        recipeMap.set(normalizeImportName(recipeRecords[i].name), {
          id,
          ...recipeRecords[i],
        });
    }
  }

  const existingProducts = await db.list<ProductRecord>(productTable, {
    limit: 150,
  });
  const productKeys = new Set(
    existingProducts.items.flatMap(item => [
      normalizeImportName(item.name),
      item.recipeId ? 'recipe:' + item.recipeId : '',
    ])
  );

  const productRecords: ProductRecord[] = [];
  for (const seedRecipe of CUBO_IMPORT.recipes) {
    const recipe = recipeMap.get(normalizeImportName(seedRecipe.name));
    if (!recipe) continue;
    if (
      productKeys.has(normalizeImportName(seedRecipe.name)) ||
      productKeys.has('recipe:' + recipe.id)
    )
      continue;

    productRecords.push({
      name: seedRecipe.name,
      recipeId: recipe.id,
      manualCost: seedRecipe.manualCost,
      packagingCost: 0,
      cost: recipe.unitCost + seedRecipe.manualCost,
      prices: {
        porta: seedRecipe.prices.porta,
        ifood: seedRecipe.prices.ifood,
        '99': 0,
        encomenda: 0,
      },
      updatedAt: now(),
    });
  }
  if (productRecords.length) await db.add(productTable, productRecords);

  const { id, ...storeRecord } = target;
  const [marked] = await db.update('stores', [
    {
      id,
      record: {
        ...storeRecord,
        dataImports: {
          ...(storeRecord.dataImports ?? {}),
          [CUBO_IMPORT.version]: now(),
        },
      },
    },
  ]);
  if (!marked) throw new Error('Falha ao marcar importação do Cubo do Gole.');

  return {
    status: 'imported',
    ingredientsAdded: missingIngredientSeeds.length,
    recipesAdded: missingRecipeSeeds.length,
    pricingAdded: productRecords.length,
  };
}


async function importKyfazIngredients() {
  const stores = await db.list<StoreRecord>('stores', { limit: 50 });
  const candidates = stores.items.filter(store => normalizeImportName(store.name).includes('minha mae kyfaz'));
  if (candidates.length !== 1) return { status: candidates.length ? 'ambiguous' : 'store_not_found' };
  const target = candidates[0];
  if (target.dataImports?.[KYFAZ_IMPORT.version]) return { status: 'already_imported' };
  const ingredientTable = table('ingredients', target.id);
  const existing = await db.list<IngredientRecord>(ingredientTable, { limit: 200 });
  const names = new Set(existing.items.map(item => normalizeImportName(item.name)));
  const missing = KYFAZ_IMPORT.ingredients.filter(item => !names.has(normalizeImportName(item[0])));
  if (missing.length) {
    const records: IngredientRecord[] = missing.map(([name, unit, packageQty, packageCost]) => ({ name, unit, packageQty, packageCost, unitCost: packageCost / packageQty, updatedAt: now() }));
    const ids = await db.add(ingredientTable, records);
    if (ids.some(id => !id)) throw new Error('Falha parcial ao importar insumos Kyfáz.');
  }
  const { id, ...storeRecord } = target;
  const [marked] = await db.update('stores', [{ id, record: { ...storeRecord, dataImports: { ...(storeRecord.dataImports ?? {}), [KYFAZ_IMPORT.version]: now() } } }]);
  if (!marked) throw new Error('Falha ao marcar importação Kyfáz.');
  return { status: 'imported', ingredientsAdded: missing.length };
}

async function importKyfazProducts() {
  const stores = await db.list<StoreRecord>('stores', { limit: 50 });
  const candidates = stores.items.filter(store =>
    normalizeImportName(store.name).includes('minha mae kyfaz')
  );
  if (candidates.length !== 1)
    return { status: candidates.length ? 'ambiguous' : 'store_not_found' };

  const target = candidates[0];
  if (target.dataImports?.[KYFAZ_PRODUCTS_IMPORT.version])
    return { status: 'already_imported' };

  const ingredientTable = table('ingredients', target.id);
  const recipeTable = table('recipes', target.id);
  const productTable = table('products', target.id);

  const existingIngredients = await db.list<IngredientRecord>(ingredientTable, {
    limit: 200,
  });
  const ingredientMap = new Map<string, IngredientRecord & { id: string }>();
  existingIngredients.items.forEach(item =>
    ingredientMap.set(normalizeImportName(item.name), item)
  );

  const existingRecipes = await db.list<RecipeRecord>(recipeTable, { limit: 100 });
  const recipeMap = new Map<string, RecipeRecord & { id: string }>();
  existingRecipes.items.forEach(item =>
    recipeMap.set(normalizeImportName(item.name), item)
  );

  const missingRecipeSeeds = KYFAZ_PRODUCTS_IMPORT.recipes.filter(
    recipe => !recipeMap.has(normalizeImportName(recipe.name))
  );
  if (missingRecipeSeeds.length) {
    const recipeRecords: RecipeRecord[] = missingRecipeSeeds.map(seed => {
      const items: RecipeItem[] = seed.items.map(seedItem => {
        const ingredient = ingredientMap.get(
          normalizeImportName(seedItem.ingredientName)
        );
        if (!ingredient)
          throw new Error(
            'Insumo ausente durante importação Kyfáz: ' + seedItem.ingredientName
          );
        const cost = seedItem.quantity * ingredient.unitCost;
        return {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          quantity: seedItem.quantity,
          unit: ingredient.unit,
          unitCost: ingredient.unitCost,
          cost,
        };
      });
      const totalCost =
        seed.sourceTotalCost ?? items.reduce((sum, item) => sum + item.cost, 0);
      return {
        name: seed.name,
        yieldQty: seed.yieldQty,
        items,
        totalCost,
        unitCost: totalCost / seed.yieldQty,
        updatedAt: now(),
      };
    });
    const ids = await db.add(recipeTable, recipeRecords);
    for (let index = 0; index < recipeRecords.length; index += 1) {
      const id = ids[index];
      if (id)
        recipeMap.set(normalizeImportName(recipeRecords[index].name), {
          id,
          ...recipeRecords[index],
        });
    }
  }

  const existingProducts = await db.list<ProductRecord>(productTable, { limit: 150 });
  const productKeys = new Set(
    existingProducts.items.flatMap(item => [
      normalizeImportName(item.name),
      item.recipeId ? 'recipe:' + item.recipeId : '',
    ])
  );
  const productRecords: ProductRecord[] = [];
  for (const seed of KYFAZ_PRODUCTS_IMPORT.recipes) {
    const recipe = recipeMap.get(normalizeImportName(seed.name));
    if (!recipe) continue;
    if (
      productKeys.has(normalizeImportName(seed.name)) ||
      productKeys.has('recipe:' + recipe.id)
    )
      continue;
    productRecords.push({
      name: seed.name,
      recipeId: recipe.id,
      manualCost: 0,
      packagingCost: 0,
      cost: recipe.unitCost,
      prices: {
        porta: seed.prices.porta,
        ifood: seed.prices.ifood,
        '99': seed.prices['99'],
        encomenda: 0,
      },
      updatedAt: now(),
    });
  }
  if (productRecords.length) {
    const ids = await db.add(productTable, productRecords);
    if (ids.some(id => !id)) throw new Error('Falha parcial ao importar produtos Kyfáz.');
  }

  const { id, ...storeRecord } = target;
  const [marked] = await db.update('stores', [
    {
      id,
      record: {
        ...storeRecord,
        dataImports: {
          ...(storeRecord.dataImports ?? {}),
          [KYFAZ_PRODUCTS_IMPORT.version]: now(),
        },
      },
    },
  ]);
  if (!marked) throw new Error('Falha ao marcar importação de produtos Kyfáz.');

  return {
    status: 'imported',
    recipesAdded: missingRecipeSeeds.length,
    productsAdded: productRecords.length,
  };
}

async function getSystemRecord() {
  const { items } = await db.list<SystemRecord>('system', { limit: 1 });
  return items[0] ?? null;
}

async function systemOwner(): Promise<string | null> {
  const system = await getSystemRecord();
  return system?.ownerUserId ?? null;
}

async function getSystemModules(): Promise<SystemModules> {
  const system = await getSystemRecord();
  return system?.modules ?? defaultSystemModules;
}

async function ensureBootstrap(userId: string) {
  const system = await getSystemRecord();
  if (system) return system.ownerUserId;
  const [id] = await db.add('system', [
    {
      ownerUserId: userId,
      createdAt: now(),
      modules: defaultSystemModules,
    },
  ]);
  if (!id) throw new Error('Não foi possível iniciar o sistema.');
  return userId;
}

async function roleFor(
  userId: string,
  storeId: string,
  email?: string
): Promise<Role | null> {
  const owner = await systemOwner();
  if (owner === userId) return 'superadmin';
  if (!email) return null;

  const store = await getStore(storeId);
  if (!store) return null;
  const normalizedEmail = email.trim().toLowerCase();
  return (
    store.members?.find(member => member.email === normalizedEmail)?.role ?? null
  );
}

async function requireStore(userId: string, storeId: string, email?: string) {
  const role = await roleFor(userId, storeId, email);
  if (!role) return null;
  return role;
}

async function getStore(storeId: string): Promise<StoreRecord | null> {
  const [store] = await db.get<StoreRecord>('stores', [storeId]);
  if (!store) return null;
  return {
    ...store,
    channels: normalizeChannels(store.channels),
    navigation: normalizeNavigation(store.navigation),
    customPages: normalizeCustomPages(store.customPages),
  };
}

async function storeWithLogo(
  storeId: string,
  store: StoreRecord,
  role?: Exclude<Role, 'superadmin'>,
  includeMembers = false
) {
  let logoUrl = '';
  if (store.logoPath) {
    try {
      const [signed] = await storage.url([store.logoPath]);
      logoUrl = signed?.url ?? '';
    } catch (cause) {
      console.warn('Logo indisponível; sessão continuará sem imagem.', cause);
    }
  }

  return {
    id: storeId,
    name: store.name,
    logoUrl,
    createdAt: store.createdAt,
    modules: store.modules,
    reserves: store.reserves,
    channels: normalizeChannels(store.channels),
    navigation: normalizeNavigation(store.navigation),
    customPages: normalizeCustomPages(store.customPages),
    installedContainers: store.installedContainers ?? [],
    containerId: store.containerId,
    containerVersion: store.containerVersion,
    structureCustomized: store.structureCustomized ?? false,
    visual: store.visual ?? { theme: 'light', primary: '#111827', accent: '#2563eb', fontSize: 'normal' },
    ...(role ? { role } : {}),
    ...(includeMembers ? { members: store.members ?? [] } : {}),
  };
}

async function listStoresFor(userId: string, email?: string) {
  const owner = await systemOwner();
  const { items } = await db.list<StoreRecord>('stores', { limit: 50 });

  if (owner === userId) {
    return Promise.all(
      items.map(item => storeWithLogo(item.id, item, undefined, true))
    );
  }

  if (!email) return [];
  const normalizedEmail = email.trim().toLowerCase();
  const memberships = items
    .map(store => ({
      store,
      role: store.members?.find(member => member.email === normalizedEmail)?.role,
    }))
    .filter(
      (entry): entry is {
        store: StoreRecord & { id: string };
        role: Exclude<Role, 'superadmin'>;
      } => Boolean(entry.role)
    );

  return Promise.all(
    memberships.map(entry =>
      storeWithLogo(
        entry.store.id,
        entry.store,
        entry.role,
        entry.role === 'admin'
      )
    )
  );
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function channelSettings(
  input: unknown,
  current: StoreRecord['channels']
): StoreRecord['channels'] {
  const body = (input && typeof input === 'object' ? input : {}) as Partial<
    Record<ChannelKey, Partial<ChannelConfig>>
  >;

  const merge = (key: ChannelKey): ChannelConfig => {
    const existing = normalizeChannelConfig(key, current[key]);
    return {
      ...existing,
      platformPct: Math.max(
        0,
        numberValue(body[key]?.platformPct, existing.platformPct)
      ),
      cardPct: Math.max(
        0,
        numberValue(body[key]?.cardPct, existing.cardPct)
      ),
      profitPct: Math.max(
        0,
        numberValue(body[key]?.profitPct, existing.profitPct)
      ),
      monthlyPct: Math.max(
        0,
        numberValue(body[key]?.monthlyPct, existing.monthlyPct)
      ),
      promoEnabled:
        typeof body[key]?.promoEnabled === 'boolean'
          ? body[key]!.promoEnabled!
          : existing.promoEnabled,
      promoFee: Math.max(
        0,
        numberValue(body[key]?.promoFee, existing.promoFee)
      ),
      transferPct: 0,
      fixedPerOrder: 0,
      monthlyFee: 0,
      monthlyThreshold: 0,
    };
  };

  return {
    porta: merge('porta'),
    ifood: merge('ifood'),
    '99': merge('99'),
    encomenda: merge('encomenda'),
  };
}
async function calculateRecipe(body: Record<string, unknown>) {
  const name = stringValue(body.name);
  const yieldQty = numberValue(body.yieldQty, 1);
  const rawItems = Array.isArray(body.items) ? body.items : [];

  if (!name) throw new Error('Informe o nome da receita.');
  if (yieldQty <= 0) throw new Error('O rendimento deve ser maior que zero.');
  if (!rawItems.length)
    throw new Error('Adicione pelo menos um insumo à receita.');

  const preparedItems = rawItems.map((rawItem, index) => {
    const item = rawItem as Record<string, unknown>;
    const ingredientId = stringValue(item.ingredientId);
    const quantity = numberValue(item.quantity);

    if (!ingredientId)
      throw new Error(`A linha ${index + 1} está sem insumo selecionado.`);
    if (quantity <= 0)
      throw new Error(
        `A quantidade da linha ${index + 1} deve ser maior que zero.`
      );

    return { ingredientId, quantity };
  });

  const ingredients = await db.get<IngredientRecord>(
    String(body.tableName),
    preparedItems.map(item => item.ingredientId)
  );

  const items: RecipeItem[] = [];
  let totalCost = 0;

  for (let i = 0; i < preparedItems.length; i += 1) {
    const prepared = preparedItems[i];
    const ingredient = ingredients[i];
    if (!ingredient)
      throw new Error(
        `O insumo da linha ${i + 1} não existe mais. Remova a linha e adicione o insumo novamente.`
      );

    const cost = prepared.quantity * ingredient.unitCost;
    totalCost += cost;
    items.push({
      ingredientId: prepared.ingredientId,
      ingredientName: ingredient.name,
      quantity: prepared.quantity,
      unit: ingredient.unit,
      unitCost: ingredient.unitCost,
      cost,
    });
  }

  return {
    name,
    yieldQty,
    items,
    totalCost,
    unitCost: totalCost / yieldQty,
    updatedAt: now(),
  } satisfies RecipeRecord;
}

async function productFromBody(
  body: Record<string, unknown>,
  storeId: string
): Promise<ProductRecord> {
  const name = stringValue(body.name);
  if (!name) throw new Error('Informe o nome do produto.');
  const recipeId = stringValue(body.recipeId);
  let recipeCost = 0;
  if (recipeId) {
    const [recipe] = await db.get<RecipeRecord>(table('recipes', storeId), [
      recipeId,
    ]);
    if (!recipe) throw new Error('Receita não encontrada.');
    recipeCost = recipe.unitCost;
  }
  const manualCost = Math.max(0, numberValue(body.manualCost));
  const packagingCost = Math.max(0, numberValue(body.packagingCost));
  const rawPrices = (
    body.prices && typeof body.prices === 'object' ? body.prices : {}
  ) as Record<string, unknown>;
  return {
    name,
    recipeId: recipeId || undefined,
    manualCost,
    packagingCost,
    cost: recipeCost + manualCost + packagingCost,
    prices: {
      porta: Math.max(0, numberValue(rawPrices.porta)),
      ifood: Math.max(0, numberValue(rawPrices.ifood)),
      '99': Math.max(0, numberValue(rawPrices['99'])),
      encomenda: Math.max(0, numberValue(rawPrices.encomenda)),
    },
    updatedAt: now(),
  };
}

export const handler = router({
  'GET /api/_healthcheck': [async () => json({ message: 'Success' })],

  'GET /api/session': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      try {
        const owner = await ensureBootstrap(user.userId);
        // Dados oficiais foram migrados para o Neon da Vision.
        // Imports legados permanecem apenas como referência histórica.
        const stores = await listStoresFor(user.userId, user.email);
        return json({
          user: { id: user.userId, email: user.email, name: user.name },
          isSuperadmin: owner === user.userId,
          stores,
        });
      } catch (cause) {
        console.error('SESSION_BUILD_FAILED', cause);
        return json({
          user: { id: user.userId, email: user.email, name: user.name },
          isSuperadmin: false,
          stores: [],
          diagnostic: 'SESSION_BUILD_FAILED',
        });
      }
    },
  ],

  'GET /api/superadmin/config': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin acessa o Container Base.', 403);
      return json({ modules: await getSystemModules() });
    },
  ],

  'PUT /api/superadmin/config': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const system = await getSystemRecord();
      if (!system || system.ownerUserId !== user.userId)
        return error('Apenas o Superadmin altera o Container Base.', 403);

      const body = ctx.body as Record<string, unknown>;
      const modules = (
        body.modules && typeof body.modules === 'object' ? body.modules : {}
      ) as { encomendasAvailable?: unknown };

      const nextModules: SystemModules = {
        encomendasAvailable:
          typeof modules.encomendasAvailable === 'boolean'
            ? modules.encomendasAvailable
            : system.modules?.encomendasAvailable ??
              defaultSystemModules.encomendasAvailable,
      };

      const { id, ...record } = system;
      const [ok] = await db.update('system', [
        {
          id,
          record: {
            ...record,
            modules: nextModules,
            updatedAt: now(),
          },
        },
      ]);
      if (!ok) return error('Falha ao salvar o Container Base.', 500);
      return json({ modules: nextModules });
    },
  ],

  'GET /api/superadmin/templates': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin acessa os containers.', 403);
      const result = await db.list<StoreTemplateRecord>('store_templates', {
        limit: 100,
      });
      return json({
        items: result.items.map(item => ({
          ...item,
          version: item.version ?? 1,
          navigation: normalizeContainerNavigation(item.navigation),
          customPages: normalizeCustomPages(item.customPages),
        })),
      });
    },
  ],

  'POST /api/superadmin/templates': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin cria containers.', 403);
      const body = ctx.body as Record<string, unknown>;
      const name = stringValue(body.name);
      const sourceStoreId = stringValue(body.sourceStoreId);
      if (!name) return error('Informe o nome do container.', 400);
      let source = defaultStore('');
      let sourceLabel = 'Base genérica';
      if (sourceStoreId) {
        const store = await getStore(sourceStoreId);
        if (!store) return error('Empresa de origem não encontrada.', 404);
        source = store;
        sourceLabel = `Cópia de ${store.name}`;
      }
      const record = templateFromStore(name, source, sourceLabel);
      const [id] = await db.add('store_templates', [record]);
      if (!id) return error('Falha ao criar container.', 500);
      return json({ id, ...record });
    },
  ],

  'PUT /api/superadmin/templates/:id': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin edita containers.', 403);

      const [current] = await db.get<StoreTemplateRecord>('store_templates', [
        ctx.params.id,
      ]);
      if (!current) return error('Container não encontrado.', 404);

      const body = ctx.body as Record<string, unknown>;
      const modules = (
        body.modules && typeof body.modules === 'object' ? body.modules : {}
      ) as { encomendas?: unknown };
      const reserves = (
        body.reserves && typeof body.reserves === 'object' ? body.reserves : {}
      ) as Record<string, unknown>;
      const rawVisual = (
        body.visual && typeof body.visual === 'object' ? body.visual : {}
      ) as Record<string, unknown>;
      const systemModules = await getSystemModules();
      const requestedEncomendas =
        typeof modules.encomendas === 'boolean'
          ? modules.encomendas
          : current.modules.encomendas;

      if (requestedEncomendas && !systemModules.encomendasAvailable)
        return error(
          'O módulo Encomendas não está disponível na configuração global.',
          400
        );

      const hex = (value: unknown, fallback: string) =>
        typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
          ? value
          : fallback;
      const theme =
        rawVisual.theme === 'dark'
          ? 'dark'
          : rawVisual.theme === 'light'
            ? 'light'
            : current.visual.theme;
      const fontSize = ['small', 'normal', 'large', 'xlarge'].includes(
        String(rawVisual.fontSize)
      )
        ? (rawVisual.fontSize as StoreVisual['fontSize'])
        : current.visual.fontSize;

      const nextNavigation = Array.isArray(body.navigation)
        ? normalizeContainerNavigation(body.navigation)
        : normalizeContainerNavigation(current.navigation);
      const nextCustomPages = Array.isArray(body.customPages)
        ? normalizeCustomPages(body.customPages)
        : normalizeCustomPages(current.customPages);
      const currentNavigation = normalizeContainerNavigation(current.navigation);
      const currentCustomPages = normalizeCustomPages(current.customPages);
      const structureChanged =
        JSON.stringify(current.modules) !== JSON.stringify({ encomendas: requestedEncomendas }) ||
        JSON.stringify(currentNavigation) !== JSON.stringify(nextNavigation) ||
        JSON.stringify(currentCustomPages) !== JSON.stringify(nextCustomPages);

      const updated: StoreTemplateRecord = {
        ...current,
        name: stringValue(body.name) || current.name,
        updatedAt: now(),
        version: (current.version ?? 1) + (structureChanged ? 1 : 0),
        modules: { encomendas: requestedEncomendas },
        reserves: {
          generalPct: Math.max(
            0,
            numberValue(reserves.generalPct, current.reserves.generalPct)
          ),
          cashPct: Math.max(
            0,
            numberValue(reserves.cashPct, current.reserves.cashPct)
          ),
        },
        channels: channelSettings(body.channels, current.channels),
        navigation: nextNavigation,
        customPages: nextCustomPages,
        visual: {
          theme,
          primary: hex(rawVisual.primary, current.visual.primary),
          accent: hex(rawVisual.accent, current.visual.accent),
          fontSize,
        },
      };

      const [ok] = await db.update('store_templates', [
        { id: ctx.params.id, record: updated },
      ]);
      if (!ok) return error('Falha ao salvar o ambiente-modelo.', 500);
      return json({ id: ctx.params.id, ...updated });
    },
  ],

  'POST /api/superadmin/templates/:id/duplicate': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin duplica containers.', 403);
      const [current] = await db.get<StoreTemplateRecord>('store_templates', [
        ctx.params.id,
      ]);
      if (!current) return error('Container não encontrado.', 404);
      const body = ctx.body as Record<string, unknown>;
      const name = stringValue(body.name) || current.name + ' - Cópia';
      const record: StoreTemplateRecord = {
        ...current,
        name,
        sourceLabel: 'Cópia do container ' + current.name,
        createdAt: now(),
        updatedAt: now(),
        version: 1,
        navigation: normalizeContainerNavigation(current.navigation),
        customPages: normalizeCustomPages(current.customPages),
      };
      const [id] = await db.add('store_templates', [record]);
      if (!id) return error('Falha ao duplicar container.', 500);
      return json({ id, ...record });
    },
  ],

  'DELETE /api/superadmin/templates/:id': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin exclui containers.', 403);
      const [ok] = await db.delete('store_templates', [ctx.params.id]);
      return ok
        ? json({ ok: true })
        : error('Falha ao excluir container.', 500);
    },
  ],

  'POST /api/stores': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin pode criar empresas.', 403);
      const body = ctx.body as Record<string, unknown>;
      const name = stringValue(body.name);
      const containerIds = Array.isArray(body.containerIds)
        ? body.containerIds
            .map(value => stringValue(value))
            .filter(Boolean)
            .slice(0, 10)
        : [];
      if (!name) return error('Informe o nome da empresa.', 400);
      let record = defaultStore(name);
      if (containerIds.length) {
        const templates = await db.get<StoreTemplateRecord>(
          'store_templates',
          containerIds
        );
        for (let index = 0; index < containerIds.length; index += 1) {
          const template = templates[index];
          if (!template)
            return error('Um dos containers selecionados não existe mais.', 404);
          record = installContainerPackage(record, containerIds[index], template);
        }
      }
      const [id] = await db.add('stores', [record]);
      if (!id) return error('Falha ao criar empresa.', 500);
      const store = await getStore(id);
      return json(await storeWithLogo(id, store!));
    },
  ],

  'PUT /api/superadmin/stores/:storeId/structure': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin personaliza a estrutura da empresa.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Empresa não encontrada.', 404);
      const body = ctx.body as Record<string, unknown>;
      const navigation = Array.isArray(body.navigation)
        ? normalizeNavigation(body.navigation)
        : normalizeNavigation(store.navigation);
      const customPages = Array.isArray(body.customPages)
        ? normalizeCustomPages(body.customPages)
        : normalizeCustomPages(store.customPages);
      const updated: StoreRecord = {
        ...store,
        navigation,
        customPages,
        structureCustomized: true,
        structureUpdatedAt: now(),
      };
      const [ok] = await db.update('stores', [
        { id: ctx.params.storeId, record: updated },
      ]);
      if (!ok) return error('Falha ao salvar a estrutura da empresa.', 500);
      return json(await storeWithLogo(ctx.params.storeId, updated, undefined, true));
    },
  ],

  'POST /api/superadmin/stores/:storeId/containers/:containerId': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin instala containers.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Empresa não encontrada.', 404);
      const [container] = await db.get<StoreTemplateRecord>(
        'store_templates',
        [ctx.params.containerId]
      );
      if (!container) return error('Container não encontrado no Studio.', 404);
      const updated = installContainerPackage(
        store,
        ctx.params.containerId,
        container
      );
      const [ok] = await db.update('stores', [
        { id: ctx.params.storeId, record: updated },
      ]);
      if (!ok) return error('Falha ao instalar o container.', 500);
      return json(await storeWithLogo(ctx.params.storeId, updated, undefined, true));
    },
  ],

  'DELETE /api/superadmin/stores/:storeId/containers/:containerId': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if ((await systemOwner()) !== user.userId)
        return error('Apenas o Superadmin remove containers.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Empresa não encontrada.', 404);
      if (!(store.installedContainers ?? []).some(
        item => item.containerId === ctx.params.containerId
      ))
        return error('Este container não está instalado nesta empresa.', 404);
      const updated = removeContainerPackage(store, ctx.params.containerId);
      const [ok] = await db.update('stores', [
        { id: ctx.params.storeId, record: updated },
      ]);
      if (!ok) return error('Falha ao remover o container.', 500);
      return json(await storeWithLogo(ctx.params.storeId, updated, undefined, true));
    },
  ],

  'GET /api/stores/:storeId/custom-pages/:pageId/submissions': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (role !== 'superadmin' && role !== 'admin')
        return error('Apenas Administrador ou Superadmin consulta os registros.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Empresa não encontrada.', 404);
      const pageId = safeDefinitionId(ctx.params.pageId);
      const page = normalizeCustomPages(store.customPages).find(item => item.id === pageId);
      if (!page) return error('Página personalizada não encontrada.', 404);
      const result = await db.list<CustomPageSubmission>(
        customPageTable(ctx.params.storeId, pageId),
        { limit: 100 }
      );
      return json({
        items: result.items
          .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
          .slice(0, 50),
      });
    },
  ],

  'POST /api/stores/:storeId/custom-pages/:pageId/submissions': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (!role) return error('Sem acesso a esta empresa.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Empresa não encontrada.', 404);
      const pageId = safeDefinitionId(ctx.params.pageId);
      const page = normalizeCustomPages(store.customPages).find(item => item.id === pageId);
      if (!page) return error('Página personalizada não encontrada.', 404);
      const nav = normalizeNavigation(store.navigation).find(item => item.key === 'custom:' + pageId);
      if (!nav || !nav.enabled || !nav.roles.includes(role))
        return error('Seu perfil não possui acesso a esta página.', 403);

      const body = ctx.body as Record<string, unknown>;
      const blockId = safeDefinitionId(body.blockId);
      const block = page.blocks.find(item => item.id === blockId && item.type === 'form');
      if (!block) return error('Formulário não encontrado.', 404);
      const rawValues = body.values && typeof body.values === 'object'
        ? body.values as Record<string, unknown>
        : {};
      const values: Record<string, string | number | boolean> = {};

      for (const field of block.fields ?? []) {
        const rawValue = rawValues[field.id];
        if (field.type === 'checkbox') {
          const value = rawValue === true;
          if (field.required && !value)
            return error('Preencha o campo obrigatório: ' + field.label, 400);
          values[field.id] = value;
          continue;
        }
        if (field.type === 'number') {
          if ((rawValue === '' || rawValue === null || rawValue === undefined) && field.required)
            return error('Preencha o campo obrigatório: ' + field.label, 400);
          const value = rawValue === '' || rawValue === null || rawValue === undefined
            ? ''
            : Number(rawValue);
          if (value !== '' && !Number.isFinite(value))
            return error('Informe um número válido em ' + field.label + '.', 400);
          values[field.id] = value;
          continue;
        }
        const value = String(rawValue ?? '').trim().slice(0, 2000);
        if (field.required && !value)
          return error('Preencha o campo obrigatório: ' + field.label, 400);
        if (field.type === 'select' && value && !(field.options ?? []).includes(value))
          return error('Opção inválida em ' + field.label + '.', 400);
        values[field.id] = value;
      }

      const record: CustomPageSubmission = {
        pageId,
        blockId,
        values,
        createdAt: now(),
        createdBy: user.email ?? user.userId,
      };
      const [id] = await db.add(customPageTable(ctx.params.storeId, pageId), [record]);
      if (!id) return error('Falha ao salvar os dados do formulário.', 500);
      return json({ id, ...record });
    },
  ],

  'DELETE /api/stores/:storeId/custom-pages/:pageId/submissions/:submissionId': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (role !== 'superadmin' && role !== 'admin')
        return error('Apenas Administrador ou Superadmin exclui registros.', 403);
      const pageId = safeDefinitionId(ctx.params.pageId);
      const [ok] = await db.delete(
        customPageTable(ctx.params.storeId, pageId),
        [ctx.params.submissionId]
      );
      return ok ? json({ ok: true }) : error('Registro não encontrado.', 404);
    },
  ],

  'POST /api/stores/:storeId/members': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (role !== 'superadmin' && role !== 'admin')
        return error('Sem permissão para gerenciar acessos.', 403);

      const body = ctx.body as Record<string, unknown>;
      const email = stringValue(body.email).toLowerCase();
      const memberRole = body.role === 'admin'
        ? 'admin'
        : body.role === 'operator'
          ? 'operator'
          : null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return error('Informe um e-mail válido.', 400);
      if (!memberRole)
        return error('Escolha Administrador ou Operador.', 400);

      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const members = [...(store.members ?? [])];
      if (members.some(member => member.email === email))
        return error('Este e-mail já possui acesso nesta empresa.', 409);

      members.push({ email, role: memberRole });
      const [ok] = await db.update('stores', [
        {
          id: ctx.params.storeId,
          record: { ...store, members },
        },
      ]);
      if (!ok) return error('Falha ao liberar o acesso.', 500);
      return json({ ok: true, email, role: memberRole });
    },
  ],

  'PUT /api/stores/:storeId/members': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const actorRole = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (actorRole !== 'superadmin' && actorRole !== 'admin')
        return error('Sem permissão para gerenciar acessos.', 403);

      const body = ctx.body as Record<string, unknown>;
      const currentEmail = stringValue(body.currentEmail).toLowerCase();
      const email = stringValue(body.email).toLowerCase();
      const memberRole = body.role === 'admin'
        ? 'admin'
        : body.role === 'operator'
          ? 'operator'
          : null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(currentEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return error('Informe um e-mail válido.', 400);
      if (!memberRole)
        return error('Escolha Administrador ou Operador.', 400);

      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const members = [...(store.members ?? [])];
      const index = members.findIndex(member => member.email === currentEmail);
      if (index < 0) return error('Acesso não encontrado.', 404);
      if (
        email !== currentEmail &&
        members.some(member => member.email === email)
      )
        return error('O novo e-mail já possui acesso nesta empresa.', 409);

      const actorEmail = stringValue(user.email).toLowerCase();
      if (
        actorRole === 'admin' &&
        actorEmail === currentEmail &&
        email !== currentEmail
      )
        return error('Um Administrador não pode trocar o e-mail do próprio acesso.', 400);

      const current = members[index];
      const adminCount = members.filter(member => member.role === 'admin').length;
      if (
        current.role === 'admin' &&
        memberRole !== 'admin' &&
        adminCount <= 1
      )
        return error('A empresa precisa manter pelo menos um Administrador.', 400);

      members[index] = { email, role: memberRole };
      const [ok] = await db.update('stores', [
        {
          id: ctx.params.storeId,
          record: { ...store, members },
        },
      ]);
      if (!ok) return error('Falha ao atualizar o acesso.', 500);
      return json({ ok: true, previousEmail: currentEmail, email, role: memberRole });
    },
  ],

  'DELETE /api/stores/:storeId/members': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const actorRole = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (actorRole !== 'superadmin' && actorRole !== 'admin')
        return error('Sem permissão para gerenciar acessos.', 403);

      const body = ctx.body as Record<string, unknown>;
      const email = stringValue(body.email).toLowerCase();
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const members = [...(store.members ?? [])];
      const index = members.findIndex(member => member.email === email);
      if (index < 0) return error('Acesso não encontrado.', 404);

      const member = members[index];
      const adminCount = members.filter(item => item.role === 'admin').length;
      if (member.role === 'admin' && adminCount <= 1)
        return error('A empresa precisa manter pelo menos um Administrador.', 400);

      members.splice(index, 1);
      const [ok] = await db.update('stores', [
        {
          id: ctx.params.storeId,
          record: { ...store, members },
        },
      ]);
      if (!ok) return error('Falha ao revogar o acesso.', 500);
      return json({ ok: true, email });
    },
  ],

  'PUT /api/stores/:storeId/visual': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (!role) return error('Sem acesso a esta loja.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const body = ctx.body as Record<string, unknown>;
      const raw = body.visual && typeof body.visual === 'object'
        ? body.visual as Record<string, unknown>
        : {};
      const current = store.visual ?? {
        theme: 'light',
        primary: '#111827',
        accent: '#2563eb',
        fontSize: 'normal',
      };
      const hex = (value: unknown, fallback: string) =>
        typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
          ? value
          : fallback;
      const visual: StoreVisual = {
        theme: raw.theme === 'dark' ? 'dark' : raw.theme === 'light' ? 'light' : current.theme,
        primary: hex(raw.primary, current.primary),
        accent: hex(raw.accent, current.accent),
        fontSize: ['small', 'normal', 'large', 'xlarge'].includes(String(raw.fontSize))
          ? raw.fontSize as StoreVisual['fontSize']
          : current.fontSize,
      };
      const updated: StoreRecord = { ...store, visual };
      const [ok] = await db.update('stores', [
        { id: ctx.params.storeId, record: updated },
      ]);
      if (!ok) return error('Falha ao salvar aparência.', 500);
      return json(await storeWithLogo(ctx.params.storeId, updated));
    },
  ],

  'PUT /api/stores/:storeId/settings': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (role !== 'superadmin' && role !== 'admin')
        return error(
          'Apenas administradores alteram a estrutura da loja.',
          403
        );
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const body = ctx.body as Record<string, unknown>;
      const modules = (
        body.modules && typeof body.modules === 'object' ? body.modules : {}
      ) as { encomendas?: unknown };
      const reserves = (
        body.reserves && typeof body.reserves === 'object' ? body.reserves : {}
      ) as Record<string, unknown>;
      const systemModules = await getSystemModules();
      const requestedEncomendas =
        typeof modules.encomendas === 'boolean'
          ? modules.encomendas
          : store.modules.encomendas;
      if (requestedEncomendas && !systemModules.encomendasAvailable)
        return error(
          'O módulo Encomendas não está disponível no Container Base.',
          400
        );
      const updated: StoreRecord = {
        ...store,
        name: stringValue(body.name) || store.name,
        modules: {
          encomendas: requestedEncomendas,
        },
        reserves: {
          generalPct: Math.max(
            0,
            numberValue(reserves.generalPct, store.reserves.generalPct)
          ),
          cashPct: Math.max(
            0,
            numberValue(reserves.cashPct, store.reserves.cashPct)
          ),
        },
        channels: channelSettings(body.channels, store.channels),
        visual: (() => {
          const raw = body.visual && typeof body.visual === 'object' ? body.visual as Record<string, unknown> : {};
          const current = store.visual ?? { theme: 'light', primary: '#111827', accent: '#2563eb', fontSize: 'normal' };
          const hex = (value: unknown, fallback: string) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
          const theme = raw.theme === 'dark' ? 'dark' : raw.theme === 'light' ? 'light' : current.theme;
          const fontSize = ['small','normal','large','xlarge'].includes(String(raw.fontSize)) ? raw.fontSize as StoreVisual['fontSize'] : current.fontSize;
          return { theme, primary: hex(raw.primary, current.primary), accent: hex(raw.accent, current.accent), fontSize };
        })(),
      };
      const [ok] = await db.update('stores', [
        { id: ctx.params.storeId, record: updated },
      ]);
      if (!ok) return error('Falha ao salvar configurações.', 500);
      return json(await storeWithLogo(ctx.params.storeId, updated));
    },
  ],

  'GET /api/stores/:storeId/logo-source': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(
        user.userId,
        ctx.params.storeId,
        user.email
      );
      if (!role) return error('Sem acesso a esta loja.', 403);

      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      if (!store.logoPath) return error('Esta loja ainda não possui logo.', 404);

      const [file] = await storage.read([store.logoPath]);
      if (!file?.content) return error('Não foi possível ler o logo atual.', 404);

      const content = file.content;
      const contentType = content.startsWith('iVBOR')
        ? 'image/png'
        : content.startsWith('/9j/')
          ? 'image/jpeg'
          : content.startsWith('UklGR')
            ? 'image/webp'
            : content.startsWith('R0lGOD')
              ? 'image/gif'
              : content.startsWith('PHN2Zy') || content.startsWith('PD94bWwg')
                ? 'image/svg+xml'
                : 'image/png';

      return json({ base64: content, contentType });
    },
  ],

  'POST /api/stores/:storeId/logo': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      const role = await requireStore(user.userId, ctx.params.storeId, user.email);
      if (!role) return error('Sem acesso a esta loja.', 403);
      const body = ctx.body as Record<string, unknown>;
      const content = stringValue(body.base64);
      const contentType = stringValue(body.contentType);
      if (!content || !contentType.startsWith('image/'))
        return error('Envie uma imagem válida.', 400);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const dataUrl = `data:${contentType};base64,${content}`;
      const updated = { ...store, logoPath: dataUrl };
      await db.update('stores', [{ id: ctx.params.storeId, record: updated }]);
      return json(await storeWithLogo(ctx.params.storeId, updated));
    },
  ],

  'GET /api/stores/:storeId/workspace': [
    requireAuth(),
    async ctx => {
      if (
        !(await requireStore(
          ctx.user!.userId,
          ctx.params.storeId,
          ctx.user!.email
        ))
      )
        return error('Sem acesso a esta loja.', 403);

      const scope = stringValue(ctx.query.scope) || 'venda';
      const includeIngredients = scope === 'insumos' || scope === 'receitas';
      const includeRecipes =
        scope === 'receitas' ||
        scope === 'precificacao' ||
        scope === 'cardapio';
      const includeProducts =
        scope === 'venda' ||
        scope === 'precificacao' ||
        scope === 'cardapio';

      const [ingredientResult, recipeResult, productResult] = await Promise.all([
        includeIngredients
          ? db.list<IngredientRecord>(table('ingredients', ctx.params.storeId), {
              limit: 500,
            })
          : Promise.resolve(null),
        includeRecipes
          ? db.list<RecipeRecord>(table('recipes', ctx.params.storeId), {
              limit: 500,
            })
          : Promise.resolve(null),
        includeProducts
          ? db.list<ProductRecord>(table('products', ctx.params.storeId), {
              limit: 500,
            })
          : Promise.resolve(null),
      ]);

      return json({
        scope,
        ingredients: ingredientResult?.items,
        recipes: recipeResult?.items,
        products: productResult?.items,
        truncated: {
          ingredients: Boolean(ingredientResult?.nextToken),
          recipes: Boolean(recipeResult?.nextToken),
          products: Boolean(productResult?.nextToken),
        },
      });
    },
  ],

  'GET /api/stores/:storeId/ingredients': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      const result = await db.list<IngredientRecord>(
        table('ingredients', ctx.params.storeId),
        { limit: 200 }
      );
      return json(result);
    },
  ],

  'POST /api/stores/:storeId/ingredients': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      const body = ctx.body as Record<string, unknown>;
      const name = stringValue(body.name);
      const unit = stringValue(body.unit) || 'un';
      const packageQty = Math.max(0.0001, numberValue(body.packageQty, 1));
      const packageCost = Math.max(0, numberValue(body.packageCost));
      if (!name) return error('Informe o nome do insumo.', 400);
      const record: IngredientRecord = {
        name,
        unit,
        packageQty,
        packageCost,
        unitCost: packageCost / packageQty,
        supplier: stringValue(body.supplier) || undefined,
        updatedAt: now(),
      };
      const [id] = await db.add(table('ingredients', ctx.params.storeId), [
        record,
      ]);
      if (!id) return error('Falha ao cadastrar insumo.', 500);
      return json({ id, ...record });
    },
  ],

  'PUT /api/stores/:storeId/ingredients/:id': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      const body = ctx.body as Record<string, unknown>;
      const name = stringValue(body.name);
      if (!name) return error('Informe o nome do insumo.', 400);
      const packageQty = Math.max(0.0001, numberValue(body.packageQty, 1));
      const packageCost = Math.max(0, numberValue(body.packageCost));
      const record: IngredientRecord = {
        name,
        unit: stringValue(body.unit) || 'un',
        packageQty,
        packageCost,
        unitCost: packageCost / packageQty,
        supplier: stringValue(body.supplier) || undefined,
        updatedAt: now(),
      };
      const [ok] = await db.update(table('ingredients', ctx.params.storeId), [
        { id: ctx.params.id, record },
      ]);
      if (!ok) return error('Falha ao atualizar insumo.', 500);

      const recipes = await db.list<RecipeRecord>(
        table('recipes', ctx.params.storeId),
        { limit: 100 }
      );
      const affectedRecipes = recipes.items.filter(recipe =>
        recipe.items.some(item => item.ingredientId === ctx.params.id)
      );

      if (affectedRecipes.length) {
        const recipeUpdates = affectedRecipes.map(recipe => {
          const nextItems = recipe.items.map(item => {
            if (item.ingredientId !== ctx.params.id) return item;
            const cost = item.quantity * record.unitCost;
            return {
              ...item,
              ingredientName: record.name,
              unit: record.unit,
              unitCost: record.unitCost,
              cost,
            };
          });
          const totalCost = nextItems.reduce(
            (sum, item) => sum + item.cost,
            0
          );
          const nextRecipe: RecipeRecord = {
            ...recipe,
            items: nextItems,
            totalCost,
            unitCost: totalCost / recipe.yieldQty,
            updatedAt: now(),
          };
          return { id: recipe.id, record: nextRecipe };
        });

        const updatedRecipes = await db.update(
          table('recipes', ctx.params.storeId),
          recipeUpdates
        );
        if (!updatedRecipes.every(Boolean))
          return error(
            'Insumo salvo, mas houve falha ao recalcular receitas.',
            500
          );

        const recipeCostById = new Map(
          recipeUpdates.map(update => [
            update.id,
            update.record.unitCost,
          ])
        );
        const products = await db.list<ProductRecord>(
          table('products', ctx.params.storeId),
          { limit: 150 }
        );
        const productUpdates = products.items
          .filter(
            product =>
              product.recipeId &&
              recipeCostById.has(product.recipeId)
          )
          .map(product => ({
            id: product.id,
            record: {
              name: product.name,
              recipeId: product.recipeId,
              manualCost: product.manualCost,
              packagingCost: product.packagingCost,
              cost:
                (recipeCostById.get(product.recipeId!) ?? 0) +
                product.manualCost +
                product.packagingCost,
              prices: product.prices,
              updatedAt: now(),
            },
          }));

        if (productUpdates.length) {
          const updatedProducts = await db.update(
            table('products', ctx.params.storeId),
            productUpdates
          );
          if (!updatedProducts.every(Boolean))
            return error(
              'Insumo e receitas salvos, mas houve falha ao atualizar a precificação.',
              500
            );
        }
      }

      return json({
        id: ctx.params.id,
        ...record,
        affectedRecipes: affectedRecipes.length,
      });
    },
  ],

  'DELETE /api/stores/:storeId/ingredients/:id': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      const [ok] = await db.delete(table('ingredients', ctx.params.storeId), [
        ctx.params.id,
      ]);
      return ok ? json({ ok: true }) : error('Falha ao excluir insumo.', 500);
    },
  ],

  'GET /api/stores/:storeId/recipes': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      return json(
        await db.list<RecipeRecord>(table('recipes', ctx.params.storeId), {
          limit: 100,
        })
      );
    },
  ],

  'POST /api/stores/:storeId/recipes': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      try {
        const body = {
          ...(ctx.body as Record<string, unknown>),
          tableName: table('ingredients', ctx.params.storeId),
        };
        const record = await calculateRecipe(body);
        const [id] = await db.add(table('recipes', ctx.params.storeId), [
          record,
        ]);
        if (!id) return error('Falha ao cadastrar receita.', 500);
        return json({ id, ...record });
      } catch (cause) {
        return error(
          cause instanceof Error ? cause.message : 'Receita inválida.',
          400
        );
      }
    },
  ],

  'PUT /api/stores/:storeId/recipes/:id': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      try {
        const body = {
          ...(ctx.body as Record<string, unknown>),
          tableName: table('ingredients', ctx.params.storeId),
        };
        const record = await calculateRecipe(body);
        const [ok] = await db.update(table('recipes', ctx.params.storeId), [
          { id: ctx.params.id, record },
        ]);
        if (!ok) return error('Falha ao atualizar receita.', 500);

        const products = await db.list<ProductRecord>(
          table('products', ctx.params.storeId),
          { limit: 150 }
        );
        const linked = products.items.filter(
          product => product.recipeId === ctx.params.id
        );
        if (linked.length) {
          await db.update(
            table('products', ctx.params.storeId),
            linked.map(product => ({
              id: product.id,
              record: {
                name: record.name,
                recipeId: ctx.params.id,
                manualCost: product.manualCost,
                packagingCost: product.packagingCost,
                cost:
                  record.unitCost +
                  product.manualCost +
                  product.packagingCost,
                prices: product.prices,
                updatedAt: now(),
              },
            }))
          );
        }

        return json({ id: ctx.params.id, ...record });
      } catch (cause) {
        console.warn('RECIPE_UPDATE_FAILED', {
          storeId: ctx.params.storeId,
          recipeId: ctx.params.id,
          message:
            cause instanceof Error ? cause.message : 'Receita inválida.',
        });
        return error(
          cause instanceof Error ? cause.message : 'Receita inválida.',
          400
        );
      }
    },
  ],

  'DELETE /api/stores/:storeId/recipes/:id': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);

      const products = await db.list<ProductRecord>(
        table('products', ctx.params.storeId),
        { limit: 150 }
      );
      const linkedProductIds = products.items
        .filter(product => product.recipeId === ctx.params.id)
        .map(product => product.id);

      if (linkedProductIds.length) {
        const removedProducts = await db.delete(
          table('products', ctx.params.storeId),
          linkedProductIds
        );
        if (!removedProducts.every(Boolean))
          return error('Falha ao remover a precificação vinculada.', 500);
      }

      const [ok] = await db.delete(table('recipes', ctx.params.storeId), [
        ctx.params.id,
      ]);
      return ok
        ? json({ ok: true, removedPricing: linkedProductIds.length })
        : error('Falha ao excluir receita.', 500);
    },
  ],

  'GET /api/stores/:storeId/products': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);      return json(
        await db.list<ProductRecord>(table('products', ctx.params.storeId), {
          limit: 150,
        })
      );
    },
  ],

  'POST /api/stores/:storeId/products': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      try {
        const record = await productFromBody(
          ctx.body as Record<string, unknown>,
          ctx.params.storeId
        );
        const [id] = await db.add(table('products', ctx.params.storeId), [
          record,
        ]);
        if (!id) return error('Falha ao cadastrar produto.', 500);
        return json({ id, ...record });
      } catch (cause) {
        return error(
          cause instanceof Error ? cause.message : 'Produto inválido.',
          400
        );
      }
    },
  ],

  'PUT /api/stores/:storeId/products/:id': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      try {
        const record = await productFromBody(
          ctx.body as Record<string, unknown>,
          ctx.params.storeId
        );
        const [ok] = await db.update(table('products', ctx.params.storeId), [
          { id: ctx.params.id, record },
        ]);
        if (!ok) return error('Falha ao atualizar produto.', 500);
        return json({ id: ctx.params.id, ...record });
      } catch (cause) {
        return error(
          cause instanceof Error ? cause.message : 'Produto inválido.',
          400
        );
      }
    },
  ],

  'DELETE /api/stores/:storeId/products/:id': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      const [ok] = await db.delete(table('products', ctx.params.storeId), [
        ctx.params.id,
      ]);
      return ok ? json({ ok: true }) : error('Falha ao excluir produto.', 500);
    },
  ],

  'GET /api/stores/:storeId/sales': [
    requireAuth(),
    async ctx => {
      if (
        !(await requireStore(
          ctx.user!.userId,
          ctx.params.storeId,
          ctx.user!.email
        ))
      )
        return error('Sem acesso a esta loja.', 403);

      const startAt = ctx.query.startAt
        ? new Date(ctx.query.startAt).getTime()
        : 0;
      const endAt = ctx.query.endAt
        ? new Date(ctx.query.endAt).getTime()
        : Date.now();

      if (!Number.isFinite(startAt) || !Number.isFinite(endAt))
        return error('Período inválido.', 400);
      if (startAt > endAt)
        return error('A data inicial não pode ser maior que a final.', 400);

      const result = await db.list<SaleRecord>(
        table('sales', ctx.params.storeId),
        { limit: 200 }
      );

      const items = result.items
        .filter(sale => {
          const stamp = new Date(sale.createdAt).getTime();
          return stamp >= startAt && stamp <= endAt;
        })
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        );

      return json({
        items,
        count: items.length,
        gross: items.reduce((sum, sale) => sum + sale.gross, 0),
        truncated: Boolean(result.nextToken),
      });
    },
  ],

  'DELETE /api/stores/:storeId/sales/:id': [
    requireAuth(),
    async ctx => {
      const role = await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email);
      if (!role) return error('Sem acesso a esta loja.', 403);
      const [ok] = await db.delete(table('sales', ctx.params.storeId), [ctx.params.id]);
      return ok ? json({ ok: true }) : error('Falha ao excluir venda.', 500);
    },
  ],

  'POST /api/stores/:storeId/sales': [
    requireAuth(),
    async ctx => {
      const user = ctx.user!;
      if (!(await requireStore(user.userId, ctx.params.storeId, user.email)))
        return error('Sem acesso a esta loja.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const body = ctx.body as Record<string, unknown>;
      const channel: ChannelKey = 'porta';
      const rawItems = Array.isArray(body.items) ? body.items : [];
      if (!rawItems.length)
        return error('Adicione pelo menos um produto.', 400);
      const ids = rawItems
        .map(item => stringValue((item as Record<string, unknown>).productId))
        .filter(Boolean);
      const products = await db.get<ProductRecord>(
        table('products', ctx.params.storeId),
        ids
      );
      const items: SaleItem[] = [];
      let gross = 0;
      let productCost = 0;
      for (let i = 0; i < ids.length; i += 1) {
        const product = products[i];
        if (!product) return error('Um dos produtos não foi encontrado.', 400);
        const quantity = Math.max(
          1,
          Math.floor(
            numberValue((rawItems[i] as Record<string, unknown>).quantity, 1)
          )
        );
        const unitPrice = product.prices[channel];
        const revenue = unitPrice * quantity;
        const cost = product.cost * quantity;
        gross += revenue;
        productCost += cost;
        items.push({
          productId: ids[i],
          productName: product.name,
          quantity,
          unitPrice,
          unitCost: product.cost,
          revenue,
          cost,
        });
      }
      const cfg = store.channels.porta;
      const paymentMethod = stringValue(body.paymentMethod) || 'pix';
      const cardPct = ['credito', 'debito'].includes(paymentMethod)
        ? cfg.cardPct
        : 0;
      const channelFees =
        (gross * (cfg.platformPct + cardPct)) / 100;
      const monthlyAllocation = (gross * cfg.monthlyPct) / 100;
      const promoUnits = items.reduce((sum, item) => sum + item.quantity, 0);
      const promoFees = cfg.promoEnabled ? cfg.promoFee * promoUnits : 0;
      const fees = channelFees + monthlyAllocation + promoFees;
      const generalReserve = (gross * store.reserves.generalPct) / 100;
      const cashReserve = (gross * store.reserves.cashPct) / 100;
      const record: SaleRecord = {
        channel,
        paymentMethod,
        items,
        gross,
        productCost,
        fees,
        channelFees,
        monthlyFees: monthlyAllocation,
        promoFees,
        generalReserve,
        cashReserve,
        estimatedProfit:
          gross - productCost - fees - generalReserve - cashReserve,
        pricingSnapshot: {
          channel: { ...cfg },
          appliedCardPct: cardPct,
          reserves: { ...store.reserves },
        },
        createdAt: now(),
        createdBy: user.userId,
      };
      const [id] = await db.add(table('sales', ctx.params.storeId), [record]);
      if (!id) return error('Falha ao registrar venda.', 500);
      return json({ id, ...record });
    },
  ],

  'GET /api/stores/:storeId/finance': [
    requireAuth(),
    async ctx => {
      if (!(await requireStore(ctx.user!.userId, ctx.params.storeId, ctx.user!.email)))
        return error('Sem acesso a esta loja.', 403);
      const store = await getStore(ctx.params.storeId);
      if (!store) return error('Loja não encontrada.', 404);
      const start = ctx.query.start ? new Date(ctx.query.start).getTime() : 0;
      const end = ctx.query.end
        ? new Date(ctx.query.end + 'T23:59:59').getTime()
        : Date.now();
      const result = await db.list<SaleRecord>(
        table('sales', ctx.params.storeId),
        { limit: 200 }
      );
      const sales = result.items.filter(sale => {
        const stamp = new Date(sale.createdAt).getTime();
        return stamp >= start && stamp <= end;
      });
      const byChannel: Record<ChannelKey, number> = {
        porta: 0,
        ifood: 0,
        '99': 0,
        encomenda: 0,
      };
      let gross = 0;
      let productCost = 0;
      let fees = 0;
      let monthlyFees = 0;
      let promoFees = 0;
      let generalReserve = 0;
      let cashReserve = 0;
      let estimatedProfit = 0;

      for (const sale of sales) {
        const storedChannelFees = sale.channelFees ?? sale.fees;
        const storedMonthlyFees = sale.monthlyFees ?? 0;
        const storedPromoFees = sale.promoFees ?? 0;

        byChannel[sale.channel] += sale.gross;
        gross += sale.gross;
        productCost += sale.productCost;
        fees += storedChannelFees;
        monthlyFees += storedMonthlyFees;
        promoFees += storedPromoFees;
        generalReserve += sale.generalReserve;
        cashReserve += sale.cashReserve;
        estimatedProfit += sale.estimatedProfit;
      }

      return json({
        count: sales.length,
        gross,
        productCost,
        fees,
        monthlyFees,
        promoFees,
        generalReserve,
        cashReserve,
        estimatedProfit,
        byChannel,
        truncated: Boolean(result.nextToken),
      });
    },
  ],
});
