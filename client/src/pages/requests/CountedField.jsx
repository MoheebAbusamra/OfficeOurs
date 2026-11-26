// [S2] Input or textarea with a live character counter and a thin ink bar (used by FAQs and New request)
export default function CountedField({ id, label, value, onChange, error, max, multiline, autoFocus, placeholder }) {
  const len = value.trim().length;
  const ratio = Math.min(len / max, 1);
  const state = len > max ? 'over' : ratio >= 0.85 ? 'near' : 'ok';
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      <Tag id={id} className={multiline ? 'textarea' : 'input'} value={value} onChange={onChange} placeholder={placeholder}
        aria-invalid={!!error} aria-describedby={`${id}-count ${id}-error`} {...(autoFocus ? { 'data-autofocus': true } : {})} />
      <div className={`ink-bar ink-${state}`} aria-hidden="true"><span style={{ width: `${ratio * 100}%` }} /></div>
      <div className="field-foot">
        <span id={`${id}-error`} className="field-error">{error}</span>
        <span id={`${id}-count`} className={`char-count count-${state}`}>
          {len > max ? `${len - max} over the limit` : `${len} / ${max}`}
        </span>
      </div>
    </div>
  );
}
