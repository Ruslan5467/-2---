import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { topics } from './src/data/topics.ts';
import fs from 'fs';

// Initialize Gemini Client
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Cache for generated articles
const CACHE_FILE = path.join(process.cwd(), 'article-cache.json');
let articleCache: Record<number, string> = {};
if (fs.existsSync(CACHE_FILE)) {
  try {
    articleCache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch (e) {
    console.error("Failed to parse article cache");
  }
}

function saveCache() {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(articleCache, null, 2));
}

// Read from doctopics folder
function getTopicContent(id: number): string | null {
  const filePath = path.join(process.cwd(), 'src/data/doctopics', `${id}.md`);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }
  return articleCache[id] || null;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API endpoints
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/topics', (req, res) => {
    res.json(topics.map(t => ({ id: t.id, title: t.title, hasExpanded: !!getTopicContent(t.id) })));
  });

  app.get('/api/topics/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const topic = topics.find(t => t.id === id);
    if (!topic) return res.status(404).json({ error: 'Topic not found' });
    
    res.json({
      ...topic,
      content: getTopicContent(id)
    });
  });

  // Use ThinkingLevel.HIGH (gemini-3.1-pro-preview) to generate expanded article
  app.post('/api/gemini/expand', async (req, res) => {
    try {
      const { id } = req.body;
      const topic = topics.find(t => t.id === id);
      if (!topic) return res.status(404).json({ error: 'Topic not found' });

      const prompt = `Ты - опытный преподаватель по программированию (C++).
Студенту нужно подготовиться к экзамену. Пожалуйста, напиши исчерпывающую, подробную статью (большую) по пункту плана: "${topic.title}".
Статья должна содержать:
1. Теоретическую базу и основные понятия.
2. Подробное объяснение.
3. Примеры кода на C++ (где применимо), включая протоколы прохождения/тестирования (если упомянуто в названии темы).
4. Оценки сложности и характеристики (если применимо, для структур/контейнеров).
Пиши строго по теме. Форматируй свой ответ корректным Markdown.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        }
      });

      const expandedText = response.text || '';
      articleCache[id] = expandedText;
      saveCache();

      res.json({ content: expandedText });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Use Search Grounding (gemini-3.5-flash) to find answers
  app.post('/api/gemini/search', async (req, res) => {
    try {
      const { query } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Ответь на вопрос по программированию на C++: ${query}`,
        config: {
          tools: [{ googleSearch: {} }],
        }
      });
      res.json({ text: response.text });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
