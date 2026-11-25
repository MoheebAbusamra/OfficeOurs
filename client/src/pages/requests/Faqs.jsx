// [S2] Faqs: Instructor manages their FAQ list used by the AI check
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { createFaq, deleteFaq, getFaqs, updateFaq } from '@/api/requests';
import { useAuth } from '@/context/AuthContext';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import Dialog from './Dialog';
import ThinkingStudent from './ThinkingStudent';
import CountedField from './CountedField';
import './requests.css';

const LIMITS = { question: [5, 300], answer: [5, 2000] };
const TONES = ['butter', 'blue', 'rose', 'mint'];
const EMPTY = { moduleId: '', question: '', answer: '' };

// Card footer: a soft tinted tag (same module = same colour) with the module name
function ModuleLabel({ module, tone }) {
  const variant = module ? tone : 'all';
  return (
    <div className="faq-module">
      <span className={`module-tag tag-${variant}`} title={module ? `${module.code} · ${module.name}` : 'Applies to all my modules'}>
        <span className={`dot dot-${variant}`} aria-hidden="true" />
        <span className="module-name">{module ? module.name : 'General'}</span>
      </span>
    </div>
  );
}

export default function Faqs() {
  const { user } = useAuth();
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState({ type: '', text: '' });
  const notify = (type, text) => setFlash({ type, text, at: Date.now() }); // "at" restarts the fade for repeated messages
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [editing, setEditing] = useState(null); // null = closed, {} = new, faq = edit
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const toneOf = useMemo(() => Object.fromEntries(user.modules.map((m, i) => [m.id, TONES[i % TONES.length]])), [user.modules]);
  const moduleOf = id => user.modules.find(m => m.id === id) || null;

  const load = useCallback(() => getFaqs()
    .then(res => setFaqs(res.data))
    .catch(err => notify('error', err.message))
    .finally(() => setLoading(false)), []);
  useEffect(() => { load(); }, [load]);

  // Success messages fade away after 5 seconds; errors stay until closed
  useEffect(() => {
    if (flash.type !== 'success') return undefined;
    const timer = setTimeout(() => setFlash({ type: '', text: '' }), 5000);
    return () => clearTimeout(timer);
  }, [flash]);

  // Coverage per module (counts on all FAQs, not the filtered view)
  const counts = useMemo(() => {
    const c = { all: faqs.length, general: faqs.filter(f => !f.moduleId).length };
    user.modules.forEach(m => { c[m.id] = faqs.filter(f => f.moduleId === m.id).length; });
    return c;
  }, [faqs, user.modules]);

  const visible = faqs.filter(f =>
    (moduleFilter === 'all' || (moduleFilter === 'general' ? !f.moduleId : f.moduleId === moduleFilter))
    && `${f.question} ${f.answer}`.toLowerCase().includes(search.trim().toLowerCase()));

  const openForm = faq => {
    setEditing(faq || {});
    setForm(faq ? { moduleId: faq.moduleId ?? '', question: faq.question, answer: faq.answer } : EMPTY);
    setErrors({});
  };
  const closeForm = () => { if (!saving) setEditing(null); };

  const set = field => e => {
    setForm({ ...form, [field]: e.target.value });
    setErrors({ ...errors, [field]: '' });
  };

  const validate = () => {
    const found = {};
    Object.entries(LIMITS).forEach(([field, [min, max]]) => {
      const len = form[field].trim().length;
      if (len < min) found[field] = `Write at least ${min} characters`;
      else if (len > max) found[field] = `Keep it under ${max} characters`;
    });
    setErrors(found);
    return !Object.keys(found).length;
  };

  const save = async e => {
    e.preventDefault();
    if (!validate()) return;
    const body = { moduleId: form.moduleId === '' ? null : Number(form.moduleId), question: form.question.trim(), answer: form.answer.trim() };
    setSaving(true);
    try {
      if (editing.id) await updateFaq(editing.id, body);
      else await createFaq(body);
      notify('success', editing.id ? 'FAQ updated.' : 'FAQ added. Our AI will use it from now on.');
      setEditing(null);
      load();
    } catch (err) {
      setErrors(Object.fromEntries((err.details || []).map(d => [d.field, d.issue])));
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    setSaving(true);
    try {
      await deleteFaq(toDelete.id);
      notify('success', 'FAQ deleted.');
      setToDelete(null);
      load();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Answer once" title="FAQs"
        description="Our AI will check every student question against these before a meeting is booked.">
        <div className="faq-head-side">
          <ThinkingStudent />
          <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
            <Plus size={18} aria-hidden="true" /> Add FAQ
          </button>
        </div>
      </PageHeader>

      <div className="stack">
        <div key={flash.at} className={flash.type === 'success' ? 'flash-auto' : undefined}>
          <Alert type={flash.type || 'info'} onClose={() => setFlash({ type: '', text: '' })}>{flash.text}</Alert>
        </div>

        <div className="faq-toolbar">
          <label className="search">
            <Search size={18} aria-hidden="true" />
            <span className="sr-only">Search FAQs</span>
            <input className="input" type="search" placeholder="Search questions and answers" value={search} onChange={e => setSearch(e.target.value)} />
          </label>
          <div className="module-tabs" role="group" aria-label="Filter by module">
            <button type="button" className="module-tab" aria-pressed={moduleFilter === 'all'} onClick={() => setModuleFilter('all')}>
              All <span className="tab-count">{counts.all}</span>
            </button>
            {user.modules.map(m => (
              <button key={m.id} type="button" className={`module-tab${counts[m.id] ? '' : ' tab-empty'}`}
                aria-pressed={moduleFilter === m.id} onClick={() => setModuleFilter(m.id)} title={m.code}>
                {m.name} <span className="tab-count">{counts[m.id]}</span>
              </button>
            ))}
            <button type="button" className={`module-tab${counts.general ? '' : ' tab-empty'}`} aria-pressed={moduleFilter === 'general'} onClick={() => setModuleFilter('general')}>
              General <span className="tab-count">{counts.general}</span>
            </button>
          </div>
        </div>

        {loading && <p className="muted" role="status">Loading your FAQs...</p>}

        {!loading && faqs.length === 0 && (
          <div className="todo stack">
            <ThinkingStudent size={110} />
            <span className="hand">No FAQs yet</span>
            <p className="muted">Add the questions students ask you most. Each one can save a meeting.</p>
          </div>
        )}

        {!loading && faqs.length > 0 && visible.length === 0 && (
          <p className="muted center">No FAQ matches {search ? `"${search}"` : 'this module'}.</p>
        )}

        <ul className="faq-list">
          {visible.map((f, i) => (
            <li key={f.id} className="card faq-card" style={{ '--i': i }}>
              <div className="faq-top">
                <p className="faq-q"><span className="hand">Q.</span> {f.question}</p>
                <div className="faq-actions">
                  <button type="button" className="btn btn-ghost icon-btn" onClick={() => openForm(f)} aria-label={`Edit: ${f.question}`}>
                    <Pencil size={18} aria-hidden="true" />
                  </button>
                  <button type="button" className="btn btn-ghost icon-btn" onClick={() => setToDelete(f)} aria-label={`Delete: ${f.question}`}>
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="faq-a"><span className="hand">A.</span> {f.answer}</p>
              <ModuleLabel module={moduleOf(f.moduleId)} tone={toneOf[f.moduleId]} />
            </li>
          ))}
        </ul>

        {!loading && faqs.length > 0 && (
          <p className="hint">{faqs.length} FAQ{faqs.length === 1 ? '' : 's'} · Our AI checks student questions against these</p>
        )}
      </div>

      {/* Add / edit sheet */}
      <Dialog open={!!editing} onClose={closeForm} eyebrow={editing?.id ? 'tweak the answer' : 'one less meeting'}
        title={editing?.id ? 'Edit FAQ' : 'New FAQ'}>
        <form className="form" onSubmit={save} noValidate>
          <div className="field">
            <label className="label" htmlFor="faq-module">Module</label>
            <select id="faq-module" className="select" value={form.moduleId} onChange={set('moduleId')}>
              <option value="">General (all my modules)</option>
              {user.modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <CountedField id="faq-question" label="Question" value={form.question} onChange={set('question')}
            error={errors.question} max={LIMITS.question[1]} autoFocus />
          <CountedField id="faq-answer" label="Answer" value={form.answer} onChange={set('answer')}
            error={errors.answer} max={LIMITS.answer[1]} multiline />
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing?.id ? 'Save changes' : 'Add FAQ'}</button>
          </div>
        </form>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!toDelete} onClose={() => !saving && setToDelete(null)} eyebrow="careful" title="Delete this FAQ?" size="sm">
        <blockquote className="quote">{toDelete?.question}</blockquote>
        <p className="muted">Our AI will stop using it when checking student questions. This cannot be undone.</p>
        <div className="sheet-actions">
          <button type="button" className="btn" onClick={() => setToDelete(null)} disabled={saving} data-autofocus>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirmDelete} disabled={saving}>
            <Trash2 size={18} aria-hidden="true" /> {saving ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Dialog>
    </>
  );
}
