import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownToLine, ArrowUp, BookOpen, Check, ChevronDown, FileText, LoaderCircle, MessageSquare, Mic, MicOff, Plus, Radio, Search, ShieldCheck, Sparkles, Upload, X } from 'lucide-react';
import './style.css';

const api = async (url, options) => {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail;
    const message = Array.isArray(detail)
      ? detail.map(item => item.msg || JSON.stringify(item)).join('; ')
      : typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : 'Something went wrong.';
    throw new Error(message);
  }
  return payload;
};

function App() {
  const [docs, setDocs] = useState([]), [selected, setSelected] = useState(null), [detail, setDetail] = useState(null);
  const [messages, setMessages] = useState([]), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false), [error, setError] = useState(''), [health, setHealth] = useState(null);
  const [recording, setRecording] = useState(false), [transcribing, setTranscribing] = useState(false);
  const [page, setPage] = useState(1), [query, setQuery] = useState('');
  const inputRef = useRef(null), endRef = useRef(null), recorderRef = useRef(null), streamRef = useRef(null);
  const refresh = async () => { const result = await api('/api/documents'); setDocs(result.documents); };
  useEffect(() => { refresh().catch(e => setError(e.message)); api('/api/health').then(setHealth).catch(() => setHealth({ollama_available:false})); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}); }, [messages, busy]);
  useEffect(() => () => { streamRef.current?.getTracks().forEach(track => track.stop()); }, []);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    let alive = true;
    const load = async () => { try { const d = await api(`/api/documents/${selected}`); if (!alive) return; setDetail(d); if (d.status === 'processing') setTimeout(load, 1500); } catch(e) { if(alive) setError(e.message); } };
    load(); return () => { alive = false; };
  }, [selected, docs]);
  const choose = (doc) => { setSelected(doc.document_id); setMessages([]); setPage(1); setError(''); };
  const upload = async (file) => {
    if (!file) return; setError(''); setUploading(true);
    try { const fd = new FormData(); fd.append('file', file); const d = await api('/api/documents', {method:'POST', body:fd}); await refresh(); choose(d); }
    catch(e) { setError(e.message); } finally { setUploading(false); if(inputRef.current) inputRef.current.value=''; }
  };
  const ask = async (text = question) => {
    if (!text.trim() || !selected || busy) return;
    const next = [...messages, {role:'user', content:text.trim()}]; setMessages(next); setQuestion(''); setBusy(true); setError('');
    try { const result = await api(`/api/documents/${selected}/chat`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({question:text.trim(), history:messages.slice(-6).map(({role,content})=>({role,content}))})}); setMessages([...next, {role:'assistant', content:result.answer, sources:result.sources}]); }
    catch(e) { setMessages(next); setError(e.message); } finally { setBusy(false); }
  };
  const recordQuestion = async () => {
    if (recording) { recorderRef.current?.stop(); return; }
    if (!health?.speech_available) { setError('Voice input needs a configured Groq API key in the backend .env file.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError('This browser does not support microphone recording. Try a current version of Chrome, Edge, or Firefox.'); return; }
    try {
      setError('');
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      streamRef.current = stream;
      const preferred = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = preferred ? new MediaRecorder(stream, {mimeType:preferred}) : new MediaRecorder(stream);
      const chunks = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setError('Microphone recording failed. Check microphone permission and try again.');
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop()); streamRef.current = null; setRecording(false); setTranscribing(true);
        try {
          const type = recorder.mimeType || 'audio/webm';
          const ext = type.includes('mp4') ? 'mp4' : type.includes('ogg') ? 'ogg' : 'webm';
          const form = new FormData(); form.append('file', new Blob(chunks, {type}), `recording.${ext}`);
          const result = await api('/api/speech/transcribe', {method:'POST', body:form});
          setQuestion(current => current.trim() ? `${current.trim()} ${result.text}` : result.text);
        } catch(e) { setError(e.message); }
        finally { setTranscribing(false); }
      };
      recorder.start(); setRecording(true);
    } catch(e) {
      streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null;
      setError(e.name === 'NotAllowedError' ? 'Microphone permission was denied. Allow microphone access in your browser settings.' : `Could not start microphone: ${e.message}`);
    }
  };
  const remove = async (id, event) => { event.stopPropagation(); try { await api(`/api/documents/${id}`, {method:'DELETE'}); if(selected===id) {setSelected(null);setMessages([])} await refresh(); } catch(e){setError(e.message)} };
  const shownDocs = docs.filter(d => `${d.title} ${d.filename}`.toLowerCase().includes(query.toLowerCase()));
  const askSuggestions = ['What are the main applications?', 'Summarize the key capabilities', 'What limitations are mentioned?'];
  const providerLabel = health?.groq_configured ? (health?.gemini_configured?'GROQ · GEMINI FALLBACK':'GROQ API') : health?.gemini_configured?'GEMINI API':'LOCAL OLLAMA';

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><div className="brand-mark"><Radio size={18}/></div><span>ASTRA <b>INTEL</b></span><i>DOCUMENT INTELLIGENCE</i></div><div className="top-right"><div className={`system-status ${health?.chat_available?'':'offline'}`}><span className="dot"/>{health?.chat_available?'CHAT PROVIDER CONFIGURED':'CHAT PROVIDER OFFLINE'}</div><div className="avatar">AI</div></div></header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="side-head"><div><span className="eyebrow">WORKSPACE</span><h2>Library <span>{docs.length.toString().padStart(2,'0')}</span></h2></div><button className="icon-button" title="Upload document" onClick={()=>inputRef.current?.click()}><Plus size={18}/></button><input ref={inputRef} hidden type="file" accept="application/pdf,.pdf" onChange={e=>upload(e.target.files?.[0])}/></div>
        <label className="searchbox"><Search size={15}/><input placeholder="Search documents" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>⌘ K</kbd></label>
        <div className="collection-label">YOUR DOCUMENTS <ChevronDown size={13}/></div>
        <div className="doc-list">{shownDocs.map(doc=><button key={doc.document_id} className={`doc-row ${selected===doc.document_id?'active':''}`} onClick={()=>choose(doc)}><span className="pdf-icon"><FileText size={17}/></span><span className="doc-copy"><strong>{doc.title}</strong><small>{doc.filename} · {doc.page_count} pages</small></span><span className={`state ${doc.status}`}>{doc.status==='ready'?<Check size={12}/>:doc.status==='error'?<X size={12}/>:<span className="mini-dot"/>}</span><span className="delete-doc" onClick={e=>remove(doc.document_id,e)}><X size={14}/></span></button>)}
          {!shownDocs.length && <div className="empty-library"><BookOpen size={22}/><span>{query?'No matching documents':'Your library is empty'}</span></div>}
        </div>
        <div className="side-spacer"/>
        <div className="upload-card"><div className="upload-glyph"><Upload size={17}/></div><strong>Add a document</strong><p>Drop a PDF into your workspace to begin analysis.</p><button onClick={()=>inputRef.current?.click()} disabled={uploading}>{uploading?'Processing…':'Upload PDF'} <ArrowUp size={14}/></button></div>
        <div className="sidebar-foot"><ShieldCheck size={14}/> Private local analysis <span>v1.0</span></div>
      </aside>
      <main className="main-area">
        <div className="page-heading"><div><div className="breadcrumbs">INTELLIGENCE <span>/</span> DOCUMENT ANALYSIS</div><h1>{detail?.title || 'Document Intelligence'}</h1><p>{detail ? `${detail.filename}  ·  ${detail.page_count} pages` : 'Grounded answers from your technical library.'}</p></div><div className="heading-actions">{detail&&<><span className={`ready-pill ${detail.status}`}><span className="dot"/>{detail.status==='processing'?'PROCESSING':detail.status==='error'?'ERROR':'READY'}</span><button className="secondary-button" onClick={()=>window.open(`/api/documents/${selected}/file`,'_blank')}><ArrowDownToLine size={15}/> Source PDF</button></>}</div></div>
        {error&&<div className="error-banner"><span>{error}</span><button onClick={()=>setError('')}><X size={15}/></button></div>}
        {!detail ? <section className="welcome"><div className="welcome-top"><div className="orb"><Activity size={28}/></div><span className="eyebrow">ASTRA INTEL · CHALLENGE 01</span><h2>Every document.<br/><em>Within reach.</em></h2><p>Upload a defence or technology report. Ask precise questions and trace every answer back to its page.</p><button className="primary-button" onClick={()=>inputRef.current?.click()} disabled={uploading}><Upload size={16}/>{uploading?'Processing document':'Upload a PDF'}<span>↗</span></button></div><div className="welcome-stats"><div><strong>01</strong><span>UPLOAD A REPORT</span></div><div><strong>02</strong><span>ASK IN PLAIN LANGUAGE</span></div><div><strong>03</strong><span>VERIFY PAGE SOURCES</span></div></div></section>
        : <div className="analysis-grid">
          <section className="chat-panel"><div className="panel-heading"><div><span className="eyebrow">DOCUMENT ASSISTANT</span><h3><Sparkles size={16}/> Ask this document</h3></div><span className="model-tag"><span className="dot"/> {providerLabel}</span></div>
            <div className="conversation">{!messages.length&&<div className="intro-message"><div className="assistant-stamp"><Sparkles size={16}/></div><div><strong>Analysis ready</strong><p>{detail.status==='processing'?'Your document is being prepared…':'I can answer questions using this document and cite the pages behind each answer.'}</p></div></div>}
              {messages.map((m,i)=><div className={`message ${m.role}`} key={i}>{m.role==='assistant'&&<div className="assistant-stamp"><Sparkles size={15}/></div>}<div className="message-body"><p>{m.content}</p>{m.sources?.length>0&&<div className="sources"><span>REFERENCES</span>{m.sources.map((s,j)=><button key={j} onClick={()=>setPage(s.page)}><FileText size={12}/>{s.section} <b>p. {s.page}</b></button>)}</div>}</div></div>)}
              {busy&&<div className="message assistant"><div className="assistant-stamp"><Sparkles size={15}/></div><div className="thinking"><i/><i/><i/><span>Reading document context…</span></div></div>}<div ref={endRef}/>
            </div>
            {!messages.length&&<div className="suggestions">{askSuggestions.map(s=><button key={s} onClick={()=>ask(s)} disabled={detail.status!=='ready'}>{s}<ArrowUp size={12}/></button>)}</div>}
            <form className="composer" onSubmit={e=>{e.preventDefault();ask()}}><textarea rows="1" placeholder={selected&&detail.status==='ready'?'Ask a question about this document…':'Document is processing…'} value={question} onChange={e=>setQuestion(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask()}}} disabled={detail.status!=='ready'}/><div className="composer-foot"><span><ShieldCheck size={13}/> Answers grounded in source text</span><div className="composer-actions"><button type="button" className={`voice-button ${recording?'recording':''}`} onClick={recordQuestion} disabled={detail.status!=='ready'||transcribing||busy} aria-label={recording?'Stop recording':'Record a question'} title={recording?'Stop recording':'Record a question'}>{transcribing?<LoaderCircle size={15} className="spin"/>:recording?<MicOff size={15}/>:<Mic size={15}/>}</button><button type="submit" disabled={!question.trim()||busy||detail.status!=='ready'} aria-label="Send question"><ArrowUp size={17}/></button></div></div></form>
          </section>
          <aside className="context-column"><div className="summary-card"><div className="card-title"><div className="card-icon"><BookOpen size={16}/></div><div><span className="eyebrow">DOCUMENT BRIEF</span><h3>Executive summary</h3></div></div><p>{detail.status==='processing'?'Generating a concise summary from the document…':detail.summary}</p><div className="summary-meta"><span><FileText size={13}/> {detail.page_count} pages</span><span><MessageSquare size={13}/> {detail.status==='ready'?'Ready to query':'Preparing'}</span></div></div>
            <div className="viewer-card"><div className="viewer-title"><div><span className="eyebrow">SOURCE VIEWER</span><h3>Document pages</h3></div><div className="page-controls"><button onClick={()=>setPage(Math.max(1,page-1))}>‹</button><span>{page} <i>/ {detail.page_count}</i></span><button onClick={()=>setPage(Math.min(detail.page_count,page+1))}>›</button></div></div><iframe key={`${selected}-${page}`} title="PDF source" src={`/api/documents/${selected}/file#page=${page}&toolbar=0&navpanes=0`} /><div className="viewer-foot"><span><span className="dot"/> PAGE {page} OF {detail.page_count}</span><button onClick={()=>window.open(`/api/documents/${selected}/file#page=${page}`,'_blank')}>OPEN FULL VIEW ↗</button></div></div>
            {detail.status==='error'&&<div className="error-card">{detail.error}</div>}
            <div className="privacy-note"><ShieldCheck size={15}/><p><strong>Source-grounded analysis</strong><br/>Answers use retrieved passages from this PDF. Select a page citation to inspect its source.</p></div>
          </aside>
        </div>}
        <footer className="main-footer"><span>ASTRA INTEL <i>·</i> DOCUMENT INTELLIGENCE SYSTEM</span><span>LOCAL-FIRST ANALYSIS <Radio size={12}/></span></footer>
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
