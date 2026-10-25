import { useCallback, useEffect, useState } from 'react';
import { BookOpen, Save, Archive } from 'lucide-react';
import { getFirebaseClients } from '../firebase/config';

const EMPTY_ARTICLE = { articleId: '', title: '', category: '', content: '', keywords: '', published: false };

export default function SupportKnowledgePage() {
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState(EMPTY_ARTICLE);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const clients = await getFirebaseClients();
    const result = await clients.httpsCallable(clients.functions, 'listWhatsAppSupportArticles')({});
    setArticles(Array.isArray(result.data?.articles) ? result.data.articles : []);
  }, []);

  useEffect(() => { load().catch((error) => setNotice(error?.message || 'Unable to load support articles.')); }, [load]);

  function selectArticle(article) {
    setForm({
      articleId: article.id, title: article.title || '', category: article.category || '',
      content: article.content || '', keywords: (article.keywords || []).join(', '), published: article.published === true,
    });
  }

  async function save(event) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      const articleId = form.articleId || `article_${(globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/-/g, '')}`;
      setForm((current) => ({ ...current, articleId }));
      const clients = await getFirebaseClients();
      const result = await clients.httpsCallable(clients.functions, 'saveWhatsAppSupportArticle')({
        articleId, title: form.title, category: form.category, content: form.content,
        keywords: form.keywords.split(',').map((item) => item.trim()).filter(Boolean), published: form.published,
      });
      await load();
      setForm({ ...form, articleId: result.data?.articleId || form.articleId });
      setNotice(form.published ? 'Article saved and published for the assistant.' : 'Draft saved. It is not available to the assistant.');
    } catch (error) { setNotice(error?.message || 'Unable to save this article.'); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!form.articleId) return;
    setBusy(true); setNotice('');
    try {
      const clients = await getFirebaseClients();
      await clients.httpsCallable(clients.functions, 'archiveWhatsAppSupportArticle')({ articleId: form.articleId });
      await load(); setForm(EMPTY_ARTICLE); setNotice('Article archived and removed from AI answers.');
    } catch (error) { setNotice(error?.message || 'Unable to archive this article.'); }
    finally { setBusy(false); }
  }

  return <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow">
      <div className="mb-5 flex items-center gap-3"><span className="rounded-2xl bg-brand/20 p-3 text-brand-soft"><BookOpen className="h-5 w-5" /></span><div><h1 className="font-bold">Support knowledge</h1><p className="text-xs text-ink-300">Approved answers used by WhatsApp AI</p></div></div>
      <button type="button" onClick={() => setForm(EMPTY_ARTICLE)} className="mb-3 w-full rounded-xl border border-white/15 px-4 py-3 text-sm font-bold">New article</button>
      <div className="space-y-2">{articles.map((article) => <button key={article.id} type="button" onClick={() => selectArticle(article)} className="w-full rounded-2xl border border-white/10 bg-black/10 p-4 text-left"><span className="block text-sm font-bold">{article.title}</span><span className="mt-1 block text-xs text-ink-300">{article.category} · {article.published ? 'Published' : 'Draft'}</span></button>)}{!articles.length ? <p className="text-sm text-ink-300">No articles yet.</p> : null}</div>
    </div>
    <form onSubmit={save} className="space-y-4 rounded-[28px] border border-white/10 bg-white/5 p-5 shadow-glow">
      <div><h2 className="text-lg font-bold">{form.articleId ? 'Edit approved guidance' : 'Create guidance'}</h2><p className="mt-1 text-sm text-ink-300">Publish only verified Uncedo information. Do not include customer data, payment secrets or unsupported policy claims.</p></div>
      <label className="block text-sm text-ink-200">Article ID<input value={form.articleId} onChange={(event) => setForm({ ...form, articleId: event.target.value })} placeholder="Generated if left blank" maxLength={80} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-white" /></label>
      <div className="grid gap-3 md:grid-cols-2"><label className="text-sm text-ink-200">Title<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} maxLength={180} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-white" /></label><label className="text-sm text-ink-200">Category<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} maxLength={80} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-white" /></label></div>
      <label className="block text-sm text-ink-200">Answer / instructions<textarea required value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} maxLength={6000} rows={8} className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-white" /></label>
      <label className="block text-sm text-ink-200">Search keywords<input value={form.keywords} onChange={(event) => setForm({ ...form, keywords: event.target.value })} placeholder="Separate keywords with commas" className="mt-1 w-full rounded-xl border border-white/10 bg-ink-900 px-3 py-2 text-white" /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={(event) => setForm({ ...form, published: event.target.checked })} />Publish for assistant answers</label>
      <div className="flex flex-wrap gap-2"><button disabled={busy} className="rounded-xl bg-brand px-4 py-3 font-bold text-white disabled:opacity-50"><Save className="mr-2 inline h-4 w-4" />Save article</button>{form.articleId ? <button type="button" disabled={busy} onClick={archive} className="rounded-xl border border-rose-300/30 px-4 py-3 font-bold text-rose-200 disabled:opacity-50"><Archive className="mr-2 inline h-4 w-4" />Archive</button> : null}</div>
      {notice ? <p role="status" className="text-sm text-brand-soft">{notice}</p> : null}
    </form>
  </section>;
}
