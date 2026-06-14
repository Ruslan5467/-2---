import React, { useState, useEffect, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Bot, Search, FileText, Send, Sparkles, Loader2, BookOpen } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import { googleSignIn, initAuth, logout } from './lib/firebase';
import { User } from 'firebase/auth';
import { createGoogleDocWithContent } from './lib/docs';

// --- Utility ---
export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Topic {
  id: number;
  title: string;
  hasExpanded: boolean;
  content?: string | null;
}

// --- App ---
export default function App() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  
  const [loadingContent, setLoadingContent] = useState(false);
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const [exportingDoc, setExportingDoc] = useState(false);

  // AI Assistant State
  const [searchQuery, setSearchQuery] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [askingAI, setAskingAI] = useState(false);

  // Auth State
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    initAuth(
      (u, t) => {
        setUser(u);
        setToken(t);
      },
      () => {
        setUser(null);
        setToken(null);
      }
    );
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    fetch('/api/topics')
      .then(r => r.json())
      .then(data => {
        setTopics(data);
        if (data.length > 0) handleSelectTopic(data[0].id);
      })
      .catch(console.error);
  }, []);

  const handleSelectTopic = async (id: number) => {
    setSelectedTopicId(id);
    setLoadingContent(true);
    try {
      const res = await fetch(`/api/topics/${id}`);
      const data = await res.json();
      setActiveTopic(data);
      // Update the topics list if this one has content
      setTopics(prev => prev.map(t => t.id === id ? { ...t, hasExpanded: !!data.content } : t));
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleGenerateArticle = async () => {
    if (!activeTopic) return;
    setGeneratingArticle(true);
    setAiResponse('');
    try {
      const res = await fetch('/api/gemini/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeTopic.id })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setActiveTopic(prev => prev ? { ...prev, content: data.content } : null);
      setTopics(prev => prev.map(t => t.id === activeTopic.id ? { ...t, hasExpanded: true } : t));
    } catch (err: any) {
      console.error(err);
      alert('Ошибка при генерации статьи: ' + err.message);
    } finally {
      setGeneratingArticle(false);
    }
  };

  const handleExportToGoogleDocs = async () => {
    if (!activeTopic || !activeTopic.content) return;
    if (!user || !token) {
      handleLogin();
      return;
    }

    const confirmed = window.confirm(`Создать новый Google Документ "${activeTopic.title}"?`);
    if (!confirmed) return;

    setExportingDoc(true);
    try {
      const docId = await createGoogleDocWithContent(activeTopic.title, activeTopic.content);
      alert(`Документ успешно создан! Вы можете найти его в вашем Google Drive.`);
      window.open(`https://docs.google.com/document/d/${docId}/edit`, '_blank');
    } catch (err: any) {
      console.error(err);
      alert('Ошибка экспорта: ' + err.message);
    } finally {
      setExportingDoc(false);
    }
  };

  const handleSearchQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setAskingAI(true);
    setAiResponse('');
    try {
      const res = await fetch('/api/gemini/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setAiResponse(data.text);
    } catch (err: any) {
      console.error(err);
      setAiResponse('Ошибка: ' + err.message);
    } finally {
      setAskingAI(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-row bg-slate-50 text-slate-800 font-sans overflow-hidden">
      
      {/* Sidebar */}
      <aside className="w-[300px] bg-white border-r border-slate-200 flex flex-col shrink-0 z-10">
        <div className="p-5 border-b border-slate-200 bg-gradient-to-br from-blue-600 to-blue-700 text-white flex flex-col">
          <h1 className="m-0 text-[18px] font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-white" />
            Подготовка к экзамену
          </h1>
          <p className="m-0 mt-1 text-[12px] opacity-80">
            Программирование (C++/Алгоритмы)
          </p>
        </div>
        
        <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
          {topics.map(topic => (
            <button
              key={topic.id}
              onClick={() => handleSelectTopic(topic.id)}
              className={cn(
                "w-full text-left py-3 px-5 text-[13px] border-b border-slate-50 cursor-pointer flex items-center transition-colors duration-200",
                selectedTopicId === topic.id 
                  ? "bg-blue-50 border-l-[4px] border-l-blue-600 text-blue-600 font-semibold" 
                  : "hover:bg-slate-50 text-slate-800 border-l-[4px] border-l-transparent"
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] mr-3 shrink-0 transition-colors duration-200",
                selectedTopicId === topic.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-800"
              )}>
                {topic.id}
              </div>
              <div className="flex-1 line-clamp-2 leading-relaxed mt-0.5 flex items-center">
                {topic.title}
                {topic.hasExpanded && <span className="ml-2 shrink-0 inline-block w-2 h-2 rounded-full bg-emerald-400" title="Статья сгенерирована"></span>}
              </div>
            </button>
          ))}
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-white">
          {!user ? (
            <button
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 text-slate-700 py-2.5 px-4 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/><path fill="none" d="M1 1h22v22H1z"/></svg>
              )}
              Войти через Google
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span className="truncate">{user.email}</span>
                <button onClick={logout} className="hover:underline">Выйти</button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col bg-slate-50 overflow-hidden relative">
        {loadingContent ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
          </div>
        ) : activeTopic ? (
          <>
            <header className="py-6 px-10 bg-white border-b border-slate-200 flex justify-between items-center">
              <div>
                <div className="text-[12px] text-slate-500 mb-2">Билет №{activeTopic.id} • Алгоритмизация</div>
                <h2 className="text-[24px] text-slate-900 m-0 font-bold">{activeTopic.title}</h2>
              </div>
              <div className="flex gap-3">
                {activeTopic.content && (
                  <button
                    onClick={handleExportToGoogleDocs}
                    disabled={exportingDoc}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium border-none transition-all duration-200 bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50"
                  >
                    {exportingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                    В Избранное (Google Docs)
                  </button>
                )}
              </div>
            </header>

            <div className="p-10 overflow-y-auto flex-1 custom-scrollbar pb-40">
              {!activeTopic.content ? (
                <div className="bg-white p-8 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] max-w-[800px] mx-auto flex flex-col items-center text-center">
                  <div className="bg-slate-50 p-4 rounded-full mb-6">
                    <Sparkles className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-[18px] font-semibold mb-2 text-slate-700">Материал не сгенерирован</h3>
                  <p className="text-[15px] leading-[1.6] text-slate-600 mb-8 max-w-md">
                    Подробная статья к этому вопросу еще не была создана. Сгенерируйте ее с помощью AI для подготовки.
                  </p>
                  <button
                    onClick={handleGenerateArticle}
                    disabled={generatingArticle}
                    className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-medium border-none transition-all duration-200 bg-blue-600 text-white hover:bg-blue-700 cursor-pointer disabled:opacity-50"
                  >
                    {generatingArticle ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                    Сгенерировать статью
                  </button>
                </div>
              ) : (
                <div className="bg-white p-8 rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.1)] max-w-[800px] mx-auto">
                  {generatingArticle ? (
                   <div className="flex items-center justify-center p-20 text-slate-400 gap-3">
                     <Loader2 className="w-6 h-6 animate-spin" /> Обновление статьи...
                   </div>
                  ) : (
                    <div className="prose prose-slate max-w-none text-[15px] leading-[1.6] text-slate-600 
                      prose-headings:border-l-[4px] prose-headings:border-blue-500 prose-headings:pl-3 
                      prose-headings:text-[18px] prose-headings:font-semibold prose-headings:text-slate-700 
                      prose-headings:mt-8 prose-headings:mb-4 prose-p:text-slate-600 prose-p:leading-[1.6]
                      prose-pre:bg-slate-800 prose-pre:text-slate-50 prose-pre:p-5 prose-pre:rounded-lg 
                      prose-pre:font-mono prose-pre:text-[13px] prose-pre:my-4 prose-pre:overflow-x-auto
                      prose-strong:font-semibold prose-strong:text-slate-800
                      prose-a:text-blue-600">
                      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{activeTopic.content}</Markdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            Выберите тему слева для просмотра
          </div>
        )}

        {/* Floating AI Assistant Bar */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-6 pointer-events-none">
          <div className="bg-white/80 backdrop-blur-xl border border-slate-200 shadow-xl rounded-3xl p-4 pointer-events-auto overflow-hidden transition-all duration-300">
            {aiResponse && (
              <div className="mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 max-h-60 overflow-y-auto custom-scrollbar text-sm text-slate-700 relative">
                 <button onClick={() => setAiResponse('')} className="absolute top-2 right-2 text-slate-400 hover:text-slate-600">&times;</button>
                 <div className="prose prose-sm prose-slate max-w-none">
                   <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{aiResponse}</Markdown>
                 </div>
              </div>
            )}
            <form onSubmit={handleSearchQuestion} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Search className="w-5 h-5 text-blue-600" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Задать вопрос по программированию (использует Google Search)..."
                className="flex-1 bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400"
              />
              <button 
                type="submit"
                disabled={askingAI || !searchQuery.trim()}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 transition-colors"
               >
                {askingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 -ml-0.5" />}
              </button>
            </form>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        .char-card { background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
        .char-label { font-size: 11px; text-transform: uppercase; color: #94a3b8; font-weight: 600; margin-bottom: 4px; }
        .char-value { font-size: 14px; color: #1e293b; font-weight: 500; }
        .characteristics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 24px; }
      `}</style>
    </div>
  );
}
