import React, { useState, useMemo } from 'react';
import {
  Plus,
  X,
  Search,
  Clock,
  Calendar,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  FlaskConical,
} from 'lucide-react';
import type {
  CurrentSkillEntry,
  KnowledgeBaseCatalog,
  LearnerPreferences,
  ProficiencyLevel,
  StudyTimeSettings,
} from '../types/roadmap';

interface LearnerFormProps {
  catalog: KnowledgeBaseCatalog | null;
  isGenerating: boolean;
  ollamaAvailable: boolean;
  ollamaModel: string;
  ollamaBaseUrl: string;
  installedModels?: string[];
  onRefreshOllama?: () => void;
  errorState: {
    message: string;
    canUseFallback?: boolean;
    validationErrors?: string[];
  } | null;
  initialValues?: {
    learnerName: string;
    targetGoal: string;
    currentSkills: CurrentSkillEntry[];
    studyTime: StudyTimeSettings;
    preferences: LearnerPreferences;
  };
  onSubmit: (payload: {
    learner_name: string;
    target_goal: string;
    current_skills: CurrentSkillEntry[];
    study_time: StudyTimeSettings;
    preferences: LearnerPreferences;
    allow_safe_fallback: boolean;
    preferred_ollama_model?: string;
  }) => void;
}

const PROFICIENCY_OPTIONS: Array<{ value: ProficiencyLevel; label: string; description: string }> = [
  { value: 'none', label: 'No experience', description: 'New to this topic' },
  { value: 'beginner', label: 'Beginner', description: 'Introductory exposure' },
  { value: 'basic', label: 'Basic understanding', description: 'Understand core concepts' },
  { value: 'intermediate', label: 'Intermediate', description: 'Have built small projects' },
  { value: 'confident', label: 'Confident / Independent', description: 'Can apply independently in production' },
  { value: 'unknown', label: 'Not sure / Unverified', description: 'Include a diagnostic check' },
];

const ALL_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const GOAL_SUGGESTIONS = [
  { title: 'Become an AI Engineer', type: 'Career Role' },
  { title: 'Become a Machine Learning Engineer', type: 'Career Role' },
  { title: 'Become a Full-Stack Developer', type: 'Career Role' },
  { title: 'Become a Data Scientist', type: 'Career Role' },
  { title: 'Learn web development from the beginning', type: 'Technical Objective' },
  { title: 'Build and deploy an AI application using an LLM', type: 'Project Goal' },
  { title: 'Learn the skills required to build a retrieval-augmented generation application', type: 'Project Goal' },
];

export const LearnerForm: React.FC<LearnerFormProps> = ({
  catalog,
  isGenerating,
  ollamaAvailable,
  ollamaModel,
  ollamaBaseUrl,
  installedModels = [],
  onRefreshOllama,
  errorState,
  initialValues,
  onSubmit,
}) => {
  const [learnerName, setLearnerName] = useState(initialValues?.learnerName ?? '');
  const [targetGoal, setTargetGoal] = useState(initialValues?.targetGoal ?? '');
  const [currentSkills, setCurrentSkills] = useState<CurrentSkillEntry[]>(
    initialValues?.currentSkills ?? []
  );
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>(ollamaModel);

  // Skill search & custom add state
  const [skillQuery, setSkillQuery] = useState('');
  const [selectedProficiency, setSelectedProficiency] = useState<ProficiencyLevel>('beginner');

  // Study time state
  const [timeInputMode, setTimeInputMode] = useState<'daily' | 'weekly'>('daily');
  const [minutesPerDay, setMinutesPerDay] = useState<number>(
    initialValues?.studyTime.minutes_per_day ?? 90
  );
  const [studyDays, setStudyDays] = useState<string[]>(
    initialValues?.studyTime.study_days ?? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
  );
  const [startDate, setStartDate] = useState<string>(
    initialValues?.studyTime.start_date ?? new Date().toISOString().slice(0, 10)
  );
  const [targetCompletionDate, setTargetCompletionDate] = useState<string>(
    initialValues?.studyTime.target_completion_date ?? ''
  );

  // Optional preferences state
  const [showOptionalPrefs, setShowOptionalPrefs] = useState(false);
  const [preferFreeResources, setPreferFreeResources] = useState(
    initialValues?.preferences.prefer_free_resources ?? false
  );
  const [preferredLanguage, setPreferredLanguage] = useState(
    initialValues?.preferences.preferred_language ?? 'English'
  );
  const [learningStyle, setLearningStyle] = useState(
    initialValues?.preferences.learning_style ?? 'balanced'
  );

  // Inline validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const availableCatalogSkills = useMemo(() => {
    const list = catalog?.skills ?? [];
    const addedNames = new Set(currentSkills.map((s) => s.skill_name.toLowerCase()));
    return list.filter((sk) => {
      if (addedNames.has(sk.skill_name.toLowerCase())) return false;
      if (!skillQuery.trim()) return true;
      const q = skillQuery.toLowerCase();
      return (
        sk.skill_name.toLowerCase().includes(q) ||
        sk.skill_category.toLowerCase().includes(q) ||
        sk.skill_id.toLowerCase().includes(q)
      );
    });
  }, [catalog, currentSkills, skillQuery]);

  const weeklyHours = useMemo(() => {
    return ((minutesPerDay / 60) * studyDays.length).toFixed(1);
  }, [minutesPerDay, studyDays]);

  const handleAddSkill = (skillName: string, skillId?: string) => {
    const clean = skillName.trim();
    if (!clean) return;
    const exists = currentSkills.some((s) => s.skill_name.toLowerCase() === clean.toLowerCase());
    if (exists) {
      setSkillQuery('');
      return;
    }
    setCurrentSkills((prev) => [
      ...prev,
      {
        skill_name: clean,
        proficiency: selectedProficiency,
        skill_id: skillId,
      },
    ]);
    setSkillQuery('');
  };

  const handleUpdateSkillProficiency = (index: number, prof: ProficiencyLevel) => {
    setCurrentSkills((prev) =>
      prev.map((item, i) => (i === index ? { ...item, proficiency: prof } : item))
    );
  };

  const handleRemoveSkill = (index: number) => {
    setCurrentSkills((prev) => prev.filter((_, i) => i !== index));
  };

  const toggleStudyDay = (day: string) => {
    setStudyDays((prev) => {
      if (prev.includes(day)) {
        if (prev.length === 1) return prev; // Keep at least 1 study day
        return prev.filter((d) => d !== day);
      }
      return ALL_WEEKDAYS.filter((d) => prev.includes(d) || d === day);
    });
  };

  const handleLoadAlexScenario = () => {
    setLearnerName('Alex');
    setTargetGoal('Become an AI Engineer');
    setCurrentSkills([
      { skill_name: 'Python Programming & Data Structures', proficiency: 'intermediate', skill_id: 'python_programming' },
      { skill_name: 'Relational Databases & Analytical SQL', proficiency: 'beginner', skill_id: 'sql_databases' },
      { skill_name: 'NumPy & Vectorized Array Computing', proficiency: 'beginner', skill_id: 'numpy_scientific_computing' },
      { skill_name: 'Supervised & Unsupervised Machine Learning (scikit-learn)', proficiency: 'beginner', skill_id: 'classical_machine_learning' },
    ]);
    setMinutesPerDay(90);
    setStudyDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    setTargetCompletionDate('');
    setFieldErrors({});
  };

  const validateAndSubmit = (allowFallback: boolean) => {
    const errs: Record<string, string> = {};
    if (!learnerName.trim()) {
      errs.learnerName = 'Please enter your name to personalize the learning roadmap.';
    }
    if (!targetGoal.trim() || targetGoal.trim().length < 3) {
      errs.targetGoal = 'Please enter or select a clear career role or technical learning goal.';
    }
    if (minutesPerDay < 15 || minutesPerDay > 720) {
      errs.studyTime = 'Please specify between 15 and 720 minutes of study time per day.';
    }
    if (studyDays.length === 0) {
      errs.studyDays = 'Select at least one available study day per week.';
    }
    if (targetCompletionDate && startDate && targetCompletionDate < startDate) {
      errs.targetCompletionDate = 'Target completion date cannot be earlier than the start date.';
    }

    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onSubmit({
      learner_name: learnerName.trim(),
      target_goal: targetGoal.trim(),
      current_skills: currentSkills,
      study_time: {
        minutes_per_day: minutesPerDay,
        study_days: studyDays,
        start_date: startDate || null,
        target_completion_date: targetCompletionDate || null,
      },
      preferences: {
        prefer_free_resources: preferFreeResources,
        preferred_language: preferredLanguage,
        learning_style: learningStyle,
      },
      allow_safe_fallback: allowFallback,
      preferred_ollama_model: selectedOllamaModel || ollamaModel,
    });
  };

  const inferredGoalCategory = useMemo(() => {
    const g = targetGoal.toLowerCase();
    if (!g) return null;
    if (g.includes('build') || g.includes('deploy') || g.includes('rag') || g.includes('application')) {
      return 'Project / Technical Objective';
    }
    if (g.includes('learn') || g.includes('from the beginning')) {
      return 'Foundational Technical Objective';
    }
    return 'Career Role Curriculum';
  }, [targetGoal]);

  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
      {/* Intro Header */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-800/80 pb-6">
        <div>
          <p className="text-xs font-medium tracking-wide text-indigo-400 mb-2">
            Personalized Curriculum &amp; Dependency Graph Engine
          </p>
          <h1
            className="text-2xl sm:text-4xl font-bold text-slate-50 tracking-tight"
            style={{ textWrap: 'balance' }}
          >
            Generate Your Visual Learning Roadmap
          </h1>
          <p className="mt-2 text-sm sm:text-base text-slate-400 max-w-2xl">
            Provide your learning goal, existing skills, and study schedule. SkillBridge AI analyzes
            prerequisite chains, calibrates effort against your proficiency, attaches verified
            documentation, and maps your curriculum as an interactive mind map.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLoadAlexScenario}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-end cursor-pointer"
          title="Populate the verified test profile (Alex — Become an AI Engineer)"
        >
          <FlaskConical className="w-3.5 h-3.5 text-indigo-400" />
          Load Alex Test Profile
        </button>
      </div>

      {/* Open-Source AI Engine Status & Local Ollama Model Selector */}
      <div className="mb-6 p-4 rounded-xl bg-[#0F172A] border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start sm:items-center gap-2.5">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 sm:mt-0 ${
              ollamaAvailable ? 'bg-emerald-400' : 'bg-cyan-400'
            }`}
          />
          <div>
            {ollamaAvailable ? (
              <div className="text-slate-200 font-medium">
                Local Ollama AI Connected ({ollamaBaseUrl}) ·{' '}
                <span className="text-emerald-300 font-mono">
                  {selectedOllamaModel || ollamaModel}
                </span>
              </div>
            ) : (
              <div className="text-slate-200 font-medium">
                Open-Source Knowledge-Graph AI Active{' '}
                <span className="text-cyan-300 font-mono">(Zero-Key · Unlimited Free)</span>
              </div>
            )}
            <div className="text-[11px] text-slate-400 mt-0.5">
              {ollamaAvailable
                ? 'Using your local open-source Ollama LLM + Python topological DAG validator.'
                : `Works immediately out-of-the-box. Optional: run 'ollama serve' at ${ollamaBaseUrl} to connect a local Ollama LLM.`}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {ollamaAvailable && installedModels.length > 0 && (
            <select
              aria-label="Select installed Ollama model"
              value={selectedOllamaModel}
              onChange={(e) => setSelectedOllamaModel(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-slate-200"
            >
              {installedModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
          {onRefreshOllama && (
            <button
              type="button"
              onClick={onRefreshOllama}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Check Ollama
            </button>
          )}
        </div>
      </div>

      {/* Error / Ollama Unavailable Banner */}
      {errorState && (
        <div
          role="alert"
          className="mb-8 p-5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-100"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-amber-200">
                {errorState.message}
              </h2>
              <p className="mt-1 text-xs text-amber-200/80">
                Configured endpoint: <span className="font-mono">{ollamaBaseUrl}</span> · Model:{' '}
                <span className="font-mono">{ollamaModel}</span>
              </p>
              {errorState.validationErrors && errorState.validationErrors.length > 0 && (
                <ul className="mt-2 text-xs text-amber-200/90 list-disc list-inside space-y-1">
                  {errorState.validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
              {errorState.canUseFallback && (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => validateAndSubmit(false)}
                    className="px-3.5 py-2 text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Retry Local Ollama Connection
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => validateAndSubmit(true)}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Generate with Curated Knowledge-Graph Safe Fallback
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Structured Planning Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          validateAndSubmit(!ollamaAvailable);
        }}
        noValidate
        className="space-y-8 bg-[#0F172A] border border-slate-800/90 rounded-2xl p-6 sm:p-8"
      >
        {/* 1. Learner Name */}
        <div>
          <label
            htmlFor="learner-name-input"
            className="block text-sm font-semibold text-slate-200 mb-1.5"
          >
            1. Learner Name <span className="text-indigo-400">*</span>
          </label>
          <p className="text-xs text-slate-400 mb-3">
            Used to personalize your generated roadmap workspace and saved progress records.
          </p>
          <input
            id="learner-name-input"
            type="text"
            value={learnerName}
            onChange={(e) => {
              setLearnerName(e.target.value);
              if (fieldErrors.learnerName) {
                setFieldErrors((prev) => ({ ...prev, learnerName: '' }));
              }
            }}
            placeholder="Enter your name (e.g., Alex)"
            className="w-full px-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {fieldErrors.learnerName && (
            <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.learnerName}</p>
          )}
        </div>

        {/* 2. Target Learning Goal */}
        <div className="pt-6 border-t border-slate-800/70">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="target-goal-input"
              className="block text-sm font-semibold text-slate-200"
            >
              2. Learning Goal <span className="text-indigo-400">*</span>
            </label>
            {inferredGoalCategory && (
              <span className="text-xs text-indigo-300 font-mono">
                Detected Mode: {inferredGoalCategory}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-3">
            Describe a target career role, a technical learning objective, or a specific AI/software
            project you want to build.
          </p>
          <input
            id="target-goal-input"
            type="text"
            value={targetGoal}
            onChange={(e) => {
              setTargetGoal(e.target.value);
              if (fieldErrors.targetGoal) {
                setFieldErrors((prev) => ({ ...prev, targetGoal: '' }));
              }
            }}
            placeholder="e.g., Become an AI Engineer, or Build a retrieval-augmented generation application"
            className="w-full px-4 py-2.5 bg-slate-950/90 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
          />
          {fieldErrors.targetGoal && (
            <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.targetGoal}</p>
          )}

          {/* Goal Suggestions */}
          <div className="mt-3">
            <p className="text-xs text-slate-400 mb-2">
              Or select a benchmarked career or project goal:
            </p>
            <div className="flex flex-wrap gap-2">
              {GOAL_SUGGESTIONS.map((sug) => {
                const isSelected = targetGoal.toLowerCase() === sug.title.toLowerCase();
                return (
                  <button
                    key={sug.title}
                    type="button"
                    onClick={() => {
                      setTargetGoal(sug.title);
                      if (fieldErrors.targetGoal) {
                        setFieldErrors((prev) => ({ ...prev, targetGoal: '' }));
                      }
                    }}
                    className={`px-3 py-1.5 text-xs rounded-lg border text-left transition-colors ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200 font-medium'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-slate-100'
                    }`}
                  >
                    <span>{sug.title}</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-[11px] text-slate-400">{sug.type}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 3. Current Skills & Proficiency Levels */}
        <div className="pt-6 border-t border-slate-800/70">
          <label className="block text-sm font-semibold text-slate-200 mb-1.5">
            3. Current Skills & Proficiency Levels
          </label>
          <p className="text-xs text-slate-400 mb-4">
            Add skills you already have or are familiar with. Known skills remain visible in your
            mind map while saving study hours; uncertain skills receive a diagnostic check.
          </p>

          {/* Search & Add Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-3">
            <div className="sm:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3 pointer-events-none" />
              <input
                type="text"
                value={skillQuery}
                onChange={(e) => setSkillQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && skillQuery.trim()) {
                    e.preventDefault();
                    handleAddSkill(skillQuery);
                  }
                }}
                placeholder="Search skills (e.g., Python, SQL, NumPy, React) or type custom..."
                aria-label="Search or add current skill"
                className="w-full pl-9 pr-3 py-2 bg-slate-950/90 border border-slate-800 rounded-lg text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={selectedProficiency}
                onChange={(e) => setSelectedProficiency(e.target.value as ProficiencyLevel)}
                aria-label="Default proficiency for added skill"
                className="w-full px-3 py-2 bg-slate-950/90 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                {PROFICIENCY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={() => handleAddSkill(skillQuery)}
                disabled={!skillQuery.trim()}
                className="w-full h-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Skill
              </button>
            </div>
          </div>

          {/* Quick-Add Suggestions from Curated Catalogue */}
          <div className="mb-4">
            <p className="text-xs text-slate-500 mb-2">
              {skillQuery.trim()
                ? 'Matching curated skills (click to add):'
                : 'Quick-add common technical skills:'}
            </p>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-1">
              {availableCatalogSkills.slice(0, 12).map((sk) => (
                <button
                  key={sk.skill_id}
                  type="button"
                  onClick={() => handleAddSkill(sk.skill_name, sk.skill_id)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs bg-slate-950/80 hover:bg-slate-900 text-slate-300 border border-slate-800/90 rounded-md transition-colors"
                >
                  <Plus className="w-3 h-3 text-indigo-400" />
                  <span>{sk.skill_name}</span>
                </button>
              ))}
              {skillQuery.trim() && availableCatalogSkills.length === 0 && (
                <button
                  type="button"
                  onClick={() => handleAddSkill(skillQuery)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-950/40 text-indigo-200 border border-indigo-500/40 rounded-md"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add custom skill &ldquo;{skillQuery.trim()}&rdquo;
                </button>
              )}
            </div>
          </div>

          {/* Selected Skills Table / List */}
          {currentSkills.length > 0 ? (
            <div className="border border-slate-800 rounded-xl divide-y divide-slate-800/80 bg-slate-950/50">
              {currentSkills.map((sk, idx) => (
                <div
                  key={`${sk.skill_name}-${idx}`}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span className="text-sm font-medium text-slate-200">{sk.skill_name}</span>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto">
                    <label className="sr-only" htmlFor={`prof-${idx}`}>
                      Proficiency for {sk.skill_name}
                    </label>
                    <select
                      id={`prof-${idx}`}
                      value={sk.proficiency}
                      onChange={(e) =>
                        handleUpdateSkillProficiency(idx, e.target.value as ProficiencyLevel)
                      }
                      className="px-2.5 py-1 bg-slate-900 border border-slate-700/80 rounded-md text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      {PROFICIENCY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label} — {opt.description}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(idx)}
                      aria-label={`Remove ${sk.skill_name}`}
                      className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-3 rounded-lg bg-slate-950/40 border border-slate-800/60 text-xs text-slate-400">
              No existing skills added yet. If you are starting from scratch, leave this empty and
              the planner will schedule all foundational prerequisites from the beginning.
            </div>
          )}
        </div>

        {/* 4. Available Study Time */}
        <div className="pt-6 border-t border-slate-800/70">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
            <label className="block text-sm font-semibold text-slate-200">
              4. Available Study Time <span className="text-indigo-400">*</span>
            </label>
            <span className="text-xs font-mono text-cyan-400 tabular-nums">
              Weekly Capacity: {weeklyHours} hrs/week ({studyDays.length} days × {minutesPerDay} min/day)
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            The Python scheduling engine respects your exact study capacity and never silently
            increases your study hours.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Daily Minutes or Weekly Hours */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="study-minutes-input" className="text-xs font-medium text-slate-300">
                  {timeInputMode === 'daily'
                    ? 'Study Minutes per Active Study Day'
                    : 'Total Study Hours per Week'}
                </label>
                <div className="inline-flex rounded-md bg-slate-950 p-0.5 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTimeInputMode('daily')}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      timeInputMode === 'daily'
                        ? 'bg-slate-800 text-slate-100 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Per Day
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeInputMode('weekly')}
                    className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                      timeInputMode === 'weekly'
                        ? 'bg-slate-800 text-slate-100 font-medium'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Per Week
                  </button>
                </div>
              </div>

              {timeInputMode === 'daily' ? (
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    id="study-minutes-input"
                    type="number"
                    min={15}
                    max={720}
                    step={15}
                    value={minutesPerDay}
                    onChange={(e) => setMinutesPerDay(Math.max(15, Number(e.target.value) || 15))}
                    className="w-28 px-3 py-2 bg-slate-950/90 border border-slate-800 rounded-lg text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-400">
                    minutes/day ({(minutesPerDay / 60).toFixed(1)} hrs/day)
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    id="study-minutes-input"
                    type="number"
                    min={1}
                    max={60}
                    step={0.5}
                    value={Number(weeklyHours)}
                    onChange={(e) => {
                      const wkHours = Math.max(1, Number(e.target.value) || 1);
                      const perDayMins = Math.round((wkHours * 60) / Math.max(studyDays.length, 1));
                      setMinutesPerDay(Math.min(720, Math.max(15, perDayMins)));
                    }}
                    className="w-28 px-3 py-2 bg-slate-950/90 border border-slate-800 rounded-lg text-sm font-mono tabular-nums text-slate-100 focus:outline-none focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-400">
                    hours/week (~{minutesPerDay} min/day across {studyDays.length} days)
                  </span>
                </div>
              )}

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[45, 60, 90, 120, 180].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMinutesPerDay(preset)}
                    className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded border transition-colors ${
                      minutesPerDay === preset
                        ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset}m/day
                  </button>
                ))}
              </div>
              {fieldErrors.studyTime && (
                <p className="mt-1.5 text-xs text-rose-400">{fieldErrors.studyTime}</p>
              )}
            </div>

            {/* Study Days Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Available Study Days ({studyDays.length} selected)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_WEEKDAYS.map((day) => {
                  const active = studyDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleStudyDay(day)}
                      aria-pressed={active}
                      className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-950/70 text-slate-400 border-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Optional Target Date */}
              <div className="mt-4">
                <label
                  htmlFor="target-date-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Optional Target Completion Date
                </label>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    id="target-date-input"
                    type="date"
                    value={targetCompletionDate}
                    min={startDate}
                    onChange={(e) => setTargetCompletionDate(e.target.value)}
                    className="px-3 py-1.5 bg-slate-950/90 border border-slate-800 rounded-lg text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                  {targetCompletionDate && (
                    <button
                      type="button"
                      onClick={() => setTargetCompletionDate('')}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {fieldErrors.targetCompletionDate && (
                  <p className="mt-1 text-xs text-rose-400">{fieldErrors.targetCompletionDate}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 5. Collapsible Optional Preferences */}
        <div className="pt-4 border-t border-slate-800/70">
          <button
            type="button"
            onClick={() => setShowOptionalPrefs((prev) => !prev)}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-slate-100 transition-colors"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Optional Learning Preferences (Free resources, start date, style)</span>
            {showOptionalPrefs ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showOptionalPrefs && (
            <div className="mt-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="flex items-center gap-2.5 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferFreeResources}
                    onChange={(e) => setPreferFreeResources(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Prefer free resources only</span>
                </label>
                <p className="mt-1 text-[11px] text-slate-400 pl-6">
                  Filter attached skill documentation and courses to verified free resources.
                </p>
              </div>

              <div>
                <label
                  htmlFor="start-date-input"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Planned Start Date
                </label>
                <input
                  id="start-date-input"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-slate-200"
                />
              </div>

              <div>
                <label
                  htmlFor="learning-style-select"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Preferred Learning Format
                </label>
                <select
                  id="learning-style-select"
                  value={learningStyle}
                  onChange={(e) => setLearningStyle(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                >
                  <option value="balanced">Balanced (Official Docs + Interactive Practice)</option>
                  <option value="documentation">Official Documentation & Open Textbooks</option>
                  <option value="hands_on">Interactive Courses & Coding Sandboxes</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Primary Action Bar */}
        <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              Grounded in O*NET 29.1, ESCO v1.2, and verified technical documentation.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {!ollamaAvailable && (
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => validateAndSubmit(false)}
                className="px-3.5 py-2.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors whitespace-nowrap"
              >
                Test Strict Ollama Request
              </button>
            )}

            <button
              type="submit"
              disabled={isGenerating}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl shadow-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{isGenerating ? 'Generating Your Roadmap...' : 'Generate My Roadmap'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};
