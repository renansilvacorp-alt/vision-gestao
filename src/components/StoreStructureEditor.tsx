import { useEffect, useState } from 'react';
import { api } from '@/src/lib/platform';
import { Save } from 'lucide-react';
import { ContainerManager, type InstalledContainer } from './ContainerManager';
import { NavigationEditor } from './NavigationEditor';
import { CustomPagesEditor } from './CustomPagesEditor';
import { normalizeCustomPages, type CustomPageDefinition } from '../customPages';
import {
  normalizeNavigationItems,
  type NavigationItem,
} from '../navigation';

type StructureStore = {
  id: string;
  name: string;
  navigation?: NavigationItem[];
  customPages?: CustomPageDefinition[];
  installedContainers?: InstalledContainer[];
};

export function StoreStructureEditor(props: {
  store: StructureStore;
  onUpdated: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState(() =>
    normalizeNavigationItems(props.store.navigation)
  );
  const [customPages, setCustomPages] = useState(() =>
    normalizeCustomPages(props.store.customPages)
  );
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeNavigationItems(props.store.navigation));
    setCustomPages(normalizeCustomPages(props.store.customPages));
  }, [props.store.id, props.store.navigation, props.store.customPages]);

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      await api.put(
        '/api/superadmin/stores/' + props.store.id + '/structure',
        { navigation: draft, customPages }
      );
      await props.onUpdated();
      setMessage('Personalização local da empresa salva.');
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível salvar a estrutura da empresa.'
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="section-head">
        <div>
          <p className="eyebrow">SUPERADMIN · EMPRESA</p>
          <h2>Estrutura e containers</h2>
          <p className="muted">
            Instale pacotes prontos e, se precisar, personalize esta empresa
            individualmente.
          </p>
        </div>
      </div>

      <div className="panel">
        <ContainerManager
          store={props.store}
          onUpdated={props.onUpdated}
        />
      </div>

      <div className="info-card">
        Containers são aditivos. Instalar um pacote não substitui usuários,
        produtos, vendas, taxas, logo ou cores desta empresa.
      </div>

      <div className="panel">
        <NavigationEditor items={draft} onChange={setDraft} />
      </div>

      <div className="panel">
        <CustomPagesEditor
          pages={customPages}
          navigation={draft}
          onPagesChange={setCustomPages}
          onNavigationChange={setDraft}
        />
      </div>

      <div className="template-editor-actions">
        <button className="primary" disabled={saving} onClick={() => void save()}>
          <Save size={18} /> Salvar personalização local
        </button>
        {message && <div className="notice">{message}</div>}
      </div>
    </section>
  );
}
