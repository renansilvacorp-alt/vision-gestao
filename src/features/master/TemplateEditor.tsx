import { useEffect, useMemo, useState } from 'react';
import { api } from '@/src/lib/platform';
import { ArrowLeft, Boxes, Save } from 'lucide-react';
import { NavigationEditor } from '../../components/NavigationEditor';
import { CustomPagesEditor } from '../../components/CustomPagesEditor';
import { normalizeCustomPages, type CustomPageDefinition } from '../../customPages';
import {
  isCustomNavigationKey,
  normalizeNavigationItems,
  type NavigationItem,
} from '../../navigation';

export type TemplateModel = {
  id: string;
  name: string;
  sourceLabel?: string;
  createdAt: string;
  updatedAt: string;
  version?: number;
  modules: { encomendas: boolean };
  navigation?: NavigationItem[];
  customPages?: CustomPageDefinition[];
};

function packageNavigation(items?: NavigationItem[]) {
  return normalizeNavigationItems(items).filter(item =>
    isCustomNavigationKey(item.key)
  );
}

function cloneTemplate(template: TemplateModel): TemplateModel {
  return {
    ...template,
    modules: { ...template.modules },
    navigation: packageNavigation(template.navigation),
    customPages: normalizeCustomPages(template.customPages),
  };
}

export function TemplateEditor(props: {
  template: TemplateModel;
  onBack: () => void;
  onSaved: (template: TemplateModel) => void;
}) {
  const [draft, setDraft] = useState(() => cloneTemplate(props.template));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraft(cloneTemplate(props.template));
    setMessage('');
  }, [props.template.id]);

  const navigation = useMemo(
    () => packageNavigation(draft.navigation),
    [draft.navigation]
  );
  const pages = useMemo(
    () => normalizeCustomPages(draft.customPages),
    [draft.customPages]
  );

  async function save() {
    if (!draft.name.trim()) {
      setMessage('Informe o nome do container.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const { data } = await api.put(
        '/api/superadmin/templates/' + draft.id,
        {
          name: draft.name.trim(),
          modules: draft.modules,
          navigation,
          customPages: pages,
        }
      );
      const saved = data as TemplateModel;
      setDraft(cloneTemplate(saved));
      props.onSaved(saved);
      setMessage(
        'Container salvo. Ele pode ser instalado em empresas novas ou existentes.'
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível salvar o container.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="template-editor">
      <div className="section-head template-editor-top">
        <div>
          <p className="eyebrow">CONTAINER STUDIO · PACOTE INSTALÁVEL</p>
          <h2>{draft.name}</h2>
          <small>
            Versão {draft.version ?? 1} · {pages.length} páginas funcionais
          </small>
        </div>
        <button className="secondary" onClick={props.onBack}>
          <ArrowLeft size={17} /> Voltar aos containers
        </button>
      </div>

      <div className="info-card container-package-explainer">
        <Boxes size={22} />
        <div>
          <strong>Este container não é uma loja.</strong>
          <span>
            Ele é um pacote funcional reutilizável. Você cria aqui e depois
            instala em uma ou várias empresas, existentes ou novas, sem trocar
            usuários, taxas, produtos, vendas, logo ou cores da empresa.
          </span>
        </div>
      </div>

      <div className="template-editor-main">
        <div className="panel">
          <h3>Identificação do container</h3>
          <label className="field">
            <span>Nome do pacote</span>
            <input
              value={draft.name}
              onChange={event =>
                setDraft(current => ({ ...current, name: event.target.value }))
              }
            />
          </label>
        </div>

        <div className="panel">
          <h3>Dependências funcionais</h3>
          <label className="module-control">
            <div>
              <strong>Habilitar Encomendas ao instalar</strong>
              <small>
                Se marcado, o container ativa o módulo Encomendas na empresa.
                Remover o container não apaga nem desativa dados existentes.
              </small>
            </div>
            <input
              type="checkbox"
              checked={draft.modules.encomendas}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  modules: {
                    ...current.modules,
                    encomendas: event.target.checked,
                  },
                }))
              }
            />
          </label>
        </div>

        <div className="panel">
          <CustomPagesEditor
            pages={pages}
            navigation={navigation}
            onPagesChange={customPages =>
              setDraft(current => ({ ...current, customPages }))
            }
            onNavigationChange={items =>
              setDraft(current => ({
                ...current,
                navigation: items.filter(item =>
                  isCustomNavigationKey(item.key)
                ),
              }))
            }
          />
        </div>

        {navigation.length > 0 && (
          <div className="panel">
            <NavigationEditor
              items={navigation}
              onChange={items =>
                setDraft(current => ({
                  ...current,
                  navigation: items.filter(item =>
                    isCustomNavigationKey(item.key)
                  ),
                }))
              }
            />
          </div>
        )}

        <div className="template-editor-actions">
          <button className="primary" disabled={saving} onClick={() => void save()}>
            <Save size={18} /> Salvar nova versão do container
          </button>
          {message && <div className="notice">{message}</div>}
        </div>
      </div>
    </section>
  );
}
