import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FilePlus2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { AppSelect } from './AppSelect';
import {
  createDefinitionId,
  normalizeCustomPages,
  type CustomFieldType,
  type CustomPageBlock,
  type CustomPageBlockType,
  type CustomPageDefinition,
  type CustomPageField,
} from '../customPages';
import {
  normalizeNavigationItems,
  type NavigationItem,
} from '../navigation';

const blockOptions: Array<{ value: CustomPageBlockType; label: string }> = [
  { value: 'heading', label: 'Título / introdução' },
  { value: 'text', label: 'Texto' },
  { value: 'notice', label: 'Aviso / destaque' },
  { value: 'kpi', label: 'Indicador / KPI' },
  { value: 'link', label: 'Botão / link' },
  { value: 'divider', label: 'Separador' },
  { value: 'form', label: 'Formulário com dados salvos' },
];

const fieldOptions: Array<{ value: CustomFieldType; label: string }> = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Lista de opções' },
  { value: 'checkbox', label: 'Sim / Não' },
];

function newBlock(type: CustomPageBlockType): CustomPageBlock {
  const id = createDefinitionId('block');
  if (type === 'form') {
    return {
      id,
      type,
      title: 'Novo formulário',
      submitLabel: 'Enviar',
      fields: [],
    };
  }
  if (type === 'kpi') return { id, type, label: 'Indicador', value: '0', hint: '' };
  if (type === 'link') return { id, type, buttonLabel: 'Abrir', url: 'https://' };
  if (type === 'divider') return { id, type };
  if (type === 'heading') return { id, type, title: 'Título da seção', subtitle: '' };
  return { id, type, title: type === 'notice' ? 'Destaque' : '', text: '' };
}

function newField(): CustomPageField {
  return {
    id: createDefinitionId('field'),
    label: 'Novo campo',
    type: 'text',
    required: false,
    placeholder: '',
    options: [],
  };
}

export function CustomPagesEditor(props: {
  pages: CustomPageDefinition[];
  navigation: NavigationItem[];
  onPagesChange: (pages: CustomPageDefinition[]) => void;
  onNavigationChange: (items: NavigationItem[]) => void;
}) {
  const pages = normalizeCustomPages(props.pages);
  const navigation = normalizeNavigationItems(props.navigation);
  const [editingId, setEditingId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [blockType, setBlockType] = useState<CustomPageBlockType>('heading');

  useEffect(() => {
    if (editingId && !pages.some(page => page.id === editingId)) setEditingId('');
  }, [pages, editingId]);

  const editing = useMemo(
    () => pages.find(page => page.id === editingId),
    [pages, editingId]
  );

  function updatePage(pageId: string, patch: Partial<CustomPageDefinition>) {
    props.onPagesChange(
      pages.map(page => (page.id === pageId ? { ...page, ...patch } : page))
    );
  }

  function updateBlock(
    pageId: string,
    blockId: string,
    patch: Partial<CustomPageBlock>
  ) {
    props.onPagesChange(
      pages.map(page =>
        page.id === pageId
          ? {
              ...page,
              blocks: page.blocks.map(block =>
                block.id === blockId ? { ...block, ...patch } : block
              ),
            }
          : page
      )
    );
  }

  function moveBlock(pageId: string, blockId: string, direction: -1 | 1) {
    const page = pages.find(item => item.id === pageId);
    if (!page) return;
    const index = page.blocks.findIndex(block => block.id === blockId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= page.blocks.length) return;
    const blocks = [...page.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    updatePage(pageId, { blocks });
  }

  function createPage() {
    const title = newTitle.trim();
    if (!title) return;
    const id = createDefinitionId('page');
    const page: CustomPageDefinition = {
      id,
      title,
      description: '',
      layout: 'single',
      blocks: [newBlock('heading')],
    };
    props.onPagesChange([...pages, page]);
    props.onNavigationChange([
      ...navigation,
      {
        key: `custom:${id}`,
        label: title,
        group: 'Personalizado',
        icon: 'boxes',
        order: navigation.length,
        enabled: true,
        roles: ['superadmin', 'admin', 'operator'],
      },
    ]);
    setNewTitle('');
    setEditingId(id);
  }

  function removePage(page: CustomPageDefinition) {
    props.onPagesChange(pages.filter(item => item.id !== page.id));
    props.onNavigationChange(
      navigation
        .filter(item => item.key !== `custom:${page.id}`)
        .map((item, order) => ({ ...item, order }))
    );
    setEditingId('');
  }

  function addBlock(pageId: string) {
    const page = pages.find(item => item.id === pageId);
    if (!page) return;
    updatePage(pageId, { blocks: [...page.blocks, newBlock(blockType)] });
  }

  function updateField(
    pageId: string,
    block: CustomPageBlock,
    fieldId: string,
    patch: Partial<CustomPageField>
  ) {
    const fields = (block.fields ?? []).map(field =>
      field.id === fieldId ? { ...field, ...patch } : field
    );
    updateBlock(pageId, block.id, { fields });
  }

  function moveField(
    pageId: string,
    block: CustomPageBlock,
    fieldId: string,
    direction: -1 | 1
  ) {
    const fields = [...(block.fields ?? [])];
    const index = fields.findIndex(field => field.id === fieldId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= fields.length) return;
    [fields[index], fields[target]] = [fields[target], fields[index]];
    updateBlock(pageId, block.id, { fields });
  }

  if (!editing) {
    return (
      <div className="custom-pages-editor">
        <div className="navigation-editor-head">
          <div>
            <h3>Construtor de páginas personalizadas</h3>
            <p className="muted">
              Crie páginas novas sem código. Depois organize nome, grupo, ícone e
              permissões no editor do menu.
            </p>
          </div>
          <span className="badge">{pages.length} personalizadas</span>
        </div>

        <div className="custom-page-create">
          <label className="field">
            <span>Nome da nova página</span>
            <input
              value={newTitle}
              onChange={event => setNewTitle(event.target.value)}
              placeholder="Ex.: Cadastro de clientes"
            />
          </label>
          <button className="primary" onClick={createPage} disabled={!newTitle.trim()}>
            <FilePlus2 size={17} /> Criar página
          </button>
        </div>

        <div className="custom-page-list">
          {pages.length === 0 ? (
            <div className="member-empty">
              Nenhuma página personalizada. As páginas nativas continuam disponíveis acima.
            </div>
          ) : (
            pages.map(page => {
              const nav = navigation.find(item => item.key === `custom:${page.id}`);
              return (
                <div className="custom-page-card" key={page.id}>
                  <div>
                    <strong>{page.title}</strong>
                    <small>
                      {nav?.group ?? 'Personalizado'} · {page.blocks.length} blocos ·{' '}
                      {page.layout === 'two-column' ? '2 colunas' : '1 coluna'}
                    </small>
                  </div>
                  <div className="template-card-actions">
                    <button className="secondary" onClick={() => setEditingId(page.id)}>
                      <Pencil size={15} /> Editar conteúdo
                    </button>
                    <button className="danger-link" onClick={() => removePage(page)}>
                      <Trash2 size={15} /> Excluir página
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="custom-pages-editor">
      <div className="custom-page-builder-head">
        <div>
          <p className="eyebrow">PÁGINA PERSONALIZADA</p>
          <h3>{editing.title}</h3>
        </div>
        <button className="secondary" onClick={() => setEditingId('')}>
          <ArrowLeft size={16} /> Voltar às páginas
        </button>
      </div>

      <div className="custom-page-settings">
        <label className="field">
          <span>Título interno</span>
          <input
            value={editing.title}
            onChange={event => updatePage(editing.id, { title: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Layout</span>
          <AppSelect
            value={editing.layout}
            onValueChange={value =>
              updatePage(editing.id, {
                layout: value === 'two-column' ? 'two-column' : 'single',
              })
            }
            options={[
              { value: 'single', label: 'Uma coluna' },
              { value: 'two-column', label: 'Duas colunas' },
            ]}
            ariaLabel="Layout da página"
          />
        </label>
        <label className="field custom-page-description-field">
          <span>Descrição</span>
          <textarea
            value={editing.description ?? ''}
            onChange={event =>
              updatePage(editing.id, { description: event.target.value })
            }
            placeholder="Texto opcional exibido no topo da página."
          />
        </label>
      </div>

      <div className="custom-block-add">
        <AppSelect
          value={blockType}
          onValueChange={value => setBlockType(value as CustomPageBlockType)}
          options={blockOptions}
          ariaLabel="Tipo de bloco"
        />
        <button className="secondary" onClick={() => addBlock(editing.id)}>
          <Plus size={16} /> Adicionar bloco
        </button>
      </div>

      <div className="custom-block-list">
        {editing.blocks.map((block, index) => (
          <div className="custom-block-editor" key={block.id}>
            <div className="custom-block-editor-head">
              <strong>
                {blockOptions.find(option => option.value === block.type)?.label ??
                  block.type}
              </strong>
              <div>
                <button
                  className="secondary compact-action"
                  disabled={index === 0}
                  onClick={() => moveBlock(editing.id, block.id, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="secondary compact-action"
                  disabled={index === editing.blocks.length - 1}
                  onClick={() => moveBlock(editing.id, block.id, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  className="danger-link compact-action"
                  onClick={() =>
                    updatePage(editing.id, {
                      blocks: editing.blocks.filter(item => item.id !== block.id),
                    })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {block.type === 'heading' && (
              <div className="custom-block-grid">
                <label className="field">
                  <span>Título</span>
                  <input
                    value={block.title ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { title: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Subtítulo</span>
                  <input
                    value={block.subtitle ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { subtitle: event.target.value })
                    }
                  />
                </label>
              </div>
            )}

            {(block.type === 'text' || block.type === 'notice') && (
              <div className="custom-block-grid">
                <label className="field">
                  <span>Título opcional</span>
                  <input
                    value={block.title ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { title: event.target.value })
                    }
                  />
                </label>
                <label className="field custom-block-wide">
                  <span>Texto</span>
                  <textarea
                    value={block.text ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { text: event.target.value })
                    }
                  />
                </label>
              </div>
            )}

            {block.type === 'kpi' && (
              <div className="custom-block-grid three">
                <label className="field">
                  <span>Rótulo</span>
                  <input
                    value={block.label ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { label: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Valor exibido</span>
                  <input
                    value={block.value ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { value: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Observação</span>
                  <input
                    value={block.hint ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { hint: event.target.value })
                    }
                  />
                </label>
              </div>
            )}

            {block.type === 'link' && (
              <div className="custom-block-grid">
                <label className="field">
                  <span>Texto do botão</span>
                  <input
                    value={block.buttonLabel ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, {
                        buttonLabel: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>Link (http, https, telefone ou e-mail)</span>
                  <input
                    value={block.url ?? ''}
                    onChange={event =>
                      updateBlock(editing.id, block.id, { url: event.target.value })
                    }
                  />
                </label>
              </div>
            )}

            {block.type === 'divider' && (
              <div className="muted">Separador visual entre blocos.</div>
            )}

            {block.type === 'form' && (
              <div className="custom-form-builder">
                <div className="custom-block-grid">
                  <label className="field">
                    <span>Título do formulário</span>
                    <input
                      value={block.title ?? ''}
                      onChange={event =>
                        updateBlock(editing.id, block.id, { title: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Texto do botão</span>
                    <input
                      value={block.submitLabel ?? ''}
                      onChange={event =>
                        updateBlock(editing.id, block.id, {
                          submitLabel: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="custom-form-fields">
                  {(block.fields ?? []).map((field, fieldIndex) => (
                    <div className="custom-field-editor" key={field.id}>
                      <div className="custom-field-grid">
                        <label className="field">
                          <span>Nome do campo</span>
                          <input
                            value={field.label}
                            onChange={event =>
                              updateField(editing.id, block, field.id, {
                                label: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Tipo</span>
                          <AppSelect
                            value={field.type}
                            onValueChange={value =>
                              updateField(editing.id, block, field.id, {
                                type: value as CustomFieldType,
                              })
                            }
                            options={fieldOptions}
                            ariaLabel={'Tipo de ' + field.label}
                          />
                        </label>
                        <label className="field">
                          <span>Placeholder / ajuda</span>
                          <input
                            value={field.placeholder ?? ''}
                            onChange={event =>
                              updateField(editing.id, block, field.id, {
                                placeholder: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>

                      {field.type === 'select' && (
                        <label className="field">
                          <span>Opções separadas por vírgula</span>
                          <input
                            value={(field.options ?? []).join(', ')}
                            onChange={event =>
                              updateField(editing.id, block, field.id, {
                                options: event.target.value
                                  .split(',')
                                  .map(value => value.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </label>
                      )}

                      <div className="custom-field-actions">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={field.required}
                            onChange={event =>
                              updateField(editing.id, block, field.id, {
                                required: event.target.checked,
                              })
                            }
                          />
                          Obrigatório
                        </label>
                        <button
                          className="secondary compact-action"
                          disabled={fieldIndex === 0}
                          onClick={() =>
                            moveField(editing.id, block, field.id, -1)
                          }
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          className="secondary compact-action"
                          disabled={fieldIndex === (block.fields ?? []).length - 1}
                          onClick={() =>
                            moveField(editing.id, block, field.id, 1)
                          }
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          className="danger-link compact-action"
                          onClick={() =>
                            updateBlock(editing.id, block.id, {
                              fields: (block.fields ?? []).filter(
                                item => item.id !== field.id
                              ),
                            })
                          }
                        >
                          <Trash2 size={14} /> Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  className="secondary"
                  onClick={() =>
                    updateBlock(editing.id, block.id, {
                      fields: [...(block.fields ?? []), newField()],
                    })
                  }
                >
                  <Plus size={15} /> Adicionar campo
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
