import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Network,
  Calendar,
  BookOpen,
  SlidersHorizontal,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Target,
  Compass,
  ArrowRightCircle,
  GitBranch,
  ArrowRight,
  Play,
} from 'lucide-react';
import type {
  CurrentSkillEntry,
  EvaluationReportResponse,
  KnowledgeBaseCatalog,
  LearnerPreferences,
  RoadmapResponse,
  SavedRoadmapSummary,
  SkillNodeData,
  SkillNodeStatus,
  StudyTimeSettings,
} from './types/roadmap';
import { LearnerForm } from './components/LearnerForm';
import { MindMapGraph } from './components/MindMapGraph';
import { SkillDetailPanel } from './components/SkillDetailPanel';
import { ScheduleView } from './components/ScheduleView';
import { ResourcesView } from './components/ResourcesView';
import { SavedPlansView } from './components/SavedPlansView';
import { EvaluationAuditModal } from './components/EvaluationAuditModal';

type MainViewMode = 'form' | 'workspace' | 'saved';
type WorkspaceTab = 'mindmap' | 'schedule' | 'resources';

const ACTIVE_ROADMAP_STORAGE_KEY = 'skillbridge_active_roadmap_id';

export default function App() {
  const [catalog, setCatalog] = useState<KnowledgeBaseCatalog | null>(null);
  const [ollamaHealth, setOllamaHealth] = useState<{
    available: boolean;
    base_url: string;
    configured_model: string;
    installed_models?: string[];
    message: string;
  }>({
    available: false,
    base_url: 'http://localhost:11434',
    configured_model: 'llama3.2:latest',
    installed_models: [],
    message: '',
  });

  const [roadmap, setRoadmap] = useState<RoadmapResponse | null>(null);
  const [savedRoadmaps, setSavedRoadmaps] = useState<SavedRoadmapSummary[]>([]);
  const [mainView, setMainView] = useState<MainViewMode>('form');

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('mindmap');
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isUpdatingProgress, setIsUpdatingProgress] = useState(false);
  const [formError, setFormError] = useState<{
    message: string;
    canUseFallback?: boolean;
    validationErrors?: string[];
  } | null>(null);

  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evaluationData, setEvaluationData] = useState<EvaluationReportResponse | null>(null);

  const fetchSavedRoadmaps = useCallback(async () => {
    try {
      const res = await fetch('/api/roadmaps');
      if (res.ok) {
        const data = await res.json();
        const list: SavedRoadmapSummary[] = data.roadmaps || [];
        setSavedRoadmaps(list);
        return list;
      }
    } catch {
      // Ignore background fetch error
    }
    return [];
  }, []);

  const loadRoadmapById = useCallback(
    async (
      roadmapId: string,
      options?: {
        targetView?: MainViewMode;
        targetTab?: WorkspaceTab;
        focusSkillId?: string | null;
      }
    ) => {
      setIsLoadingSession(true);
      try {
        const res = await fetch(`/api/roadmaps/${encodeURIComponent(roadmapId)}`);
        if (res.ok) {
          const data: RoadmapResponse = await res.json();
          setRoadmap(data);
          localStorage.setItem(ACTIVE_ROADMAP_STORAGE_KEY, data.roadmap_id);

          const nextView = options?.targetView ?? 'workspace';
          setMainView(nextView);

          if (options?.targetTab) {
            setActiveTab(options.targetTab);
          }

          setSelectedSkillId(
            options?.focusSkillId ||
              data.recommended_first_skill_id ||
              data.skill_nodes[0]?.skill_id ||
              null
          );
          return data;
        }
      } catch {
        // Ignore error if saved ID no longer exists
      } finally {
        setIsLoadingSession(false);
      }
      return null;
    },
    []
  );

  const refreshOllamaHealth = useCallback(async () => {
    try {
      const healthRes = await fetch('/api/health');
      if (healthRes.ok) {
        const hData = await healthRes.json();
        if (hData.ollama) {
          setOllamaHealth(hData.ollama);
        }
      }
    } catch {
      // Ignore error
    }
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const [healthRes, kbRes] = await Promise.all([
          fetch('/api/health'),
          fetch('/api/knowledge-base'),
        ]);
        if (healthRes.ok) {
          const hData = await healthRes.json();
          if (hData.ollama) {
            setOllamaHealth(hData.ollama);
          }
        }
        if (kbRes.ok) {
          const kbData = await kbRes.json();
          setCatalog(kbData);
        }
      } catch {
        // Ignore initial load error
      }

      const list = await fetchSavedRoadmaps();
      const lastId = localStorage.getItem(ACTIVE_ROADMAP_STORAGE_KEY);
      if (lastId && list.some((r) => r.roadmap_id === lastId)) {
        await loadRoadmapById(lastId, { targetView: 'workspace' });
      }
    }
    init();
  }, [fetchSavedRoadmaps, loadRoadmapById]);

  const handleGenerateRoadmap = async (payload: {
    learner_name: string;
    target_goal: string;
    current_skills: CurrentSkillEntry[];
    study_time: StudyTimeSettings;
    preferences: LearnerPreferences;
    allow_safe_fallback: boolean;
    confirmed_goal_id?: string;
    preferred_ollama_model?: string;
  }) => {
    setIsGenerating(true);
    setFormError(null);
    try {
      const res = await fetch('/api/roadmaps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setFormError({
          message:
            data.error ||
            'The local AI model is unavailable. Please check that Ollama is running and the configured model is installed.',
          canUseFallback: Boolean(data.can_use_safe_fallback),
          validationErrors: data.validation_errors,
        });
        return;
      }

      const generated: RoadmapResponse = data;
      setRoadmap(generated);
      setMainView('workspace');
      setActiveTab('mindmap');
      localStorage.setItem(ACTIVE_ROADMAP_STORAGE_KEY, generated.roadmap_id);

      setSelectedSkillId(
        generated.recommended_first_skill_id ||
          generated.skill_nodes[0]?.skill_id ||
          null
      );

      await fetchSavedRoadmaps();
    } catch (err) {
      setFormError({
        message: `Failed to communicate with backend planning service: ${String(err)}`,
        canUseFallback: true,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmClosestGoal = async (confirmedGoalId: string) => {
    if (!roadmap) return;
    await handleGenerateRoadmap({
      learner_name: roadmap.learner_profile.learner_name,
      target_goal: roadmap.target_goal,
      current_skills: roadmap.learner_profile.current_skills.map((s) => ({
        skill_name: s.skill_name,
        proficiency: s.proficiency,
        skill_id: s.resolved_skill_id || undefined,
      })),
      study_time: roadmap.learner_profile.study_time,
      preferences: roadmap.learner_profile.preferences,
      allow_safe_fallback: true,
      confirmed_goal_id: confirmedGoalId,
    });
  };

  const handleUpdateSkillStatus = async (skillId: string, newStatus: SkillNodeStatus) => {
    if (!roadmap) return;
    setIsUpdatingProgress(true);
    try {
      const res = await fetch(
        `/api/roadmaps/${encodeURIComponent(roadmap.roadmap_id)}/progress`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skill_id: skillId, status: newStatus }),
        }
      );
      if (res.ok) {
        const updated: RoadmapResponse = await res.json();
        setRoadmap(updated);
        await fetchSavedRoadmaps();
      }
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  const handleQuickUpdateSkillInSavedSession = async (
    targetRoadmapId: string,
    skillId: string,
    newStatus: SkillNodeStatus
  ) => {
    const res = await fetch(
      `/api/roadmaps/${encodeURIComponent(targetRoadmapId)}/progress`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_id: skillId, status: newStatus }),
      }
    );
    if (res.ok) {
      const updated: RoadmapResponse = await res.json();
      if (roadmap?.roadmap_id === targetRoadmapId) {
        setRoadmap(updated);
      }
      await fetchSavedRoadmaps();
    }
  };

  const handleDeleteSavedRoadmap = async (targetRoadmapId: string) => {
    const res = await fetch(`/api/roadmaps/${encodeURIComponent(targetRoadmapId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      const data = await res.json();
      const remaining: SavedRoadmapSummary[] = data.roadmaps || [];
      setSavedRoadmaps(remaining);
      if (roadmap?.roadmap_id === targetRoadmapId) {
        localStorage.removeItem(ACTIVE_ROADMAP_STORAGE_KEY);
        if (remaining.length > 0) {
          await loadRoadmapById(remaining[0].roadmap_id, { targetView: 'saved' });
        } else {
          setRoadmap(null);
        }
      }
    }
  };

  const handleReschedule = async (
    minutesPerDay: number,
    studyDays: string[],
    targetCompletionDate: string | null
  ) => {
    if (!roadmap) return;
    setIsUpdatingProgress(true);
    try {
      const res = await fetch(
        `/api/roadmaps/${encodeURIComponent(roadmap.roadmap_id)}/reschedule`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            minutes_per_day: minutesPerDay,
            study_days: studyDays,
            target_completion_date: targetCompletionDate,
          }),
        }
      );
      if (res.ok) {
        const updated: RoadmapResponse = await res.json();
        setRoadmap(updated);
        await fetchSavedRoadmaps();
      }
    } finally {
      setIsUpdatingProgress(false);
    }
  };

  const handleOpenEvaluationModal = async () => {
    setShowEvalModal(true);
    try {
      const q = roadmap ? `?roadmap_id=${encodeURIComponent(roadmap.roadmap_id)}` : '';
      const res = await fetch(`/api/evaluation${q}`);
      if (res.ok) {
        const data: EvaluationReportResponse = await res.json();
        setEvaluationData(data);
      }
    } catch {
      // Ignore error
    }
  };

  const allSkillsById = useMemo(() => {
    const map = new Map<string, SkillNodeData>();
    if (!roadmap) return map;
    for (const s of roadmap.skill_nodes) {
      map.set(s.skill_id, s);
    }
    return map;
  }, [roadmap]);

  const selectedSkill = useMemo(() => {
    if (!roadmap || !selectedSkillId) return roadmap?.skill_nodes[0] ?? null;
    return allSkillsById.get(selectedSkillId) ?? roadmap.skill_nodes[0] ?? null;
  }, [roadmap, selectedSkillId, allSkillsById]);

  const firstRecommendedSkill = useMemo(() => {
    if (!roadmap || !roadmap.recommended_first_skill_id) return null;
    return allSkillsById.get(roadmap.recommended_first_skill_id) ?? null;
  }, [roadmap, allSkillsById]);

  const nextRecommendedSkill = useMemo(() => {
    if (!roadmap || !roadmap.recommended_next_skill_id) return null;
    return allSkillsById.get(roadmap.recommended_next_skill_id) ?? null;
  }, [roadmap, allSkillsById]);

  const upcomingSequenceSkills = useMemo(() => {
    if (!roadmap || !roadmap.learning_sequence) return [];
    return roadmap.learning_sequence
      .filter(
        (item) =>
          item.skill_id !== roadmap.recommended_first_skill_id &&
          item.skill_id !== roadmap.recommended_next_skill_id
      )
      .slice(0, 3);
  }, [roadmap]);

  const progressStats = useMemo(() => {
    if (!roadmap) return { done: 0, total: 0, percent: 0 };
    const total = roadmap.skill_nodes.length;
    const done = roadmap.skill_nodes.filter(
      (n) => n.readiness_status === 'completed'
    ).length;
    const percent = Math.round((done / Math.max(total, 1)) * 100);
    return { done, total, percent };
  }, [roadmap]);

  const handleSelectSkillAndFocusMap = useCallback((skillId: string) => {
    setSelectedSkillId(skillId);
    setActiveTab('mindmap');
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1120] text-[#F8FAFC]">
      {/* Strict 3-Zone Top Navigation Bar (Responsive across all viewports) */}
      <header className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 border-b border-slate-800/90 bg-[#0B1120]/95 sticky top-0 z-30">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            if (roadmap) {
              setMainView('workspace');
            } else {
              setMainView('form');
            }
          }}
          className="text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0 font-display"
        >
          SkillBridge AI
        </a>

        {/* Zone 2: Concise navigation links (Always accessible) */}
        <nav className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm font-medium text-slate-300 overflow-x-auto">
          <button
            type="button"
            onClick={() => setMainView('form')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
              mainView === 'form'
                ? 'text-white underline underline-offset-8 decoration-indigo-500 font-semibold'
                : ''
            }`}
          >
            Planner Form
          </button>

          {roadmap && (
            <button
              type="button"
              onClick={() => setMainView('workspace')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 ${
                mainView === 'workspace'
                  ? 'text-white underline underline-offset-8 decoration-indigo-500 font-semibold'
                  : ''
              }`}
            >
              Active Roadmap
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              fetchSavedRoadmaps();
              setMainView('saved');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1 inline-flex items-center gap-1.5 ${
              mainView === 'saved'
                ? 'text-white underline underline-offset-8 decoration-indigo-500 font-semibold'
                : ''
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>Saved Plans ({savedRoadmaps.length})</span>
          </button>

          <button
            type="button"
            onClick={handleOpenEvaluationModal}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer py-1"
          >
            Verification Audit
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMainView('form');
              setFormError(null);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {roadmap && mainView !== 'form' ? 'Adjust / New Plan' : 'Create Roadmap'}
          </button>
        </div>
      </header>

      {/* Main Content Area: Saved Plans Session View, Planner Form View, OR Active Workspace */}
      <main className="flex-1">
        {mainView === 'saved' ? (
          <SavedPlansView
            savedRoadmaps={savedRoadmaps}
            activeRoadmapId={roadmap?.roadmap_id ?? null}
            isLoadingSession={isLoadingSession}
            onResumeRoadmap={(rmId, targetTab, focusSkillId) => {
              loadRoadmapById(rmId, {
                targetView: 'workspace',
                targetTab: targetTab ?? 'mindmap',
                focusSkillId,
              });
            }}
            onEditRoadmapInForm={(rmId) => {
              loadRoadmapById(rmId, { targetView: 'form' });
            }}
            onQuickUpdateSkillInSession={handleQuickUpdateSkillInSavedSession}
            onDeleteRoadmap={handleDeleteSavedRoadmap}
            onCreateNewPlan={() => {
              setMainView('form');
              setFormError(null);
            }}
          />
        ) : mainView === 'form' || !roadmap ? (
          <div>
            {/* Quick Saved Sessions Bar when on Planner Form */}
            {savedRoadmaps.length > 0 && (
              <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-6">
                <div className="p-4 rounded-2xl bg-[#0F172A] border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <FolderOpen className="w-5 h-5 text-indigo-400 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-100">
                        You have {savedRoadmaps.length} saved learning session
                        {savedRoadmaps.length !== 1 ? 's' : ''} in SQLite
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Latest: {savedRoadmaps[0].learner_name} — {savedRoadmaps[0].target_goal} (
                        {savedRoadmaps[0].progress_percent}% complete
                        {savedRoadmaps[0].recommended_first_skill_name
                          ? ` · Start Here: ${savedRoadmaps[0].recommended_first_skill_name}`
                          : ''}
                        )
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        loadRoadmapById(savedRoadmaps[0].roadmap_id, {
                          targetView: 'workspace',
                        })
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume Latest</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMainView('saved')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors cursor-pointer"
                    >
                      View All Saved ({savedRoadmaps.length})
                    </button>
                  </div>
                </div>
              </div>
            )}

            <LearnerForm
              catalog={catalog}
              isGenerating={isGenerating}
              ollamaAvailable={ollamaHealth.available}
              ollamaModel={ollamaHealth.configured_model}
              ollamaBaseUrl={ollamaHealth.base_url}
              installedModels={ollamaHealth.installed_models}
              onRefreshOllama={refreshOllamaHealth}
              errorState={formError}
              initialValues={
                roadmap
                  ? {
                      learnerName: roadmap.learner_profile.learner_name,
                      targetGoal: roadmap.target_goal,
                      currentSkills: roadmap.learner_profile.current_skills.map((s) => ({
                        skill_name: s.skill_name,
                        proficiency: s.proficiency,
                        skill_id: s.resolved_skill_id || undefined,
                      })),
                      studyTime: roadmap.learner_profile.study_time,
                      preferences: roadmap.learner_profile.preferences,
                    }
                  : undefined
              }
              onSubmit={handleGenerateRoadmap}
            />
          </div>
        ) : (
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
            {/* Uncertain Custom Goal Match Confirmation Banner */}
            {roadmap.goal_match_uncertain && roadmap.closest_goal_candidates && (
              <div
                role="region"
                aria-label="Confirm closest supported curriculum goal"
                className="p-5 rounded-2xl bg-indigo-950/40 border border-indigo-500/50 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="text-sm font-bold text-indigo-200">
                      Confirm Closest Available Curriculum for &ldquo;{roadmap.target_goal}&rdquo;
                    </h2>
                    <p className="text-xs text-slate-300 mt-1">
                      Your custom goal does not directly match a pre-built occupational record. We
                      mapped it provisionally to <strong>{roadmap.matched_goal_title}</strong>. Select
                      the closest supported curriculum below to confirm:
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pl-8">
                  {roadmap.closest_goal_candidates.map((cand) => (
                    <button
                      key={cand.goal_id}
                      type="button"
                      disabled={isGenerating}
                      onClick={() => handleConfirmClosestGoal(cand.goal_id)}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer ${
                        cand.goal_id === roadmap.matched_goal_id
                          ? 'bg-indigo-600 text-white border-indigo-400 font-semibold'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
                      }`}
                    >
                      Confirm: {cand.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Workspace Header: Learner Name, Target Goal, Summary, Progress & View Switcher */}
            <section className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-1.5 max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-indigo-300">
                    <Target className="w-3.5 h-3.5 text-indigo-400" />
                    <span>PERSONALIZED LEARNING WORKSPACE</span>
                    <span>·</span>
                    <span>O*NET {roadmap.onet_reference}</span>
                    <span>·</span>
                    <span className="capitalize">
                      {roadmap.goal_type.replace('_', ' ')}
                    </span>
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-50 tracking-tight">
                    {roadmap.learner_profile.learner_name}&rsquo;s Roadmap: {roadmap.target_goal}
                  </h1>

                  <p className="text-sm text-slate-300 leading-relaxed">
                    {roadmap.summary}
                  </p>
                </div>

                {/* Compact Progress Indicator */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-3 shrink-0 bg-slate-950/70 border border-slate-800/90 rounded-xl p-4 min-w-[260px]">
                  <div className="w-full">
                    <div className="flex items-center justify-between text-xs font-mono mb-1.5 tabular-nums">
                      <span className="text-slate-300 font-medium">Verified Mastery</span>
                      <span className="text-emerald-400 font-semibold">
                        {progressStats.done}/{progressStats.total} Skills ({progressStats.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-200"
                        style={{ width: `${progressStats.percent}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400 tabular-nums">
                      <span>Remaining: {roadmap.schedule.total_remaining_hours}h</span>
                      <span>Est. End: {roadmap.schedule.estimated_completion_date}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* START HERE · NEXT TO LEARN · UPCOMING · PARALLEL Guidance Deck */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-slate-800/80">
                {/* 1. START HERE Card */}
                <div className="lg:col-span-4 p-4 rounded-xl bg-emerald-950/25 border border-emerald-500/40 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs font-mono font-bold text-emerald-300 mb-1">
                      <span className="inline-flex items-center gap-1.5">
                        <Compass className="w-4 h-4 text-emerald-400" />
                        <span>START HERE (STEP 1)</span>
                      </span>
                      {firstRecommendedSkill && (
                        <span>{firstRecommendedSkill.estimated_hours}h</span>
                      )}
                    </div>
                    {firstRecommendedSkill ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelectSkillAndFocusMap(firstRecommendedSkill.skill_id)}
                          className="text-left text-base font-bold text-white hover:text-emerald-200 transition-colors cursor-pointer"
                        >
                          {firstRecommendedSkill.skill_name}
                        </button>
                        <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                          {firstRecommendedSkill.knowledge_status === 'needs_review' ||
                          firstRecommendedSkill.knowledge_status === 'unverified'
                            ? `Review & verify your reported ${firstRecommendedSkill.learner_proficiency} knowledge first to unlock dependent skills.`
                            : `Highest-priority ${firstRecommendedSkill.stage.toLowerCase()} foundation ready to start immediately.`}
                        </p>
                      </>
                    ) : (
                      <div className="text-sm font-semibold text-emerald-200">
                        All curriculum skills completed!
                      </div>
                    )}
                  </div>

                  {firstRecommendedSkill && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSelectSkillAndFocusMap(firstRecommendedSkill.skill_id)}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-lg transition-colors cursor-pointer"
                      >
                        Inspect &amp; Start
                      </button>
                      <button
                        type="button"
                        disabled={isUpdatingProgress}
                        onClick={() =>
                          handleUpdateSkillStatus(firstRecommendedSkill.skill_id, 'completed')
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-200 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/40 rounded-lg transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark Complete</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. NEXT TO LEARN Card */}
                <div className="lg:col-span-4 p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/40 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs font-mono font-bold text-cyan-300 mb-1">
                      <span className="inline-flex items-center gap-1.5">
                        <ArrowRightCircle className="w-4 h-4 text-cyan-400" />
                        <span>NEXT TO LEARN (STEP 2)</span>
                      </span>
                      {nextRecommendedSkill && (
                        <span>{nextRecommendedSkill.estimated_hours}h</span>
                      )}
                    </div>
                    {nextRecommendedSkill ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSelectSkillAndFocusMap(nextRecommendedSkill.skill_id)}
                          className="text-left text-base font-bold text-white hover:text-cyan-200 transition-colors cursor-pointer"
                        >
                          {nextRecommendedSkill.skill_name}
                        </button>
                        <p className="mt-1 text-xs text-slate-300 leading-relaxed line-clamp-3">
                          {roadmap.recommended_next_reason}
                        </p>
                      </>
                    ) : (
                      <div className="text-xs text-slate-400">
                        No subsequent skills remaining after current step.
                      </div>
                    )}
                  </div>

                  {nextRecommendedSkill && (
                    <div>
                      <button
                        type="button"
                        onClick={() => handleSelectSkillAndFocusMap(nextRecommendedSkill.skill_id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-200 cursor-pointer"
                      >
                        <span>View Next Skill Details</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* 3. UPCOMING & PARALLEL STUDY OPTIONS */}
                <div className="lg:col-span-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 flex flex-col justify-between gap-3">
                  <div className="space-y-2">
                    <div className="text-xs font-mono font-bold text-indigo-300 flex items-center justify-between">
                      <span>UPCOMING IN SEQUENCE</span>
                      <span>STEPS 3–5</span>
                    </div>
                    {upcomingSequenceSkills.length > 0 ? (
                      <div className="space-y-1">
                        {upcomingSequenceSkills.map((item) => (
                          <button
                            key={item.skill_id}
                            type="button"
                            onClick={() => handleSelectSkillAndFocusMap(item.skill_id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-900 flex items-center justify-between gap-2 text-xs text-slate-200 transition-colors cursor-pointer"
                          >
                            <span className="truncate">
                              <span className="font-mono text-slate-400 mr-1.5">
                                #{item.step_number}
                              </span>
                              {item.skill_name}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400 shrink-0">
                              {item.estimated_hours}h
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No additional upcoming steps.</p>
                    )}
                  </div>

                  {roadmap.parallel_learning_options &&
                    roadmap.parallel_learning_options.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80">
                        <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1 mb-1">
                          <GitBranch className="w-3 h-3 text-cyan-400" />
                          <span>
                            Also Available Now in Parallel ({roadmap.parallel_learning_options.length}):
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {roadmap.parallel_learning_options.slice(0, 3).map((popt) => (
                            <button
                              key={popt.skill_id}
                              type="button"
                              onClick={() => handleSelectSkillAndFocusMap(popt.skill_id)}
                              className="px-2 py-0.5 text-[11px] rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-colors cursor-pointer"
                            >
                              {popt.skill_name} ({popt.estimated_hours}h)
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>

              {/* Explicit Safe Fallback Notice when Ollama was offline */}
              {roadmap.validation_status.is_fallback && (
                <div className="px-4 py-2.5 rounded-xl bg-amber-950/25 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200/90">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Explicitly Labelled Safe Fallback Mode:</strong>{' '}
                      {roadmap.validation_status.fallback_reason}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMainView('form')}
                    className="text-amber-300 hover:text-amber-100 underline font-medium whitespace-nowrap"
                  >
                    Configure / Retry Ollama
                  </button>
                </div>
              )}

              {/* Bottom Bar of Workspace Header: 3 Related Views Switcher + Saved Sessions & Replan Buttons */}
              <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
                <div
                  role="tablist"
                  aria-label="Roadmap workspace views"
                  className="inline-flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'mindmap'}
                    onClick={() => setActiveTab('mindmap')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      activeTab === 'mindmap'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Network className="w-3.5 h-3.5" />
                    <span>Mind Map</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'schedule'}
                    onClick={() => setActiveTab('schedule')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      activeTab === 'schedule'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Schedule ({roadmap.schedule.estimated_weeks} wks)</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'resources'}
                    onClick={() => setActiveTab('resources')}
                    className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      activeTab === 'resources'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Resources ({roadmap.resource_references.length})</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      fetchSavedRoadmaps();
                      setMainView('saved');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                    <span>All Saved Plans ({savedRoadmaps.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMainView('form')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Edit Inputs / Regenerate Plan</span>
                  </button>
                </div>
              </div>
            </section>

            {/* Active Workspace View Content */}
            {activeTab === 'mindmap' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className="lg:col-span-7 xl:col-span-8">
                    <MindMapGraph
                      roadmap={roadmap}
                      selectedSkillId={selectedSkill?.skill_id ?? null}
                      onSelectSkill={setSelectedSkillId}
                    />
                  </div>

                  <div className="lg:col-span-5 xl:col-span-4">
                    {selectedSkill ? (
                      <SkillDetailPanel
                        skill={selectedSkill}
                        allSkillsById={allSkillsById}
                        isUpdatingStatus={isUpdatingProgress}
                        onSelectSkill={setSelectedSkillId}
                        onUpdateStatus={handleUpdateSkillStatus}
                      />
                    ) : (
                      <div className="bg-[#0F172A] border border-slate-800 rounded-2xl p-6 text-xs text-slate-400">
                        Select any skill node in the mind map to inspect prerequisites, learning
                        resources, diagnostic questions, and completion controls.
                      </div>
                    )}
                  </div>
                </div>

                {/* Capstone Project Milestones & Planning Assumptions */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {roadmap.project_milestones.length > 0 && (
                    <div className="lg:col-span-7 bg-[#0F172A] border border-slate-800/90 rounded-2xl p-6 space-y-4">
                      <h2 className="text-sm font-bold text-slate-100">
                        Practical Application &amp; Portfolio Milestones
                      </h2>
                      <div className="space-y-3">
                        {roadmap.project_milestones.map((proj) => (
                          <div
                            key={proj.project_id}
                            className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/90 space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <h3 className="text-sm font-semibold text-slate-100">
                                {proj.title}
                              </h3>
                              <span className="text-xs font-mono text-cyan-300 tabular-nums shrink-0">
                                {proj.estimated_effort}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              {proj.objective}
                            </p>
                            <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                              {proj.milestones.map((m, i) => (
                                <li key={i}>{m}</li>
                              ))}
                            </ul>
                            <div className="pt-1 text-[11px] text-emerald-300/90 flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              <span>Completion Criterion: {proj.completion_criteria}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="lg:col-span-5 bg-[#0F172A] border border-slate-800/90 rounded-2xl p-6 space-y-4">
                    <h2 className="text-sm font-bold text-slate-100">
                      Planning Assumptions &amp; Scope Notes
                    </h2>
                    <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                      {roadmap.assumptions.map((assump, i) => (
                        <li key={i}>{assump}</li>
                      ))}
                    </ul>

                    {roadmap.missing_information.length > 0 && (
                      <div className="pt-3 border-t border-slate-800">
                        <h3 className="text-xs font-semibold text-slate-300 mb-1.5">
                          Unverified Inputs &amp; Clarifications
                        </h3>
                        <ul className="text-xs text-slate-400 space-y-1.5 list-disc list-inside">
                          {roadmap.missing_information.map((mi, i) => (
                            <li key={i}>{mi}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'schedule' && (
              <ScheduleView
                roadmap={roadmap}
                isUpdating={isUpdatingProgress}
                onSelectSkillInMap={handleSelectSkillAndFocusMap}
                onUpdateStatus={handleUpdateSkillStatus}
                onReschedule={handleReschedule}
              />
            )}

            {activeTab === 'resources' && (
              <ResourcesView
                roadmap={roadmap}
                onSelectSkillInMap={handleSelectSkillAndFocusMap}
              />
            )}
          </div>
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="mt-12 border-t border-slate-800/80 py-6 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            SkillBridge AI — Personalized Learning Roadmap &amp; Dependency Graph Generator
          </div>
          <div className="flex items-center gap-4">
            <span>Data Sources: O*NET 29.1 · ESCO v1.2 · Official Documentation</span>
            <span>·</span>
            <button
              type="button"
              onClick={handleOpenEvaluationModal}
              className="text-slate-400 hover:text-slate-200 underline cursor-pointer"
            >
              View ML Benchmark &amp; Plan Audit
            </button>
          </div>
        </div>
      </footer>

      {/* Model Evaluation & Curriculum Verification Modal */}
      <EvaluationAuditModal
        isOpen={showEvalModal}
        onClose={() => setShowEvalModal(false)}
        evaluationData={evaluationData}
        roadmap={roadmap}
      />
    </div>
  );
}
