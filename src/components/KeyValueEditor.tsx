import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { row } from '../model';
import type { Row } from '../types';
import { useI18n } from '../i18n';

export default function KeyValueEditor({ rows, onChange, keyLabel: suppliedKeyLabel, valueLabel: suppliedValueLabel, sensitive = false }: {
  rows: Row[]; onChange(rows: Row[]): void; keyLabel?: string; valueLabel?: string; sensitive?: boolean;
}) {
  const { t } = useI18n();
  const keyLabel = suppliedKeyLabel ?? t("参数名"), valueLabel = suppliedValueLabel ?? t("参数值");
  const [draft, setDraft] = useState<Row>(() => row());
  const update = (index: number, change: Partial<Row>) => {
    if (index === rows.length) {
      onChange([...rows, { ...draft, ...change }]);
      setDraft(row());
    } else onChange(rows.map((item, i) => i === index ? { ...item, ...change } : item));
  };
  return <div className="kv-editor">
    <div className="kv-head"><span /><span>{keyLabel}</span><span>{valueLabel}</span><span /></div>
    {[...rows, draft].map((item, index) => <div className={`kv-row ${index === rows.length ? 'new-row' : ''} ${item.enabled ? '' : 'disabled'}`} key={item.id}>
      {index === rows.length ? <span className="check-cell"><Plus size={14} /></span> : <label className="check-cell"><input type="checkbox" checked={item.enabled} onChange={event => update(index, { enabled: event.target.checked })} aria-label={t("启用第 {0} 行", [index + 1])} /></label>}
      <input className="mono" aria-label={index === rows.length ? t("添加{0}", [keyLabel]) : `${keyLabel} ${index + 1}`} placeholder={index === rows.length ? t("添加新字段…") : keyLabel} value={item.key} onChange={event => update(index, { key: event.target.value })} spellCheck={false} />
      <input className="mono" aria-label={index === rows.length ? t("添加{0}", [valueLabel]) : `${valueLabel} ${index + 1}`} type={sensitive ? 'password' : 'text'} placeholder={index === rows.length ? t("值，或 {{变量名}}") : valueLabel} value={item.value} onChange={event => update(index, { value: event.target.value })} spellCheck={false} />
      {index < rows.length ? <button className="icon-button row-delete" title={t("删除此行")} aria-label={t("删除第 {0} 行", [index + 1])} onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 size={14} /></button> : <span />}
    </div>)}
  </div>;
}
