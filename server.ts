import express from 'express';
import { createServer as createViteServer } from 'vite';
import { spawn, spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Resolves the available Python 3 interpreter across Linux, macOS, and Windows
 * so users who clone the repository from GitHub can run `npm run dev` on any OS.
 */
function resolvePythonExecutable(): string {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }
  for (const candidate of ['python3', 'python']) {
    try {
      const check = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
      if (check.status === 0) {
        return candidate;
      }
    } catch {
      // Try next candidate
    }
  }
  return 'python3';
}

const PYTHON_EXECUTABLE = resolvePythonExecutable();

/**
 * Executes an action against the Python backend (`backend/app.py --cli <action>`),
 * which runs the Python planning engine, Ollama bridge, and SQLite persistence layer.
 */
function invokePythonBackend(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<{ statusCode: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const pyScript = path.resolve(__dirname, 'backend', 'app.py');
    const proc = spawn(PYTHON_EXECUTABLE, [pyScript, '--cli', action], {
      cwd: __dirname,
      env: { ...process.env },
    });

    let stdoutData = '';
    let stderrData = '';

    proc.stdout.on('data', (chunk) => {
      stdoutData += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    proc.on('error', (err) => {
      reject(err);
    });

    proc.on('close', (code) => {
      if (code !== 0 && !stdoutData.trim()) {
        reject(new Error(stderrData || `Python backend exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        resolve({
          statusCode: parsed.status_code || 200,
          body: parsed.body,
        });
      } catch {
        reject(new Error(`Failed to parse Python backend response: ${stdoutData}`));
      }
    });

    proc.stdin.write(JSON.stringify(payload));
    proc.stdin.end();
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      const result = await invokePythonBackend('health', {});
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/knowledge-base', async (_req, res) => {
    try {
      const result = await invokePythonBackend('knowledge_base', {});
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/roadmaps/generate', async (req, res) => {
    try {
      const result = await invokePythonBackend('generate_roadmap', req.body || {});
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/roadmaps', async (_req, res) => {
    try {
      const result = await invokePythonBackend('list_roadmaps', {});
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/roadmaps/:roadmapId', async (req, res) => {
    try {
      const result = await invokePythonBackend('get_roadmap', {
        roadmap_id: req.params.roadmapId,
      });
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.delete('/api/roadmaps/:roadmapId', async (req, res) => {
    try {
      const result = await invokePythonBackend('delete_roadmap', {
        roadmap_id: req.params.roadmapId,
      });
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch('/api/roadmaps/:roadmapId/progress', async (req, res) => {
    try {
      const result = await invokePythonBackend('update_progress', {
        ...(req.body || {}),
        roadmap_id: req.params.roadmapId,
      });
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.patch('/api/roadmaps/:roadmapId/reschedule', async (req, res) => {
    try {
      const result = await invokePythonBackend('reschedule', {
        ...(req.body || {}),
        roadmap_id: req.params.roadmapId,
      });
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  app.get('/api/evaluation', async (req, res) => {
    try {
      const result = await invokePythonBackend('evaluation', {
        roadmap_id: req.query.roadmap_id || null,
      });
      res.status(result.statusCode).json(result.body);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkillBridge AI server running on http://0.0.0.0:${PORT} (Python: ${PYTHON_EXECUTABLE})`);
  });
}

startServer();
