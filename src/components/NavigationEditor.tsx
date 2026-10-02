import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { AppSelect } from './AppSelect';
import {
  NAVIGATION_CATALOG,
  NAVIGATION_ICON_OPTIONS,
  NAVIGATION_ROLE_OPTIONS,
  isCustomNavigationKey,
  normalizeNavigationItems,
  type NativeNavigationItemKey,
  type NavigationItem,
  type NavigationItemKey,
  type NavigationRole,
} from '../navigation';

function reindex(items: NavigationItem[]) {
  return items.map((item, order) => ({ ...item, order }));
}

export function NavigationEditor(props: {
  items: NavigationItem[];
  onChange: (items: NavigationItem[]) => void;
}) {
  const items = normalizeNavigationItems(props.items);
  const missing = useMemo(
    () =>
      NAVIGATION_CATALOG.filter(
        catalog => !items.some(item => item.key === catalog.key)
      ),
    [items]
  );
  const [newKey, setNewKey] = useState<NativeNavigationItemKey>(
    missing[0]?.key ?? 'venda'
  );

  function changeItem(
    key: NavigationItemKey,
    patch: Partial<NavigationItem>
  ) {
    props.onChange(
      reindex(
        items.map(item => (item.key === key ? { ...item, ...patch } : item))
      )
    );
  }

  function move(key: NavigationItemKey, direction: -1 | 1) {
    const index = items.findIndex(item => item.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(reindex(next));
  }

  function remove(key: NavigationItemKey) {
    props.onChange(reindex(items.filter(item => item.key !== key)));
  }

  function addNative() {
    const catalog =
      missing.find(item => item.key === newKey) ??
      missing[0];
    if (!catalog) return;

    const next = reindex([
      ...items,
      {
        key: catalog.key,
        label: catalog.label,
        group: catalog.group,
        icon: catalog.icon,
        roles: [...catalog.roles],
        enabled: true,
        order: items.length,
      },
    ]);
    props.onChange(next);

    const remaining = NAVIGATION_CATALOG.filter(
      candidate => !next.some(item => item.key === candidate.key)
    );
    if (remaining[0]) setNewKey(remaining[0].key);
  }

  function toggleRole(
    item: NavigationItem,
    role: NavigationRole,
    checked: boolean
  ) {
    if (item.key === 'usuarios' && role === 'operator') return;
    if (!checked && item.roles.length <= 1) return;
    const roles = checked
      ? Array.from(new Set([...item.roles, role]))
      : item.roles.filter(itemRole => itemRole !== role);
    changeItem(item.key, { roles });
  }

  return (
    <div className="navigation-editor">
      <div className="navigation-editor-head">
        <div>
          <h3>Menu e páginas do cliente</h3>
          <p className="muted">
            Tudo aqui é editável: nome, grupo, ícone, posição, visibilidade e
            perfil. Páginas personalizadas são criadas no construtor logo abaixo.
          </p>
        </div>
        <span className="badge">{items.filter(item => item.enabled).length} ativas</span>
      </div>

      {missing.length > 0 && (
        <div className="navigation-add-row">
          <AppSelect
            value={missing.some(item => item.key === newKey) ? newKey : missing[0].key}
            onValueChange={value => setNewKey(value as NativeNavigationItemKey)}
            options={missing.map(item => ({
              value: item.key,
              label: item.label,
            }))}
            ariaLabel="Página nativa para adicionar"
          />
          <button className="secondary" onClick={addNative}>
            <Plus size={17} /> Adicionar página do sistema
          </button>
        </div>
      )}

      <div className="navigation-list">
        {items.map((item, index) => {
          const catalog = NAVIGATION_CATALOG.find(entry => entry.key === item.key);
          const custom = isCustomNavigationKey(item.key);
          return (
            <div
              className={'navigation-row ' + (item.enabled ? '' : 'is-disabled')}
              key={item.key}
            >
              <div className="navigation-row-top">
                <div>
                  <strong>{catalog?.label ?? item.label}</strong>
                  <small>
                    {custom
                      ? 'Página personalizada criada no construtor no-code.'
                      : catalog?.description}
                  </small>
                </div>
                <button
                  className="secondary compact-action"
                  onClick={() => changeItem(item.key, { enabled: !item.enabled })}
                >
                  {item.enabled ? <Eye size={15} /> : <EyeOff size={15} />}
                  {item.enabled ? 'Visível' : 'Oculta'}
                </button>
              </div>

              <div className="navigation-row-grid">
                <label className="field">
                  <span>Nome exibido</span>
                  <input
                    value={item.label}
                    onChange={event =>
                      changeItem(item.key, { label: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Grupo do menu</span>
                  <input
                    value={item.group}
                    onChange={event =>
                      changeItem(item.key, { group: event.target.value })
                    }
                    placeholder="Ex.: Operação"
                  />
                </label>
                <label className="field">
                  <span>Ícone</span>
                  <AppSelect
                    value={item.icon}
                    onValueChange={value =>
                      changeItem(item.key, {
                        icon: value as NavigationItem['icon'],
                      })
                    }
                    options={NAVIGATION_ICON_OPTIONS}
                    ariaLabel={'Ícone de ' + item.label}
                  />
                </label>
              </div>

              <div className="navigation-role-row">
                <span>Visível para</span>
                <div>
                  {NAVIGATION_ROLE_OPTIONS.map(role => {
                    const blocked = item.key === 'usuarios' && role.value === 'operator';
                    return (
                      <label key={role.value}>
                        <input
                          type="checkbox"
                          checked={!blocked && item.roles.includes(role.value)}
                          disabled={blocked}
                          onChange={event =>
                            toggleRole(item, role.value, event.target.checked)
                          }
                        />
                        <span>{role.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="navigation-row-actions">
                <button
                  className="secondary compact-action"
                  disabled={index === 0}
                  onClick={() => move(item.key, -1)}
                >
                  <ArrowUp size={15} /> Subir
                </button>
                <button
                  className="secondary compact-action"
                  disabled={index === items.length - 1}
                  onClick={() => move(item.key, 1)}
                >
                  <ArrowDown size={15} /> Descer
                </button>
                {!custom && (
                  <button
                    className="danger-link compact-action"
                    onClick={() => remove(item.key)}
                  >
                    <Trash2 size={15} /> Remover do menu
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
