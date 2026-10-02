import { useEffect, useState } from 'react';
import { api } from '@/src/lib/platform';
import { Boxes, Copy, Pencil, Plus, Trash2 } from 'lucide-react';
import { useConfirm } from '../../components/ConfirmProvider';
import { TemplateEditor, type TemplateModel } from './TemplateEditor';
import { normalizeCustomPages } from '../../customPages';

export function ContainerTemplates() {
  const confirmAction = useConfirm();
  const [templates, setTemplates] = useState<TemplateModel[]>([]);
  const [editingId, setEditingId] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const { data } = await api.get('/api/superadmin/templates');
      const next = (data as { items?: TemplateModel[] }).items ?? [];
      setTemplates(
        [...next].sort((a, b) =>
          a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
        )
      );
    } catch {
      setMessage('Não foi possível carregar os containers.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const editing = templates.find(template => template.id === editingId);

  async function createTemplate() {
    if (!name.trim()) {
      setMessage('Informe um nome para o container.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const { data } = await api.post('/api/superadmin/templates', {
        name: name.trim(),
      });
      const created = data as TemplateModel;
      setName('');
      await load();
      setEditingId(created.id);
    } catch {
      setMessage('Não foi possível criar o container.');
    } finally {
      setSaving(false);
    }
  }

  async function duplicateTemplate(template: TemplateModel) {
    setSaving(true);
    setMessage('');
    try {
      const { data } = await api.post(
        '/api/superadmin/templates/' + template.id + '/duplicate',
        { name: template.name + ' - Cópia' }
      );
      const created = data as TemplateModel;
      await load();
      setEditingId(created.id);
    } catch {
      setMessage('Não foi possível duplicar o container.');
    } finally {
      setSaving(false);
    }
  }

  async function removeTemplate(template: TemplateModel) {
    const allowed = await confirmAction({
      title: 'Excluir container do Studio?',
      message:
        'O pacote “' +
        template.name +
        '” não poderá mais ser instalado ou atualizado. Empresas que já possuem uma versão instalada continuam funcionando com a cópia que receberam.',
      confirmLabel: 'Excluir do Studio',
      danger: true,
    });
    if (!allowed) return;
    try {
      await api.delete('/api/superadmin/templates/' + template.id);
      if (editingId === template.id) setEditingId('');
      setMessage('Container removido do Studio.');
      await load();
    } catch {
      setMessage('Não foi possível excluir o container.');
    }
  }

  if (editing) {
    return (
      <TemplateEditor
        template={editing}
        onBack={() => setEditingId('')}
        onSaved={saved => {
          setTemplates(current =>
            current
              .map(template => (template.id === saved.id ? saved : template))
              .sort((a, b) =>
                a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
              )
          );
        }}
      />
    );
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">SUPERADMIN · CONTAINER STUDIO</p>
          <h2>Containers instaláveis</h2>
        </div>
      </div>

      <div className="info-card container-concept">
        <Boxes size={22} />
        <div>
          <strong>Crie uma vez. Instale em qualquer empresa.</strong>
          <span>
            Um container é um pacote de funções e páginas. Ele não cria outra
            loja e não substitui a configuração da empresa: é adicionado por
            cima da empresa existente e passa a funcionar nela.
          </span>
        </div>
      </div>

      <div className="panel template-builder">
        <div className="template-builder-head">
          <div>
            <span className="badge">NOVO PACOTE</span>
            <h3>Criar container</h3>
            <small>
              Monte páginas e funções que poderão ser instaladas em quantas
              empresas você quiser.
            </small>
          </div>
          <Copy size={26} />
        </div>

        <div className="template-builder-grid single-action">
          <label className="field">
            <span>Nome do container</span>
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Ex.: CRM de Leads"
            />
          </label>
          <button
            className="primary"
            disabled={saving}
            onClick={() => void createTemplate()}
          >
            <Plus size={18} /> Criar e editar
          </button>
        </div>
      </div>

      <div className="template-section-head">
        <div>
          <h3>Biblioteca de containers</h3>
          <small>Pacotes reutilizáveis disponíveis para instalação.</small>
        </div>
      </div>

      <div className="template-list">
        {templates.length === 0 ? (
          <div className="info-card">Nenhum container criado ainda.</div>
        ) : (
          templates.map(template => {
            const pageCount = normalizeCustomPages(template.customPages).length;
            return (
              <div className="template-card" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <small>
                    v{template.version ?? 1} · {pageCount}{' '}
                    {pageCount === 1 ? 'página funcional' : 'páginas funcionais'}
                  </small>
                  <small>
                    {template.modules.encomendas
                      ? 'Ativa Encomendas ao instalar'
                      : 'Sem dependência de módulos nativos'}
                  </small>
                </div>
                <div className="template-card-actions">
                  <button
                    className="secondary"
                    onClick={() => setEditingId(template.id)}
                  >
                    <Pencil size={16} /> Editar pacote
                  </button>
                  <button
                    className="secondary"
                    disabled={saving}
                    onClick={() => void duplicateTemplate(template)}
                  >
                    <Copy size={16} /> Duplicar
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => void removeTemplate(template)}
                  >
                    <Trash2 size={16} /> Excluir
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {message && <div className="notice">{message}</div>}
    </section>
  );
}
