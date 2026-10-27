# SkillBridge AI — Personalized Learning Roadmap & Dependency Graph Generator

SkillBridge AI is a form-driven AI curriculum planning system that transforms a learner's name, career or project goal, current skills and proficiency levels, and available study schedule into an interactive dependency mind map, a goal-aware prerequisite sequence, and a personalized calendar study schedule.

---

## Key Capabilities

1. **Dual Open-Source AI Architecture (Zero API Keys Required)**
   - **Built-in Open-Source Knowledge-Graph AI Synthesizer (Works Out-of-the-Box):** Runs 100% locally in Python with zero external API keys and unlimited usage. Synthesizes personalized skill rationales tailored to the learner's reported skill proficiencies, discovers relevant skills for custom/hybrid goals, and computes the authoritative topological sequence.
   - **Live Local Ollama LLM Integration (`http://localhost:11434`):** Automatically detects and connects to your local Ollama server when running, auto-resolves any installed open-source generative model (`llama3.2`, `llama3.1`, `qwen2.5`, `mistral`, `gemma2`, `deepseek-r1`, `phi3`), enforces structured JSON Schema output, and runs a 1-step structured repair loop if the model returns malformed JSON.

2. **Goal-Aware Prerequisite Graph & Multi-Factor Learning Order (`backend/planner.py`)**
   - Separates `strict_prerequisite` (hard dependencies that block readiness) from `recommended_foundation` (helpful context that influences sequence priority without blocking readiness), `preferred_learning_sequence`, and `parallel_allowed`.
   - Distinguishes practical project goals (e.g., *Build and deploy an AI application using an LLM*) from broad career roles (e.g., *Become an AI Engineer*) so learners are never forced through unnecessary theoretical chains when using pretrained models.
   - Computes clear **START HERE (Step 1)**, **NEXT TO LEARN (Step 2)**, **UPCOMING (Steps 3–5)**, and **Parallel Study** options that update dynamically as skills are completed.

3. **Orthogonal Knowledge, Readiness, and Completion Statuses**
   - Tracks `knowledge_status` (`already_known`, `needs_review`, `unverified`, `not_yet_learned`), `readiness_status` (`available_now`, `waiting_for_prerequisites`, `completed`), and `completion_status` (`completed`, `in_progress`, `incomplete`).
   - Preserves reported partial experience on advanced skills while making unmet foundational prerequisites visible.

4. **Interactive Mind-Map Graph, Saved Learning Sessions & Calendar Scheduler**
   - Renders solid directional arrows (`───▶`) for strict prerequisites and dashed arrows (`- - ▶`) for recommended foundations using `@xyflow/react`.
   - Persists all generated roadmaps and skill completion logs in SQLite (`backend/database.py`), with a full **Saved Plans & Active Sessions** workspace.

---

## Quick Start (Cloning from GitHub — Linux, macOS, or Windows)

### Prerequisites
- **Node.js 18+** and `npm`
- **Python 3.10+** (uses Python's built-in standard library `sqlite3`, `json`, `urllib.request`, `unittest` out-of-the-box; no external pip install is required to run, though `flask` and `pydantic` are supported via `backend/requirements.txt`)
- *(Optional)* **Ollama** (`https://ollama.com`) if you want live local LLM inference in addition to the built-in Knowledge-Graph AI Synthesizer.

### 1. Install Frontend Dependencies & Start the Full-Stack Server
```bash
npm install
npm run dev
```
Then open **`http://localhost:3000`** in your browser.
*(The Express + Vite server automatically detects `python3` or `python` on Linux, macOS, and Windows and bridges `/api/*` requests to `backend/app.py`.)*

### 2. (Optional) Connect a Local Ollama Model
If you have Ollama installed locally:
```bash
ollama serve
ollama pull llama3.2:latest
```
Click **Check Ollama** on the Planner Form (or refresh the page). SkillBridge AI will automatically detect your installed Ollama models and allow you to select any installed model from the dropdown.

### 3. Run Automated Backend Unit & Integration Tests
```bash
npm run test:backend
# or directly:
python3 -m unittest discover -s backend/tests -v
```

### 4. Type-Check & Build for Production
```bash
npm run lint
npm run build
npm run start
```
