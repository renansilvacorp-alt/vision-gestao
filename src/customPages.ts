export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox';

export type CustomPageField = {
  id: string;
  label: string;
  type: CustomFieldType;
  placeholder?: string;
  required: boolean;
  options?: string[];
};

export type CustomPageBlockType =
  | 'heading'
  | 'text'
  | 'notice'
  | 'kpi'
  | 'link'
  | 'divider'
  | 'form';

export type CustomPageBlock = {
  id: string;
  type: CustomPageBlockType;
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

export type CustomPageDefinition = {
  id: string;
  title: string;
  description?: string;
  layout: 'single' | 'two-column';
  blocks: CustomPageBlock[];
};

export type CustomPageSubmission = {
  id: string;
  pageId: string;
  blockId: string;
  values: Record<string, string | number | boolean>;
  createdAt: string;
  createdBy?: string;
};

const allowedBlockTypes = new Set<CustomPageBlockType>([
  'heading',
  'text',
  'notice',
  'kpi',
  'link',
  'divider',
  'form',
]);

const allowedFieldTypes = new Set<CustomFieldType>([
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'checkbox',
]);

export function createDefinitionId(prefix: 'page' | 'block' | 'field') {
  const suffix =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Date.now().toString(36);
  return prefix + '_' + suffix;
}

export function normalizeCustomPages(
  pages?: CustomPageDefinition[] | null
): CustomPageDefinition[] {
  if (!Array.isArray(pages)) return [];

  return pages.slice(0, 30).flatMap(page => {
    const id = String(page.id ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
    if (!id) return [];

    const blocks = Array.isArray(page.blocks)
      ? page.blocks.slice(0, 40).flatMap(block => {
          const blockId = String(block.id ?? '')
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, 80);
          if (!blockId || !allowedBlockTypes.has(block.type)) return [];

          const fields =
            block.type === 'form' && Array.isArray(block.fields)
              ? block.fields.slice(0, 30).flatMap(field => {
                  const fieldId = String(field.id ?? '')
                    .replace(/[^a-zA-Z0-9_-]/g, '')
                    .slice(0, 80);
                  if (!fieldId || !allowedFieldTypes.has(field.type)) return [];
                  return [{
                    id: fieldId,
                    label: String(field.label ?? 'Campo').slice(0, 80),
                    type: field.type,
                    placeholder: String(field.placeholder ?? '').slice(0, 120),
                    required: field.required === true,
                    options: Array.isArray(field.options)
                      ? field.options
                          .map(option => String(option).trim())
                          .filter(Boolean)
                          .slice(0, 30)
                      : [],
                  }];
                })
              : [];

          return [{
            id: blockId,
            type: block.type,
            title: String(block.title ?? '').slice(0, 120),
            subtitle: String(block.subtitle ?? '').slice(0, 220),
            text: String(block.text ?? '').slice(0, 5000),
            label: String(block.label ?? '').slice(0, 120),
            value: String(block.value ?? '').slice(0, 120),
            hint: String(block.hint ?? '').slice(0, 220),
            url: String(block.url ?? '').slice(0, 500),
            buttonLabel: String(block.buttonLabel ?? '').slice(0, 80),
            submitLabel: String(block.submitLabel ?? '').slice(0, 80),
            fields,
          }];
        })
      : [];

    return [{
      id,
      title: String(page.title ?? 'Página personalizada').slice(0, 120),
      description: String(page.description ?? '').slice(0, 1000),
      layout: page.layout === 'two-column' ? 'two-column' : 'single',
      blocks,
    }];
  });
}

export function safeCustomLink(url?: string) {
  const value = String(url ?? '').trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return '';
}
