// Faqs: Instructor manages their FAQ list used by the AI check
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2, Users, X } from 'lucide-react';
import { createFaq, deleteFaq, getFaqs, suggestFaqs, updateFaq } from '@/api/requests';
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
// AI drafts mark missing facts like [add the deadline]; these must be filled in before saving
const PLACEHOLDER = /\[add[^\]]*\]/gi;
const placeholdersIn = text => text.match(PLACEHOLDER) || [];

// Draft text with every [add ...] placeholder highlighted
function Highlighted({ text }) {
  return text.split(/(\[add[^\]]*\])/gi).map((part, i) => (i % 2 ? <mark key={i} className="ph">{part}</mark> : part));
}

// Under a field: the placeholders still to fill. Clicking one selects it in the field, ready to type over.
function PlaceholderHint({ fieldId, text, shake }) {
  const found = placeholdersIn(text);
  if (!found.length) return null;
  const select = ph => {
    const el = document.getElementById(fieldId);
    const at = el.value.indexOf(ph);
    el.focus();
    if (at >= 0) el.setSelectionRange(at, at + ph.length);
  };
  return (
    <div key={shake} className={`ph-hint${shake ? ' ph-shake' : ''}`}>
      <span>Still to fill in:</span>
      {found.map((ph, i) => (
        <button key={`${ph}-${i}`} type="button" className="ph-chip" onClick={() => select(ph)}>{ph}</button>
      ))}
    </div>
  );
}

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
  const [ideas, setIdeas] = useState({ open: false, status: 'idle', items: [], analyzed: 0 }); // status: idle | loading | done | error
  const [shake, setShake] = useState(0); // bumps to replay the shake when saving is blocked by placeholders

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
  // Back to the AI ideas after reviewing one of them (if any are left)
  const backToIdeas = () => setIdeas(st => (st.items.length ? { ...st, open: true } : st));
  const closeForm = () => {
    if (saving) return;
    const fromIdea = editing?.idea;
    setEditing(null);
    if (fromIdea) backToIdeas();
  };

  // ----- AI: FAQ ideas from the questions students actually sent -----
  const loadIdeas = async () => {
    setIdeas({ open: true, status: 'loading', items: [], analyzed: 0 });
    try {
      const [res] = await Promise.all([suggestFaqs(), new Promise(r => setTimeout(r, 900))]);
      const items = res.data.map((idea, i) => ({ ...idea, key: `${Date.now()}-${i}` }));
      setIdeas({ open: true, status: 'done', items, found: items.length, analyzed: res.meta.analyzed });
    } catch {
      setIdeas({ open: true, status: 'error', items: [], analyzed: 0 });
    }
  };
  const dismissIdea = key => setIdeas(st => ({ ...st, items: st.items.filter(idea => idea.key !== key) }));
  const reviewIdea = idea => {
    setIdeas(st => ({ ...st, open: false }));
    setEditing({ idea: idea.key });
    setForm({ moduleId: idea.moduleId ?? '', question: idea.question, answer: idea.answer });
    setErrors({});
  };

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
      else if (placeholdersIn(form[field]).length) found[field] = 'Replace the highlighted [add ...] parts first';
    });
    setErrors(found);
    if (Object.values(found).some(msg => msg.startsWith('Replace'))) setShake(n => n + 1);
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
      if (editing.idea) {
        // The idea became a real FAQ: drop it from the list and go back to the rest
        setIdeas(st => ({ ...st, items: st.items.filter(idea => idea.key !== editing.idea), open: st.items.length > 1 }));
      }
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
          <div className="faq-head-buttons">
            <button type="button" className="btn ai-btn" onClick={loadIdeas}>
              <Sparkles size={18} aria-hidden="true" /> Suggest from requests
            </button>
            <button type="button" className="btn btn-primary" onClick={() => openForm(null)}>
              <Plus size={18} aria-hidden="true" /> Add FAQ
            </button>
          </div>
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
      <Dialog open={!!editing} onClose={closeForm}
        eyebrow={editing?.id ? 'tweak the answer' : editing?.idea ? 'review the AI draft' : 'one less meeting'}
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
          <PlaceholderHint fieldId="faq-question" text={form.question} shake={shake} />
          <CountedField id="faq-answer" label="Answer" value={form.answer} onChange={set('answer')}
            error={errors.answer} max={LIMITS.answer[1]} multiline />
          <PlaceholderHint fieldId="faq-answer" text={form.answer} shake={shake} />
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={closeForm} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editing?.id ? 'Save changes' : 'Add FAQ'}</button>
          </div>
        </form>
      </Dialog>

      {/* AI: FAQ ideas from recent student questions */}
      <Dialog open={ideas.open} onClose={() => setIdeas(st => ({ ...st, open: false }))} eyebrow="spotted in your requests" title="FAQ ideas" size="lg">
        {ideas.status === 'loading' && (
          <div className="ideas-loading" role="status">
            <ThinkingStudent size={110} />
            <p className="hand">Reading what your students asked lately...</p>
            <div className="ideas-skeleton" aria-hidden="true"><span /><span /><span /></div>
          </div>
        )}

        {ideas.status === 'error' && (
          <>
            <Alert type="info">The AI assistant is not available right now. Please try again in a moment.</Alert>
            <div className="sheet-actions">
              <button type="button" className="btn btn-primary" onClick={loadIdeas}><RefreshCw size={18} aria-hidden="true" /> Try again</button>
            </div>
          </>
        )}

        {ideas.status === 'done' && ideas.items.length === 0 && (
          <div className="ideas-empty">
            <CheckCheck size={36} aria-hidden="true" />
            <span className="hand">{ideas.found ? 'All ideas handled' : ideas.analyzed < 2 ? 'Not enough questions yet' : 'Nothing missing'}</span>
            <p className="muted">
              {ideas.found ? 'Run it again after more requests come in.'
                : ideas.analyzed < 2 ? 'Ideas appear once students have sent you at least 2 requests.'
                  : `Your FAQ already covers what students asked in their last ${ideas.analyzed} requests.`}
            </p>
          </div>
        )}

        {ideas.status === 'done' && ideas.items.length > 0 && (
          <>
            <p className="muted ideas-intro">
              Topics from your last {ideas.analyzed} requests that your FAQ does not cover yet. Review each draft and fill in the
              <mark className="ph">[add ...]</mark> parts before adding it.
            </p>
            <ul className="ideas-list">
              {ideas.items.map((idea, i) => (
                <li key={idea.key} className="idea-card" style={{ '--i': i }}>
                  <div className="idea-meta">
                    <span className="idea-count">
                      <Users size={14} aria-hidden="true" /> Asked by {idea.studentCount} student{idea.studentCount === 1 ? '' : 's'}
                    </span>
                    <ModuleLabel module={moduleOf(idea.moduleId)} tone={toneOf[idea.moduleId]} />
                  </div>
                  <p className="faq-q" dir="auto"><span className="hand">Q.</span> {idea.question}</p>
                  <p className="faq-a" dir="auto"><span className="hand">A.</span> <Highlighted text={idea.answer} /></p>
                  {idea.exampleTitles.length > 0 && (
                    <p className="idea-from">
                      From requests like {idea.exampleTitles.map((t, j) => <q key={j} dir="auto">{t}</q>)}
                    </p>
                  )}
                  <div className="idea-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => dismissIdea(idea.key)}>
                      <X size={18} aria-hidden="true" /> Dismiss
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => reviewIdea(idea)}>
                      <Plus size={18} aria-hidden="true" /> Review and add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
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
