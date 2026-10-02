import { useEffect, useMemo, useState } from 'react';
import { api } from '@/src/lib/platform';
import { ExternalLink, Trash2 } from 'lucide-react';
import {
  safeCustomLink,
  type CustomPageBlock,
  type CustomPageDefinition,
  type CustomPageSubmission,
} from '../customPages';

type Role = 'superadmin' | 'admin' | 'operator';

function fieldDefault(block: CustomPageBlock) {
  const values: Record<string, string | number | boolean> = {};
  for (const field of block.fields ?? []) {
    values[field.id] = field.type === 'checkbox' ? false : '';
  }
  return values;
}

export function CustomPageView(props: {
  storeId: string;
  page: CustomPageDefinition;
  role: Role;
}) {
  const [forms, setForms] = useState<
    Record<string, Record<string, string | number | boolean>>
  >({});
  const [message, setMessage] = useState('');
  const [submissions, setSubmissions] = useState<CustomPageSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);

  const formBlocks = useMemo(
    () => props.page.blocks.filter(block => block.type === 'form'),
    [props.page]
  );

  useEffect(() => {
    const initial: Record<
      string,
      Record<string, string | number | boolean>
    > = {};
    for (const block of formBlocks) initial[block.id] = fieldDefault(block);
    setForms(initial);
  }, [props.page.id, formBlocks]);

  async function loadSubmissions() {
    if (props.role === 'operator') return;
    setLoadingSubmissions(true);
    try {
      const { data } = await api.get(
        '/api/stores/' +
          props.storeId +
          '/custom-pages/' +
          props.page.id +
          '/submissions'
      );
      setSubmissions(
        (data as { items?: CustomPageSubmission[] }).items ?? []
      );
    } catch {
      setSubmissions([]);
    } finally {
      setLoadingSubmissions(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
  }, [props.storeId, props.page.id, props.role]);

  async function submit(block: CustomPageBlock) {
    setMessage('');
    try {
      await api.post(
        '/api/stores/' +
          props.storeId +
          '/custom-pages/' +
          props.page.id +
          '/submissions',
        {
          blockId: block.id,
          values: forms[block.id] ?? {},
        }
      );
      setForms(current => ({ ...current, [block.id]: fieldDefault(block) }));
      setMessage('Dados enviados com sucesso.');
      await loadSubmissions();
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível enviar os dados.'
      );
    }
  }

  async function removeSubmission(id: string) {
    try {
      await api.delete(
        '/api/stores/' +
          props.storeId +
          '/custom-pages/' +
          props.page.id +
          '/submissions/' +
          id
      );
      await loadSubmissions();
    } catch (cause) {
      setMessage(
        cause instanceof Error && cause.message
          ? cause.message
          : 'Não foi possível excluir o registro.'
      );
    }
  }

  return (
    <section className="custom-page-runtime">
      <div className="section-head">
        <div>
          <p className="eyebrow">PÁGINA PERSONALIZADA</p>
          <h2>{props.page.title}</h2>
          {props.page.description && (
            <p className="muted">{props.page.description}</p>
          )}
        </div>
      </div>

      {message && <div className="notice">{message}</div>}

      <div
        className={
          'custom-page-runtime-grid ' +
          (props.page.layout === 'two-column' ? 'two-column' : '')
        }
      >
        {props.page.blocks.map(block => {
          if (block.type === 'heading') {
            return (
              <div className="custom-runtime-block heading" key={block.id}>
                <h3>{block.title || 'Seção'}</h3>
                {block.subtitle && <p className="muted">{block.subtitle}</p>}
              </div>
            );
          }

          if (block.type === 'text') {
            return (
              <div className="custom-runtime-block text" key={block.id}>
                {block.title && <h3>{block.title}</h3>}
                <p>{block.text}</p>
              </div>
            );
          }

          if (block.type === 'notice') {
            return (
              <div className="custom-runtime-block notice-block" key={block.id}>
                {block.title && <strong>{block.title}</strong>}
                <p>{block.text}</p>
              </div>
            );
          }

          if (block.type === 'kpi') {
            return (
              <div className="custom-runtime-block kpi-block" key={block.id}>
                <span>{block.label || 'Indicador'}</span>
                <strong>{block.value || '0'}</strong>
                {block.hint && <small>{block.hint}</small>}
              </div>
            );
          }

          if (block.type === 'link') {
            const href = safeCustomLink(block.url);
            return (
              <div className="custom-runtime-block link-block" key={block.id}>
                {href ? (
                  <a
                    className="primary"
                    href={href}
                    target={href.startsWith('http') ? '_blank' : undefined}
                    rel={href.startsWith('http') ? 'noreferrer' : undefined}
                  >
                    {block.buttonLabel || 'Abrir'} <ExternalLink size={15} />
                  </a>
                ) : (
                  <div className="muted">Link ainda não configurado.</div>
                )}
              </div>
            );
          }

          if (block.type === 'divider') {
            return <hr className="custom-runtime-divider" key={block.id} />;
          }

          if (block.type === 'form') {
            const values = forms[block.id] ?? fieldDefault(block);
            return (
              <div className="custom-runtime-block form-block" key={block.id}>
                <h3>{block.title || 'Formulário'}</h3>
                <div className="custom-runtime-form">
                  {(block.fields ?? []).map(field => (
                    <label className="field" key={field.id}>
                      <span>
                        {field.label}
                        {field.required ? ' *' : ''}
                      </span>
                      {field.type === 'textarea' ? (
                        <textarea
                          value={String(values[field.id] ?? '')}
                          placeholder={field.placeholder}
                          onChange={event =>
                            setForms(current => ({
                              ...current,
                              [block.id]: {
                                ...(current[block.id] ?? values),
                                [field.id]: event.target.value,
                              },
                            }))
                          }
                        />
                      ) : field.type === 'select' ? (
                        <select
                          value={String(values[field.id] ?? '')}
                          onChange={event =>
                            setForms(current => ({
                              ...current,
                              [block.id]: {
                                ...(current[block.id] ?? values),
                                [field.id]: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Selecione</option>
                          {(field.options ?? []).map(option => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'checkbox' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(values[field.id])}
                          onChange={event =>
                            setForms(current => ({
                              ...current,
                              [block.id]: {
                                ...(current[block.id] ?? values),
                                [field.id]: event.target.checked,
                              },
                            }))
                          }
                        />
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
                          value={String(values[field.id] ?? '')}
                          placeholder={field.placeholder}
                          onChange={event =>
                            setForms(current => ({
                              ...current,
                              [block.id]: {
                                ...(current[block.id] ?? values),
                                [field.id]:
                                  field.type === 'number'
                                    ? event.target.value
                                    : event.target.value,
                              },
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                  <button className="primary" onClick={() => void submit(block)}>
                    {block.submitLabel || 'Enviar'}
                  </button>
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>

      {props.role !== 'operator' && formBlocks.length > 0 && (
        <div className="panel custom-submissions-panel">
          <div className="custom-submissions-head">
            <div>
              <h3>Registros recebidos</h3>
              <p className="muted">
                Últimos registros enviados pelos formulários desta página.
              </p>
            </div>
            <span className="badge">{submissions.length}</span>
          </div>
          {loadingSubmissions ? (
            <div className="muted">Carregando registros...</div>
          ) : submissions.length === 0 ? (
            <div className="member-empty">Nenhum registro recebido.</div>
          ) : (
            <div className="custom-submission-list">
              {submissions.map(item => {
                const block = formBlocks.find(form => form.id === item.blockId);
                return (
                  <div className="custom-submission-card" key={item.id}>
                    <div className="custom-submission-card-head">
                      <div>
                        <strong>{block?.title || 'Formulário'}</strong>
                        <small>
                          {new Date(item.createdAt).toLocaleString('pt-BR')}
                        </small>
                      </div>
                      <button
                        className="danger-link compact-action"
                        onClick={() => void removeSubmission(item.id)}
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                    <div className="custom-submission-values">
                      {Object.entries(item.values).map(([fieldId, value]) => {
                        const field = block?.fields?.find(entry => entry.id === fieldId);
                        return (
                          <div key={fieldId}>
                            <span>{field?.label || fieldId}</span>
                            <strong>
                              {typeof value === 'boolean'
                                ? value
                                  ? 'Sim'
                                  : 'Não'
                                : String(value)}
                            </strong>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
