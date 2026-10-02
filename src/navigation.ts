export type NavigationRole = 'superadmin' | 'admin' | 'operator';

export type NativeNavigationItemKey =
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

export type NavigationItemKey = NativeNavigationItemKey | `custom:${string}`;

export type NavigationIconKey =
  | 'shopping-cart'
  | 'book-open'
  | 'package'
  | 'chef-hat'
  | 'calculator'
  | 'circle-dollar-sign'
  | 'history'
  | 'settings'
  | 'users'
  | 'store'
  | 'boxes';

export type NavigationItem = {
  key: NavigationItemKey;
  label: string;
  group: string;
  icon: NavigationIconKey;
  order: number;
  enabled: boolean;
  roles: NavigationRole[];
};

export type NavigationCatalogItem = Omit<NavigationItem, 'order' | 'enabled'> & {
  key: NativeNavigationItemKey;
  description: string;
};

export const NAVIGATION_CATALOG: NavigationCatalogItem[] = [
  {
    key: 'venda',
    label: 'Venda',
    group: 'Operação',
    icon: 'shopping-cart',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Lançamento de vendas diretas.',
  },
  {
    key: 'cardapio',
    label: 'Cardápio',
    group: 'Operação',
    icon: 'book-open',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Consulta do catálogo e preços por canal.',
  },
  {
    key: 'insumos',
    label: 'Insumos',
    group: 'Produtos',
    icon: 'package',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Cadastro de itens de custo e estoque-base.',
  },
  {
    key: 'receitas',
    label: 'Receita',
    group: 'Produtos',
    icon: 'chef-hat',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Composição e custo de produtos.',
  },
  {
    key: 'precificacao',
    label: 'Precificação',
    group: 'Produtos',
    icon: 'calculator',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Formação e ajuste de preços.',
  },
  {
    key: 'financeiro',
    label: 'Financeiro',
    group: 'Gestão',
    icon: 'circle-dollar-sign',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Fechamento e lucro estimado.',
  },
  {
    key: 'historico',
    label: 'Histórico de vendas',
    group: 'Gestão',
    icon: 'history',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Consulta e manutenção do histórico.',
  },
  {
    key: 'config',
    label: 'Taxas',
    group: 'Administração',
    icon: 'settings',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Taxas, reservas e parâmetros comerciais.',
  },
  {
    key: 'usuarios',
    label: 'Usuários',
    group: 'Administração',
    icon: 'users',
    roles: ['superadmin', 'admin'],
    description: 'Gestão de acessos da empresa.',
  },
  {
    key: 'aparencia',
    label: 'Configurações',
    group: 'Administração',
    icon: 'store',
    roles: ['superadmin', 'admin', 'operator'],
    description: 'Identidade visual e preferências da empresa.',
  },
];

export const NAVIGATION_ICON_OPTIONS = [
  { value: 'shopping-cart', label: 'Carrinho / Venda' },
  { value: 'book-open', label: 'Livro / Catálogo' },
  { value: 'package', label: 'Caixa / Produto' },
  { value: 'chef-hat', label: 'Produção / Receita' },
  { value: 'calculator', label: 'Calculadora' },
  { value: 'circle-dollar-sign', label: 'Financeiro' },
  { value: 'history', label: 'Histórico' },
  { value: 'settings', label: 'Configurações' },
  { value: 'users', label: 'Usuários' },
  { value: 'store', label: 'Empresa' },
  { value: 'boxes', label: 'Módulos / Personalizado' },
] satisfies Array<{ value: NavigationIconKey; label: string }>;

export const NAVIGATION_ROLE_OPTIONS = [
  { value: 'superadmin', label: 'Superadmin' },
  { value: 'admin', label: 'Administrador' },
  { value: 'operator', label: 'Operador' },
] satisfies Array<{ value: NavigationRole; label: string }>;

export function isCustomNavigationKey(
  key: NavigationItemKey | string
): key is `custom:${string}` {
  return key.startsWith('custom:');
}

export function customPageIdFromKey(key: NavigationItemKey | string) {
  return isCustomNavigationKey(key) ? key.slice('custom:'.length) : '';
}

export function defaultNavigationItems(): NavigationItem[] {
  return NAVIGATION_CATALOG.map((item, order) => ({
    key: item.key,
    label: item.label,
    group: item.group,
    icon: item.icon,
    roles: [...item.roles],
    order,
    enabled: true,
  }));
}

export function normalizeNavigationItems(
  items?: NavigationItem[] | null
): NavigationItem[] {
  if (!Array.isArray(items) || items.length === 0) return defaultNavigationItems();

  const catalogKeys = new Set(NAVIGATION_CATALOG.map(item => item.key));
  const iconKeys = new Set(NAVIGATION_ICON_OPTIONS.map(item => item.value));
  const seen = new Set<string>();

  const normalized = items
    .slice()
    .sort((first, second) => first.order - second.order)
    .flatMap((item, index) => {
      const rawKey = String(item.key ?? '');
      const custom = /^custom:[a-zA-Z0-9_-]{1,80}$/.test(rawKey);
      if ((!catalogKeys.has(rawKey as NativeNavigationItemKey) && !custom) || seen.has(rawKey))
        return [];
      seen.add(rawKey);

      const fallback = custom
        ? {
            label: 'Página personalizada',
            group: 'Personalizado',
            icon: 'boxes' as NavigationIconKey,
            roles: ['superadmin', 'admin', 'operator'] as NavigationRole[],
          }
        : NAVIGATION_CATALOG.find(entry => entry.key === rawKey)!;

      let roles = Array.isArray(item.roles)
        ? item.roles.filter(role =>
            role === 'superadmin' || role === 'admin' || role === 'operator'
          )
        : [...fallback.roles];

      if (rawKey === 'usuarios') {
        roles = roles.filter(role => role !== 'operator');
      }
      if (roles.length === 0) roles = [...fallback.roles];

      return [{
        key: rawKey as NavigationItemKey,
        label: item.label?.trim() || fallback.label,
        group: item.group?.trim() || fallback.group,
        icon: iconKeys.has(item.icon) ? item.icon : fallback.icon,
        roles,
        order: index,
        enabled: item.enabled !== false,
      }];
    });

  return normalized.length ? normalized : defaultNavigationItems();
}
