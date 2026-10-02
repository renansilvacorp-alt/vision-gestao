import { useEffect, useMemo, useState } from 'react';
import { api } from '@/src/lib/platform';
import { Boxes, Download, RefreshCw, Trash2 } from 'lucide-react';
import { AppSelect } from './AppSelect';
import { useConfirm } from './ConfirmProvider';

export type InstalledContainer = {
  containerId: string;
  version: number;
  installedAt: string;
  updatedAt?: string;
};

export type ContainerSummary = {
  id: string;
  name: string;
  version?: number;
};

export function ContainerManager(props: {
  store: {
    id: string;
    name: string;
    installedContainers?: InstalledContainer[];
  };
  templates?: ContainerSummary[];
  onUpdated: () => void | Promise<void>;
  compact?: boolean;
}) {
  const confirmAction = useConfirm();
  const [templates, setTemplates] = useState<ContainerSummary[]>(
    props.templates ?? []
  );
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (props.templates) {
      setTemplates(props.templates);
      return;
    }
    api
      .get('/api/superadmin/templates')
      .then(response =>
        setTemplates(
          (response.data as { items?: ContainerSummary[] }).items ?? []
        )
      )
      .catch(() => setTemplates([]));
  }, [props.templates]);

  const installed = props.store.installedContainers ?? [];
  const installedIds = useMemo(
    () => new Set(installed.map(item => item.containerId)),
    [installed]
  );
  const available = templates.filter(item => !installedIds.has(item.id));

  useEffect(() => {
    if (selected && available.some(item => item.id === selected)) return;
    setSelected(available[0]?.id ?? '');
  }, [available, selected]);

  async function install(containerId: string) {
    if (!containerId) return;
    setBusy(containerId);
    setMessage('');
    try {
      await api.post(
        '/api/superadmin/stores/' +
          props.store.id +
          '/containers/' +
          containerId,
        {}
      );
      await props.onUpdated();
      const container = templates.find(item => item.id === containerId);
      setMessage(
        (container?.name ?? 'Container') + ' instalado e ativo nesta empresa.'
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível instalar o container.'
      );
    } finally {
      setBusy('');
    }
  }

  async function remove(containerId: string) {
    const container = templates.find(item => item.id === containerId);
    const allowed = await confirmAction({
      title: 'Remover container da empresa?',
      message:
        'As páginas e entradas de menu fornecidas por “' +
        (container?.name ?? 'este container') +
        '” serão retiradas desta empresa. Os demais dados, usuários, taxas e identidade não serão alterados.',
      confirmLabel: 'Remover container',
      danger: true,
    });
    if (!allowed) return;

    setBusy(containerId);
    setMessage('');
    try {
      await api.delete(
        '/api/superadmin/stores/' +
          props.store.id +
          '/containers/' +
          containerId
      );
      await props.onUpdated();
      setMessage('Container removido desta empresa.');
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível remover o container.'
      );
    } finally {
      setBusy('');
    }
  }

  return (
    <div className={'container-manager ' + (props.compact ? 'compact' : '')}>
      <div className="container-manager-head">
        <div>
          <Boxes size={20} />
          <div>
            <strong>Containers instalados</strong>
            <small>
              Pacotes funcionais independentes que rodam dentro desta empresa.
            </small>
          </div>
        </div>
        <span className="badge">{installed.length}</span>
      </div>

      {installed.length > 0 && (
        <div className="installed-container-list">
          {installed.map(item => {
            const container = templates.find(entry => entry.id === item.containerId);
            const latestVersion = container?.version ?? item.version;
            const hasUpdate = latestVersion > item.version;
            return (
              <div className="installed-container-row" key={item.containerId}>
                <div>
                  <strong>{container?.name ?? 'Container indisponível no Studio'}</strong>
                  <small>
                    Instalado v{item.version}
                    {hasUpdate ? ' · nova versão v' + latestVersion + ' disponível' : ' · atualizado'}
                  </small>
                </div>
                <div>
                  {container && hasUpdate && (
                    <button
                      className="secondary compact-action"
                      disabled={Boolean(busy)}
                      onClick={() => void install(item.containerId)}
                    >
                      <RefreshCw size={14} /> Atualizar
                    </button>
                  )}
                  <button
                    className="danger-link compact-action"
                    disabled={Boolean(busy)}
                    onClick={() => void remove(item.containerId)}
                  >
                    <Trash2 size={14} /> Remover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {available.length > 0 ? (
        <div className="container-install-row">
          <AppSelect
            value={selected || available[0].id}
            onValueChange={setSelected}
            options={available.map(item => ({
              value: item.id,
              label: item.name + ' · v' + (item.version ?? 1),
            }))}
            ariaLabel="Container para instalar"
          />
          <button
            className="primary"
            disabled={!selected || Boolean(busy)}
            onClick={() => void install(selected)}
          >
            <Download size={16} /> Instalar container
          </button>
        </div>
      ) : (
        <small className="muted">
          {templates.length === 0
            ? 'Nenhum container criado no Studio.'
            : 'Todos os containers disponíveis já estão instalados.'}
        </small>
      )}

      {message && <div className="notice">{message}</div>}
    </div>
  );
}
