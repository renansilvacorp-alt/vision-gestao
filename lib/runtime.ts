import 'server-only';

import { Pool, type PoolClient } from '@neondatabase/serverless';
import { auth as neonAuth } from '@/lib/auth/server';

type JsonRecord = Record<string, unknown>;
type DbItem = JsonRecord & { id: string };
type DbListResult<T> = { items: Array<T & { id: string }>; nextToken?: string };

type RuntimeUser = {
  userId: string;
  email?: string;
  name?: string;
};

type RuntimeContext = {
  request: Request;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  user?: RuntimeUser;
};

type RouteHandler = (ctx: RuntimeContext) => Promise<Response | void> | Response | void;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL não configurado.');
}

const globalForDb = globalThis as typeof globalThis & { __visionPool?: Pool };
export const pool =
  globalForDb.__visionPool ??
  new Pool({
    connectionString,
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') globalForDb.__visionPool = pool;

function dateIso(value: unknown) {
  if (!value) return new Date().toISOString();
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function n(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function jsonValue<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function defaultChannel() {
  return {
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
  };
}

function normalizeStoreRow(row: JsonRecord, members: unknown[] = [], installed: unknown[] = []) {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    logoPath: row.logo_url ? String(row.logo_url) : undefined,
    visual: jsonValue(row.visual, {
      theme: 'light',
      primary: '#111827',
      accent: '#2563eb',
      fontSize: 'normal',
    }),
    createdAt: dateIso(row.created_at),
    modules: jsonValue(row.modules, { encomendas: false }),
    reserves: jsonValue(row.reserves, { generalPct: 0, cashPct: 0 }),
    channels: jsonValue(row.channels, {
      porta: defaultChannel(),
      ifood: { ...defaultChannel(), platformPct: 27.5, promoFee: 5 },
      '99': { ...defaultChannel(), platformPct: 12, promoFee: 5 },
      encomenda: defaultChannel(),
    }),
    members,
    navigation: jsonValue(row.navigation, []),
    customPages: jsonValue(row.custom_pages, []),
    installedContainers: installed,
    structureCustomized: Boolean(row.structure_customized),
    structureUpdatedAt: row.structure_updated_at
      ? dateIso(row.structure_updated_at)
      : undefined,
    dataImports: {},
  };
}

async function loadMembers(storeIds: string[]) {
  if (!storeIds.length) return new Map<string, unknown[]>();
  const result = await pool.query(
    `SELECT store_id,email,role
       FROM store_members
       WHERE store_id = ANY($1::uuid[])
       ORDER BY lower(email)`,
    [storeIds]
  );
  const map = new Map<string, unknown[]>();
  for (const row of result.rows) {
    const id = String(row.store_id);
    const list = map.get(id) ?? [];
    list.push({ email: String(row.email).toLowerCase(), role: row.role });
    map.set(id, list);
  }
  return map;
}

async function loadInstalledContainers(storeIds: string[]) {
  if (!storeIds.length) return new Map<string, unknown[]>();
  const result = await pool.query(
    `SELECT store_id,container_id,installed_version,installed_at,updated_at
       FROM store_containers
       WHERE store_id = ANY($1::uuid[])
       ORDER BY installed_at`,
    [storeIds]
  );
  const map = new Map<string, unknown[]>();
  for (const row of result.rows) {
    const id = String(row.store_id);
    const list = map.get(id) ?? [];
    list.push({
      containerId: String(row.container_id),
      version: Number(row.installed_version),
      installedAt: dateIso(row.installed_at),
      updatedAt: row.updated_at ? dateIso(row.updated_at) : undefined,
    });
    map.set(id, list);
  }
  return map;
}

async function storeRows(ids?: string[], limit = 50) {
  const values: unknown[] = [];
  let where = '';
  if (ids?.length) {
    values.push(ids);
    where = 'WHERE id = ANY($1::uuid[])';
  }
  values.push(limit + 1);
  const limitParam = values.length;
  const result = await pool.query(
    `SELECT * FROM stores ${where} ORDER BY lower(name),created_at LIMIT $${limitParam}`,
    values
  );
  const raw = result.rows.slice(0, limit);
  const storeIds = raw.map(row => String(row.id));
  const [members, installed] = await Promise.all([
    loadMembers(storeIds),
    loadInstalledContainers(storeIds),
  ]);
  return {
    items: raw.map(row =>
      normalizeStoreRow(
        row,
        members.get(String(row.id)) ?? [],
        installed.get(String(row.id)) ?? []
      )
    ),
    hasMore: result.rows.length > limit,
  };
}

async function syncMembers(client: PoolClient, storeId: string, members: unknown[]) {
  await client.query('DELETE FROM store_members WHERE store_id=$1', [storeId]);
  for (const raw of members) {
    const member = raw && typeof raw === 'object' ? (raw as JsonRecord) : {};
    const email = String(member.email ?? '').trim().toLowerCase();
    const role = member.role === 'admin' ? 'admin' : 'operator';
    if (!email) continue;
    await client.query(
      `INSERT INTO store_members(store_id,email,role)
       VALUES($1,$2,$3)
       ON CONFLICT(store_id,email) DO UPDATE SET role=EXCLUDED.role,updated_at=now()`,
      [storeId, email, role]
    );
  }
}

async function syncInstalled(
  client: PoolClient,
  storeId: string,
  installedContainers: unknown[]
) {
  await client.query('DELETE FROM store_containers WHERE store_id=$1', [storeId]);
  for (const raw of installedContainers) {
    const item = raw && typeof raw === 'object' ? (raw as JsonRecord) : {};
    const containerId = String(item.containerId ?? '');
    if (!containerId) continue;
    const exists = await client.query('SELECT 1 FROM containers WHERE id=$1', [
      containerId,
    ]);
    if (!exists.rowCount) continue;
    await client.query(
      `INSERT INTO store_containers(
         store_id,container_id,installed_version,installed_at,updated_at
       ) VALUES($1,$2,$3,$4,$5)`,
      [
        storeId,
        containerId,
        Math.max(1, n(item.version, 1)),
        item.installedAt ? new Date(String(item.installedAt)) : new Date(),
        item.updatedAt ? new Date(String(item.updatedAt)) : new Date(),
      ]
    );
  }
}

async function insertStore(record: JsonRecord) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO stores(
        name,visual,modules,reserves,channels,navigation,custom_pages,
        structure_customized,structure_updated_at,logo_url,updated_at
      ) VALUES($1,$2::jsonb,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,now())
      RETURNING id`,
      [
        String(record.name ?? 'Nova empresa'),
        JSON.stringify(record.visual ?? {
          theme: 'light',
          primary: '#111827',
          accent: '#2563eb',
          fontSize: 'normal',
        }),
        JSON.stringify(record.modules ?? { encomendas: false }),
        JSON.stringify(record.reserves ?? { generalPct: 0, cashPct: 0 }),
        JSON.stringify(record.channels ?? {
          porta: defaultChannel(),
          ifood: { ...defaultChannel(), platformPct: 27.5, promoFee: 5 },
          '99': { ...defaultChannel(), platformPct: 12, promoFee: 5 },
          encomenda: defaultChannel(),
        }),
        JSON.stringify(record.navigation ?? []),
        JSON.stringify(record.customPages ?? []),
        Boolean(record.structureCustomized),
        record.structureUpdatedAt
          ? new Date(String(record.structureUpdatedAt))
          : null,
        record.logoPath ? String(record.logoPath) : null,
      ]
    );
    const id = String(result.rows[0].id);
    await syncMembers(
      client,
      id,
      Array.isArray(record.members) ? record.members : []
    );
    await syncInstalled(
      client,
      id,
      Array.isArray(record.installedContainers) ? record.installedContainers : []
    );
    await client.query('COMMIT');
    return id;
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  } finally {
    client.release();
  }
}

async function updateStore(id: string, record: JsonRecord) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query('SELECT logo_url FROM stores WHERE id=$1', [id]);
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return false;
    }
    const logoPath =
      typeof record.logoPath === 'string'
        ? record.logoPath
        : current.rows[0].logo_url;
    await client.query(
      `UPDATE stores SET
         name=$2,
         logo_url=$3,
         visual=$4::jsonb,
         modules=$5::jsonb,
         reserves=$6::jsonb,
         channels=$7::jsonb,
         navigation=$8::jsonb,
         custom_pages=$9::jsonb,
         structure_customized=$10,
         structure_updated_at=$11,
         updated_at=now()
       WHERE id=$1`,
      [
        id,
        String(record.name ?? 'Empresa'),
        logoPath || null,
        JSON.stringify(record.visual ?? {
          theme: 'light',
          primary: '#111827',
          accent: '#2563eb',
          fontSize: 'normal',
        }),
        JSON.stringify(record.modules ?? { encomendas: false }),
        JSON.stringify(record.reserves ?? { generalPct: 0, cashPct: 0 }),
        JSON.stringify(record.channels ?? {}),
        JSON.stringify(record.navigation ?? []),
        JSON.stringify(record.customPages ?? []),
        Boolean(record.structureCustomized),
        record.structureUpdatedAt
          ? new Date(String(record.structureUpdatedAt))
          : null,
      ]
    );
    if (Array.isArray(record.members)) {
      await syncMembers(client, id, record.members);
    }
    if (Array.isArray(record.installedContainers)) {
      await syncInstalled(client, id, record.installedContainers);
    }
    await client.query('COMMIT');
    return true;
  } catch (cause) {
    await client.query('ROLLBACK');
    throw cause;
  } finally {
    client.release();
  }
}

async function listIngredients(storeId: string, limit: number) {
  const result = await pool.query(
    `SELECT id,name,unit,package_qty,package_cost,unit_cost,supplier
     FROM ingredients WHERE store_id=$1
     ORDER BY lower(name),id LIMIT $2`,
    [storeId, limit + 1]
  );
  return {
    items: result.rows.slice(0, limit).map(row => ({
      id: String(row.id),
      name: String(row.name),
      unit: String(row.unit),
      packageQty: n(row.package_qty, 1),
      packageCost: n(row.package_cost),
      unitCost: n(row.unit_cost),
      supplier: row.supplier ? String(row.supplier) : undefined,
      updatedAt: undefined,
    })),
    hasMore: result.rows.length > limit,
  };
}

async function getIngredients(storeId: string, ids: string[]) {
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT id,name,unit,package_qty,package_cost,unit_cost,supplier
     FROM ingredients WHERE store_id=$1 AND id = ANY($2::uuid[])`,
    [storeId, ids]
  );
  const map = new Map(
    result.rows.map(row => [
      String(row.id),
      {
        id: String(row.id),
        name: String(row.name),
        unit: String(row.unit),
        packageQty: n(row.package_qty, 1),
        packageCost: n(row.package_cost),
        unitCost: n(row.unit_cost),
        supplier: row.supplier ? String(row.supplier) : undefined,
      },
    ])
  );
  return ids.map(id => map.get(id) ?? null);
}

async function insertIngredient(storeId: string, record: JsonRecord) {
  const result = await pool.query(
    `INSERT INTO ingredients(
      store_id,name,unit,package_qty,package_cost,unit_cost,supplier,active,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7,true,now()) RETURNING id`,
    [
      storeId,
      String(record.name ?? ''),
      String(record.unit ?? 'un'),
      n(record.packageQty, 1),
      n(record.packageCost),
      n(record.unitCost),
      record.supplier ? String(record.supplier) : null,
    ]
  );
  return String(result.rows[0].id);
}

async function updateIngredient(storeId: string, id: string, record: JsonRecord) {
  const result = await pool.query(
    `UPDATE ingredients SET
      name=$3,unit=$4,package_qty=$5,package_cost=$6,unit_cost=$7,supplier=$8,updated_at=now()
     WHERE store_id=$1 AND id=$2`,
    [
      storeId,
      id,
      String(record.name ?? ''),
      String(record.unit ?? 'un'),
      n(record.packageQty, 1),
      n(record.packageCost),
      n(record.unitCost),
      record.supplier ? String(record.supplier) : null,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

async function loadRecipes(storeId: string, ids?: string[], limit = 500) {
  const args: unknown[] = [storeId];
  let idFilter = '';
  if (ids?.length) {
    args.push(ids);
    idFilter = ' AND r.id = ANY($2::uuid[])';
  }
  args.push(limit + 1);
  const limitParam = args.length;
  const result = await pool.query(
    `SELECT r.id,r.name,r.yield_qty,r.total_cost,r.unit_cost,r.updated_at
     FROM recipes r
     WHERE r.store_id=$1 ${idFilter}
     ORDER BY lower(r.name),r.id
     LIMIT $${limitParam}`,
    args
  );
  const rows = result.rows.slice(0, limit);
  const recipeIds = rows.map(row => String(row.id));
  let itemRows: JsonRecord[] = [];
  if (recipeIds.length) {
    const items = await pool.query(
      `SELECT id,recipe_id,ingredient_id,ingredient_name,quantity,unit,unit_cost,cost,sort_order
       FROM recipe_items
       WHERE recipe_id = ANY($1::uuid[])
       ORDER BY recipe_id,sort_order,id`,
      [recipeIds]
    );
    itemRows = items.rows;
  }
  const grouped = new Map<string, unknown[]>();
  for (const row of itemRows) {
    const rid = String(row.recipe_id);
    const list = grouped.get(rid) ?? [];
    list.push({
      ingredientId: row.ingredient_id ? String(row.ingredient_id) : '',
      ingredientName: String(row.ingredient_name ?? ''),
      quantity: n(row.quantity),
      unit: String(row.unit ?? 'un'),
      unitCost: n(row.unit_cost),
      cost: n(row.cost),
    });
    grouped.set(rid, list);
  }
  const mapped = rows.map(row => ({
    id: String(row.id),
    name: String(row.name),
    yieldQty: n(row.yield_qty, 1),
    items: grouped.get(String(row.id)) ?? [],
    totalCost: n(row.total_cost),
    unitCost: n(row.unit_cost),
    updatedAt: dateIso(row.updated_at),
  }));
  return { items: mapped, hasMore: result.rows.length > limit };
}

async function writeRecipe(
  client: PoolClient,
  storeId: string,
  id: string | null,
  record: JsonRecord
) {
  let recipeId = id;
  if (recipeId) {
    const updated = await client.query(
      `UPDATE recipes SET
       name=$3,yield_qty=$4,total_cost=$5,unit_cost=$6,updated_at=now()
       WHERE store_id=$1 AND id=$2`,
      [
        storeId,
        recipeId,
        String(record.name ?? ''),
        n(record.yieldQty, 1),
        n(record.totalCost),
        n(record.unitCost),
      ]
    );
    if (!(updated.rowCount ?? 0)) return null;
    await client.query('DELETE FROM recipe_items WHERE recipe_id=$1', [recipeId]);
  } else {
    const inserted = await client.query(
      `INSERT INTO recipes(store_id,name,yield_qty,total_cost,unit_cost,active,updated_at)
       VALUES($1,$2,$3,$4,$5,true,now()) RETURNING id`,
      [
        storeId,
        String(record.name ?? ''),
        n(record.yieldQty, 1),
        n(record.totalCost),
        n(record.unitCost),
      ]
    );
    recipeId = String(inserted.rows[0].id);
  }

  const rawItems = Array.isArray(record.items) ? record.items : [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const raw = rawItems[index] as JsonRecord;
    const ingredientId = String(raw.ingredientId ?? '');
    await client.query(
      `INSERT INTO recipe_items(
        recipe_id,ingredient_id,ingredient_name,quantity,unit,unit_cost,cost,sort_order
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        recipeId,
        ingredientId || null,
        String(raw.ingredientName ?? ''),
        n(raw.quantity),
        String(raw.unit ?? 'un'),
        n(raw.unitCost),
        n(raw.cost),
        index,
      ]
    );
  }
  return recipeId;
}

async function listProducts(storeId: string, limit: number) {
  const result = await pool.query(
    `SELECT id,name,recipe_id,manual_cost,packaging_cost,cost,prices,updated_at
     FROM products WHERE store_id=$1
     ORDER BY lower(name),id LIMIT $2`,
    [storeId, limit + 1]
  );
  return {
    items: result.rows.slice(0, limit).map(row => ({
      id: String(row.id),
      name: String(row.name),
      recipeId: row.recipe_id ? String(row.recipe_id) : undefined,
      manualCost: n(row.manual_cost),
      packagingCost: n(row.packaging_cost),
      cost: n(row.cost),
      prices: jsonValue(row.prices, {
        porta: 0,
        ifood: 0,
        '99': 0,
        encomenda: 0,
      }),
      updatedAt: dateIso(row.updated_at),
    })),
    hasMore: result.rows.length > limit,
  };
}

async function getProducts(storeId: string, ids: string[]) {
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT id,name,recipe_id,manual_cost,packaging_cost,cost,prices,updated_at
     FROM products WHERE store_id=$1 AND id = ANY($2::uuid[])`,
    [storeId, ids]
  );
  const map = new Map(
    result.rows.map(row => [
      String(row.id),
      {
        id: String(row.id),
        name: String(row.name),
        recipeId: row.recipe_id ? String(row.recipe_id) : undefined,
        manualCost: n(row.manual_cost),
        packagingCost: n(row.packaging_cost),
        cost: n(row.cost),
        prices: jsonValue(row.prices, {
          porta: 0,
          ifood: 0,
          '99': 0,
          encomenda: 0,
        }),
        updatedAt: dateIso(row.updated_at),
      },
    ])
  );
  return ids.map(id => map.get(id) ?? null);
}

async function insertProduct(storeId: string, record: JsonRecord) {
  const result = await pool.query(
    `INSERT INTO products(
      store_id,name,recipe_id,manual_cost,packaging_cost,cost,prices,active,updated_at
    ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,true,now()) RETURNING id`,
    [
      storeId,
      String(record.name ?? ''),
      record.recipeId ? String(record.recipeId) : null,
      n(record.manualCost),
      n(record.packagingCost),
      n(record.cost),
      JSON.stringify(record.prices ?? {}),
    ]
  );
  return String(result.rows[0].id);
}

async function updateProduct(storeId: string, id: string, record: JsonRecord) {
  const result = await pool.query(
    `UPDATE products SET
      name=$3,recipe_id=$4,manual_cost=$5,packaging_cost=$6,cost=$7,prices=$8::jsonb,updated_at=now()
     WHERE store_id=$1 AND id=$2`,
    [
      storeId,
      id,
      String(record.name ?? ''),
      record.recipeId ? String(record.recipeId) : null,
      n(record.manualCost),
      n(record.packagingCost),
      n(record.cost),
      JSON.stringify(record.prices ?? {}),
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

async function listSales(storeId: string, limit: number) {
  const result = await pool.query(
    `SELECT *
     FROM sales WHERE store_id=$1
     ORDER BY created_at DESC,id DESC LIMIT $2`,
    [storeId, limit + 1]
  );
  return {
    items: result.rows.slice(0, limit).map(row => ({
      id: String(row.id),
      channel: row.channel,
      paymentMethod: String(row.payment_method),
      items: jsonValue(row.items, []),
      gross: n(row.gross),
      productCost: n(row.product_cost),
      fees: n(row.fees),
      channelFees: n(row.channel_fees),
      monthlyFees: n(row.monthly_fees),
      promoFees: n(row.promo_fees),
      generalReserve: n(row.general_reserve),
      cashReserve: n(row.cash_reserve),
      estimatedProfit: n(row.estimated_profit),
      pricingSnapshot: jsonValue(row.pricing_snapshot, undefined),
      createdAt: dateIso(row.created_at),
      createdBy: row.created_by ? String(row.created_by) : '',
    })),
    hasMore: result.rows.length > limit,
  };
}

async function insertSale(storeId: string, record: JsonRecord) {
  const result = await pool.query(
    `INSERT INTO sales(
      store_id,channel,payment_method,items,gross,product_cost,fees,channel_fees,
      monthly_fees,promo_fees,general_reserve,cash_reserve,estimated_profit,
      pricing_snapshot,created_by,created_at
    ) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16)
    RETURNING id`,
    [
      storeId,
      String(record.channel ?? 'porta'),
      String(record.paymentMethod ?? 'pix'),
      JSON.stringify(record.items ?? []),
      n(record.gross),
      n(record.productCost),
      n(record.fees),
      n(record.channelFees),
      n(record.monthlyFees),
      n(record.promoFees),
      n(record.generalReserve),
      n(record.cashReserve),
      n(record.estimatedProfit),
      JSON.stringify(record.pricingSnapshot ?? {}),
      record.createdBy ? String(record.createdBy) : null,
      record.createdAt ? new Date(String(record.createdAt)) : new Date(),
    ]
  );
  return String(result.rows[0].id);
}

async function listTemplates(limit: number) {
  const result = await pool.query(
    `SELECT id,name,version,modules,navigation,custom_pages,created_at,updated_at
     FROM containers ORDER BY lower(name),created_at LIMIT $1`,
    [limit + 1]
  );
  return {
    items: result.rows.slice(0, limit).map(row => ({
      id: String(row.id),
      name: String(row.name),
      sourceLabel: undefined,
      createdAt: dateIso(row.created_at),
      updatedAt: dateIso(row.updated_at),
      version: Number(row.version ?? 1),
      modules: jsonValue(row.modules, { encomendas: false }),
      reserves: { generalPct: 0, cashPct: 0 },
      channels: {
        porta: defaultChannel(),
        ifood: { ...defaultChannel(), platformPct: 27.5, promoFee: 5 },
        '99': { ...defaultChannel(), platformPct: 12, promoFee: 5 },
        encomenda: defaultChannel(),
      },
      navigation: jsonValue(row.navigation, []),
      customPages: jsonValue(row.custom_pages, []),
      visual: {
        theme: 'light',
        primary: '#111827',
        accent: '#2563eb',
        fontSize: 'normal',
      },
    })),
    hasMore: result.rows.length > limit,
  };
}

async function getTemplates(ids: string[]) {
  if (!ids.length) return [];
  const result = await pool.query(
    `SELECT id,name,version,modules,navigation,custom_pages,created_at,updated_at
     FROM containers WHERE id = ANY($1::uuid[])`,
    [ids]
  );
  const list = (await listTemplates(500)).items;
  const map = new Map(list.map(item => [item.id, item]));
  return ids.map(id => map.get(id) ?? null);
}

async function insertTemplate(record: JsonRecord) {
  const result = await pool.query(
    `INSERT INTO containers(name,version,modules,navigation,custom_pages,created_at,updated_at)
     VALUES($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6,$7)
     RETURNING id`,
    [
      String(record.name ?? 'Novo container'),
      Math.max(1, n(record.version, 1)),
      JSON.stringify(record.modules ?? { encomendas: false }),
      JSON.stringify(record.navigation ?? []),
      JSON.stringify(record.customPages ?? []),
      record.createdAt ? new Date(String(record.createdAt)) : new Date(),
      record.updatedAt ? new Date(String(record.updatedAt)) : new Date(),
    ]
  );
  return String(result.rows[0].id);
}

async function updateTemplate(id: string, record: JsonRecord) {
  const result = await pool.query(
    `UPDATE containers SET
      name=$2,version=$3,modules=$4::jsonb,navigation=$5::jsonb,custom_pages=$6::jsonb,updated_at=$7
     WHERE id=$1`,
    [
      id,
      String(record.name ?? 'Container'),
      Math.max(1, n(record.version, 1)),
      JSON.stringify(record.modules ?? { encomendas: false }),
      JSON.stringify(record.navigation ?? []),
      JSON.stringify(record.customPages ?? []),
      record.updatedAt ? new Date(String(record.updatedAt)) : new Date(),
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

function parseDynamicTable(name: string) {
  const custom = /^custom_page_entries:([^:]+):(.+)$/.exec(name);
  if (custom) return { kind: 'custom' as const, storeId: custom[1], pageId: custom[2] };
  const standard = /^(ingredients|recipes|products|sales):(.+)$/.exec(name);
  if (standard) {
    return {
      kind: standard[1] as 'ingredients' | 'recipes' | 'products' | 'sales',
      storeId: standard[2],
    };
  }
  return null;
}

export const db = {
  async list<T = JsonRecord>(
    name: string,
    options: { limit?: number } = {}
  ): Promise<DbListResult<T>> {
    const limit = Math.max(1, Math.min(options.limit ?? 100, 1000));

    if (name === 'system') {
      const result = await pool.query(
        'SELECT id,owner_email,modules,created_at,updated_at FROM vision_system ORDER BY id LIMIT 2'
      );
      const items = result.rows.slice(0, limit).map(row => ({
        id: String(row.id),
        ownerUserId: String(row.owner_email).trim().toLowerCase(),
        createdAt: dateIso(row.created_at),
        updatedAt: dateIso(row.updated_at),
        modules: jsonValue(row.modules, { encomendasAvailable: true }),
      }));
      return { items: items as unknown as Array<T & { id: string }>, nextToken: result.rows.length > limit ? 'more' : undefined };
    }

    if (name === 'stores') {
      const result = await storeRows(undefined, limit);
      return {
        items: result.items as unknown as Array<T & { id: string }>,
        nextToken: result.hasMore ? 'more' : undefined,
      };
    }

    if (name === 'store_templates') {
      const result = await listTemplates(limit);
      return {
        items: result.items as unknown as Array<T & { id: string }>,
        nextToken: result.hasMore ? 'more' : undefined,
      };
    }

    const dynamic = parseDynamicTable(name);
    if (!dynamic) throw new Error('Tabela não suportada: ' + name);

    if (dynamic.kind === 'ingredients') {
      const result = await listIngredients(dynamic.storeId, limit);
      return {
        items: result.items as unknown as Array<T & { id: string }>,
        nextToken: result.hasMore ? 'more' : undefined,
      };
    }
    if (dynamic.kind === 'recipes') {
      const result = await loadRecipes(dynamic.storeId, undefined, limit);
      return {
        items: result.items as unknown as Array<T & { id: string }>,
        nextToken: result.hasMore ? 'more' : undefined,
      };
    }
    if (dynamic.kind === 'products') {
      const result = await listProducts(dynamic.storeId, limit);
      return {
        items: result.items as unknown as Array<T & { id: string }>,
        nextToken: result.hasMore ? 'more' : undefined,
      };
    }
    if (dynamic.kind === 'sales') {
      const result = await listSales(dynamic.storeId, limit);
      return {
        items: result.items as unknown as Array<T & { id: string }>,
        nextToken: result.hasMore ? 'more' : undefined,
      };
    }

    const result = await pool.query(
      `SELECT id,page_id,block_id,values,created_by,created_at
       FROM custom_page_submissions
       WHERE store_id=$1 AND page_id=$2
       ORDER BY created_at DESC
       LIMIT $3`,
      [dynamic.storeId, dynamic.pageId, limit + 1]
    );
    return {
      items: result.rows.slice(0, limit).map(row => ({
        id: String(row.id),
        pageId: String(row.page_id),
        blockId: String(row.block_id),
        values: jsonValue(row.values, {}),
        createdAt: dateIso(row.created_at),
        createdBy: row.created_by ? String(row.created_by) : '',
      })) as unknown as Array<T & { id: string }>,
      nextToken: result.rows.length > limit ? 'more' : undefined,
    };
  },

  async get<T = JsonRecord>(name: string, ids: string[]): Promise<Array<(T & { id: string }) | null>> {
    if (!ids.length) return [];

    if (name === 'stores') {
      const result = await storeRows(ids, Math.max(ids.length, 1));
      const map = new Map(result.items.map(item => [String(item.id), item]));
      return ids.map(id => (map.get(id) as unknown as T & { id: string }) ?? null);
    }

    if (name === 'store_templates') {
      return (await getTemplates(ids)) as unknown as Array<(T & { id: string }) | null>;
    }

    if (name === 'system') {
      const result = await this.list<T>('system', { limit: 10 });
      const map = new Map(result.items.map(item => [String(item.id), item]));
      return ids.map(id => map.get(id) ?? null);
    }

    const dynamic = parseDynamicTable(name);
    if (!dynamic) throw new Error('Tabela não suportada: ' + name);

    if (dynamic.kind === 'ingredients') {
      return (await getIngredients(dynamic.storeId, ids)) as unknown as Array<(T & { id: string }) | null>;
    }
    if (dynamic.kind === 'recipes') {
      const result = await loadRecipes(dynamic.storeId, ids, Math.max(ids.length, 1));
      const map = new Map(result.items.map(item => [item.id, item]));
      return ids.map(id => (map.get(id) as unknown as T & { id: string }) ?? null);
    }
    if (dynamic.kind === 'products') {
      return (await getProducts(dynamic.storeId, ids)) as unknown as Array<(T & { id: string }) | null>;
    }
    if (dynamic.kind === 'sales') {
      const result = await pool.query(
        `SELECT * FROM sales WHERE store_id=$1 AND id = ANY($2::uuid[])`,
        [dynamic.storeId, ids]
      );
      const list = await listSales(dynamic.storeId, 1000);
      const map = new Map(list.items.map(item => [item.id, item]));
      return ids.map(id => (map.get(id) as unknown as T & { id: string }) ?? null);
    }

    const result = await pool.query(
      `SELECT id,page_id,block_id,values,created_by,created_at
       FROM custom_page_submissions
       WHERE store_id=$1 AND page_id=$2 AND id = ANY($3::uuid[])`,
      [dynamic.storeId, dynamic.pageId, ids]
    );
    const map = new Map(
      result.rows.map(row => [
        String(row.id),
        {
          id: String(row.id),
          pageId: String(row.page_id),
          blockId: String(row.block_id),
          values: jsonValue(row.values, {}),
          createdAt: dateIso(row.created_at),
          createdBy: row.created_by ? String(row.created_by) : '',
        },
      ])
    );
    return ids.map(id => (map.get(id) as unknown as T & { id: string }) ?? null);
  },

  async add(name: string, records: JsonRecord[]): Promise<Array<string | null>> {
    const ids: Array<string | null> = [];

    for (const record of records) {
      if (name === 'system') {
        const result = await pool.query(
          `INSERT INTO vision_system(id,owner_email,modules,created_at,updated_at)
           VALUES(1,$1,$2::jsonb,$3,$4)
           ON CONFLICT(id) DO UPDATE SET
             owner_email=EXCLUDED.owner_email,modules=EXCLUDED.modules,updated_at=EXCLUDED.updated_at
           RETURNING id`,
          [
            String(record.ownerUserId ?? '').toLowerCase(),
            JSON.stringify(record.modules ?? { encomendasAvailable: true }),
            record.createdAt ? new Date(String(record.createdAt)) : new Date(),
            record.updatedAt ? new Date(String(record.updatedAt)) : new Date(),
          ]
        );
        ids.push(String(result.rows[0].id));
        continue;
      }

      if (name === 'stores') {
        ids.push(await insertStore(record));
        continue;
      }

      if (name === 'store_templates') {
        ids.push(await insertTemplate(record));
        continue;
      }

      const dynamic = parseDynamicTable(name);
      if (!dynamic) throw new Error('Tabela não suportada: ' + name);

      if (dynamic.kind === 'ingredients') {
        ids.push(await insertIngredient(dynamic.storeId, record));
        continue;
      }
      if (dynamic.kind === 'recipes') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const id = await writeRecipe(client, dynamic.storeId, null, record);
          await client.query('COMMIT');
          ids.push(id);
        } catch (cause) {
          await client.query('ROLLBACK');
          throw cause;
        } finally {
          client.release();
        }
        continue;
      }
      if (dynamic.kind === 'products') {
        ids.push(await insertProduct(dynamic.storeId, record));
        continue;
      }
      if (dynamic.kind === 'sales') {
        ids.push(await insertSale(dynamic.storeId, record));
        continue;
      }

      const result = await pool.query(
        `INSERT INTO custom_page_submissions(
          store_id,page_id,block_id,values,created_by,created_at
        ) VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING id`,
        [
          dynamic.storeId,
          String(record.pageId ?? dynamic.pageId),
          String(record.blockId ?? ''),
          JSON.stringify(record.values ?? {}),
          record.createdBy ? String(record.createdBy) : null,
          record.createdAt ? new Date(String(record.createdAt)) : new Date(),
        ]
      );
      ids.push(String(result.rows[0].id));
    }

    return ids;
  },

  async update(
    name: string,
    updates: Array<{ id: string; record: JsonRecord }>
  ): Promise<boolean[]> {
    const results: boolean[] = [];

    for (const update of updates) {
      if (name === 'system') {
        const result = await pool.query(
          `UPDATE vision_system SET
             owner_email=$2,modules=$3::jsonb,updated_at=$4
           WHERE id=$1`,
          [
            Number(update.id) || 1,
            String(update.record.ownerUserId ?? '').toLowerCase(),
            JSON.stringify(update.record.modules ?? { encomendasAvailable: true }),
            update.record.updatedAt
              ? new Date(String(update.record.updatedAt))
              : new Date(),
          ]
        );
        results.push((result.rowCount ?? 0) > 0);
        continue;
      }

      if (name === 'stores') {
        results.push(await updateStore(update.id, update.record));
        continue;
      }

      if (name === 'store_templates') {
        results.push(await updateTemplate(update.id, update.record));
        continue;
      }

      const dynamic = parseDynamicTable(name);
      if (!dynamic) throw new Error('Tabela não suportada: ' + name);

      if (dynamic.kind === 'ingredients') {
        results.push(
          await updateIngredient(dynamic.storeId, update.id, update.record)
        );
        continue;
      }
      if (dynamic.kind === 'recipes') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const id = await writeRecipe(
            client,
            dynamic.storeId,
            update.id,
            update.record
          );
          await client.query('COMMIT');
          results.push(Boolean(id));
        } catch (cause) {
          await client.query('ROLLBACK');
          throw cause;
        } finally {
          client.release();
        }
        continue;
      }
      if (dynamic.kind === 'products') {
        results.push(
          await updateProduct(dynamic.storeId, update.id, update.record)
        );
        continue;
      }

      throw new Error('Atualização não suportada para ' + name);
    }

    return results;
  },

  async delete(name: string, ids: string[]): Promise<boolean[]> {
    const results: boolean[] = [];

    for (const id of ids) {
      if (name === 'store_templates') {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('DELETE FROM store_containers WHERE container_id=$1', [id]);
          const deleted = await client.query('DELETE FROM containers WHERE id=$1', [id]);
          await client.query('COMMIT');
          results.push((deleted.rowCount ?? 0) > 0);
        } catch (cause) {
          await client.query('ROLLBACK');
          throw cause;
        } finally {
          client.release();
        }
        continue;
      }

      if (name === 'stores') {
        const result = await pool.query('DELETE FROM stores WHERE id=$1', [id]);
        results.push((result.rowCount ?? 0) > 0);
        continue;
      }

      const dynamic = parseDynamicTable(name);
      if (!dynamic) throw new Error('Tabela não suportada: ' + name);

      const tableName =
        dynamic.kind === 'ingredients'
          ? 'ingredients'
          : dynamic.kind === 'recipes'
            ? 'recipes'
            : dynamic.kind === 'products'
              ? 'products'
              : dynamic.kind === 'sales'
                ? 'sales'
                : 'custom_page_submissions';

      const args =
        dynamic.kind === 'custom'
          ? [id, dynamic.storeId, dynamic.pageId]
          : [id, dynamic.storeId];
      const result =
        dynamic.kind === 'custom'
          ? await pool.query(
              `DELETE FROM custom_page_submissions
               WHERE id=$1 AND store_id=$2 AND page_id=$3`,
              args
            )
          : await pool.query(
              `DELETE FROM ${tableName} WHERE id=$1 AND store_id=$2`,
              args
            );
      results.push((result.rowCount ?? 0) > 0);
    }

    return results;
  },
};

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function error(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function requireAuth(): RouteHandler {
  return async ctx => {
    const result = await neonAuth.getSession();
    const user = result.data?.user;
    const email = user?.email?.trim().toLowerCase();
    if (!user || !email) return error('Não autenticado.', 401);
    ctx.user = {
      userId: email,
      email,
      name: user.name ?? undefined,
    };
  };
}

function matchRoute(pattern: string, pathname: string) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let index = 0; index < patternParts.length; index += 1) {
    const expected = patternParts[index];
    const actual = pathParts[index];
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

export function router(routes: Record<string, RouteHandler[]>) {
  return async function handle(request: Request) {
    try {
      const url = new URL(request.url);
      const route = Object.entries(routes).find(([signature]) => {
        const space = signature.indexOf(' ');
        const method = signature.slice(0, space);
        const pattern = signature.slice(space + 1);
        return method === request.method && Boolean(matchRoute(pattern, url.pathname));
      });

      if (!route) return error('Rota não encontrada.', 404);

      const [, handlers] = route;
      const signature = route[0];
      const pattern = signature.slice(signature.indexOf(' ') + 1);
      const params = matchRoute(pattern, url.pathname) ?? {};
      const query = Object.fromEntries(url.searchParams.entries());
      let body: unknown = {};
      if (!['GET', 'HEAD'].includes(request.method)) {
        const text = await request.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = {};
          }
        }
      }

      const ctx: RuntimeContext = {
        request,
        params,
        query,
        body,
      };

      for (const routeHandler of handlers) {
        const response = await routeHandler(ctx);
        if (response instanceof Response) return response;
      }

      return error('A rota não retornou uma resposta.', 500);
    } catch (cause) {
      console.error('VISION_API_ERROR', cause);
      return error(
        cause instanceof Error ? cause.message : 'Falha interna da Vision.',
        500
      );
    }
  };
}

export const storage = {
  async url(paths: string[]) {
    return paths.map(path => ({ url: path.startsWith('data:') ? path : '' }));
  },

  async read(paths: string[]) {
    return paths.map(path => {
      if (!path.startsWith('data:')) return null;
      const comma = path.indexOf(',');
      if (comma < 0) return null;
      return {
        content: path.slice(comma + 1),
      };
    });
  },

  async write(_files: Array<{ path: string; content: string; contentType: string }>) {
    return _files.map(() => true);
  },
};
