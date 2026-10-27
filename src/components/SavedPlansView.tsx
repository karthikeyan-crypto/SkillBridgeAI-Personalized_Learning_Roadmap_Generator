import React, { useState, useMemo } from 'react';
import {
  FolderOpen,
  Compass,
  ArrowRightCircle,
  Calendar,
  Clock,
  CheckCircle2,
  Trash2,
  SlidersHorizontal,
  Search,
  Plus,
  Network,
  History,
  Play,
} from 'lucide-react';
import type { SavedRoadmapSummary, SkillNodeStatus } from '../types/roadmap';

interface SavedPlansViewProps {
  savedRoadmaps: SavedRoadmapSummary[];
  activeRoadmapId: string | null;
  isLoadingSession: boolean;
  onResumeRoadmap: (
    roadmapId: string,
    targetTab?: 'mindmap' | 'schedule' | 'resources',
    focusSkillId?: string | null
  ) => void;
  onEditRoadmapInForm: (roadmapId: string) => void;
  onQuickUpdateSkillInSession: (
    roadmapId: string,
    skillId: string,
    newStatus: SkillNodeStatus
  ) => Promise<void>;
  onDeleteRoadmap: (roadmapId: string) => Promise<void>;
  onCreateNewPlan: () => void;
}

export const SavedPlansView: React.FC<SavedPlansViewProps> = ({
  savedRoadmaps,
  activeRoadmapId,
  isLoadingSession,
  onResumeRoadmap,
  onEditRoadmapInForm,
  onQuickUpdateSkillInSession,
  onDeleteRoadmap,
  onCreateNewPlan,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [executingRoadmapId, setExecutingRoadmapId] = useState<string | null>(null);

  const filteredRoadmaps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return savedRoadmaps;
    return savedRoadmaps.filter(
      (rm) =>
        rm.learner_name.toLowerCase().includes(q) ||
        rm.target_goal.toLowerCase().includes(q) ||
        rm.matched_goal_title.toLowerCase().includes(q) ||
        (rm.recommended_first_skill_name || '').toLowerCase().includes(q)
    );
  }, [savedRoadmaps, searchQuery]);

  const handleQuickCompleteFirstSkill = async (
    roadmapId: string,
    firstSkillId: string
  ) => {
    setExecutingRoadmapId(roadmapId);
    try {
      await onQuickUpdateSkillInSession(roadmapId, firstSkillId, 'completed');
    } finally {
      setExecutingRoadmapId(null);
    }
  };

  const handleDeleteConfirm = async (roadmapId: string) => {
    setExecutingRoadmapId(roadmapId);
    try {
      await onDeleteRoadmap(roadmapId);
      setConfirmDeleteId(null);
    } finally {
      setExecutingRoadmapId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header Section */}
      <div className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-indigo-300 mb-1">
            <FolderOpen className="w-4 h-4 text-indigo-400" />
            <span>SQLITE PERSISTED LEARNING SESSIONS</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-50 tracking-tight">
            Saved Learning Plans &amp; Active Sessions ({savedRoadmaps.length})
          </h1>
          <p className="mt-1 text-sm text-slate-300">
            Resume any saved learner roadmap, execute your next recommended study step directly,
            inspect session progress history, or adjust study parameters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {savedRoadmaps.length > 0 && (
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by learner or goal..."
                aria-label="Filter saved plans"
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onCreateNewPlan}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Roadmap</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {savedRoadmaps.length === 0 ? (
        <div className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-10 text-center max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 flex items-center justify-center mx-auto">
            <FolderOpen className="w-6 h-6 text-indigo-400" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">
            No Saved Learning Sessions Yet
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            SkillBridge AI never fabricates sample learner accounts. Enter your name, learning goal,
            current skill proficiencies, and study schedule in the Planner Form to generate and
            persist your first personalized roadmap.
          </p>
          <button
            type="button"
            onClick={onCreateNewPlan}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Go to Planner Form</span>
          </button>
        </div>
      ) : filteredRoadmaps.length === 0 ? (
        <div className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-8 text-center text-sm text-slate-400">
          No saved plans match &ldquo;{searchQuery}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredRoadmaps.map((item) => {
            const isCurrentActive = item.roadmap_id === activeRoadmapId;
            const isBusy =
              isLoadingSession || executingRoadmapId === item.roadmap_id;
            const formattedUpdated = item.updated_at
              ? item.updated_at.slice(0, 16).replace('T', ' ')
              : '';

            return (
              <article
                key={item.roadmap_id}
                className={`bg-[#0F172A] rounded-2xl border p-6 flex flex-col justify-between gap-5 transition-all ${
                  isCurrentActive
                    ? 'border-indigo-500/80 ring-1 ring-indigo-500/30 shadow-lg'
                    : 'border-slate-800/90 hover:border-slate-700'
                }`}
              >
                <div className="space-y-4">
                  {/* Card Top Metadata & Active Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400 mb-1">
                        <span className="text-indigo-300 font-semibold">
                          {item.learner_name}
                        </span>
                        <span>·</span>
                        <span className="capitalize">
                          {item.goal_type.replace('_', ' ')}
                        </span>
                        {formattedUpdated && (
                          <>
                            <span>·</span>
                            <span>Updated {formattedUpdated}</span>
                          </>
                        )}
                      </div>
                      <h2 className="text-lg font-bold text-slate-50 leading-snug">
                        {item.target_goal}
                      </h2>
                      {item.matched_goal_title !== item.target_goal && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Mapped Curriculum: {item.matched_goal_title}
                        </div>
                      )}
                    </div>

                    {isCurrentActive && (
                      <span className="px-2.5 py-1 rounded-md bg-indigo-950/80 border border-indigo-400/50 text-[11px] font-mono font-semibold text-indigo-200 shrink-0">
                        ACTIVE SESSION
                      </span>
                    )}
                  </div>

                  {/* Progress & Effort Strip */}
                  <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-slate-300 font-medium">
                        Mastery Progress: {item.completed_or_known_skills}/{item.total_skills} Skills
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {item.progress_percent}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-200"
                        style={{ width: `${item.progress_percent}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-[11px] font-mono text-slate-400 tabular-nums">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>{item.total_remaining_hours ?? 0}h left</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{item.hours_saved_by_prior_knowledge ?? 0}h saved</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                        <span className="truncate">
                          {item.estimated_completion_date || 'Scheduled'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* START HERE (Step 1) & NEXT TO LEARN (Step 2) inside Saved Session Card */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* START HERE Box */}
                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/35 flex flex-col justify-between gap-2">
                      <div>
                        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-emerald-300">
                          <span className="inline-flex items-center gap-1">
                            <Compass className="w-3.5 h-3.5 text-emerald-400" />
                            <span>START HERE (STEP 1)</span>
                          </span>
                          {item.recommended_first_skill_hours !== undefined &&
                            item.recommended_first_skill_name && (
                              <span>{item.recommended_first_skill_hours}h</span>
                            )}
                        </div>
                        {item.recommended_first_skill_name && item.recommended_first_skill_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              onResumeRoadmap(
                                item.roadmap_id,
                                'mindmap',
                                item.recommended_first_skill_id
                              )
                            }
                            className="mt-1 text-left text-xs font-bold text-white hover:text-emerald-200 transition-colors cursor-pointer line-clamp-2"
                          >
                            {item.recommended_first_skill_name}
                          </button>
                        ) : (
                          <div className="mt-1 text-xs font-semibold text-emerald-200">
                            All skills completed!
                          </div>
                        )}
                      </div>

                      {item.recommended_first_skill_id && (
                        <div className="pt-1 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              handleQuickCompleteFirstSkill(
                                item.roadmap_id,
                                item.recommended_first_skill_id!
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-emerald-400 hover:bg-emerald-300 text-slate-950 rounded-md transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Complete Step 1</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* NEXT TO LEARN Box */}
                    <div className="p-3.5 rounded-xl bg-cyan-950/15 border border-cyan-500/30 flex flex-col justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-cyan-300">
                          <ArrowRightCircle className="w-3.5 h-3.5 text-cyan-400" />
                          <span>NEXT TO LEARN (STEP 2)</span>
                        </div>
                        {item.recommended_next_skill_name && item.recommended_next_skill_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              onResumeRoadmap(
                                item.roadmap_id,
                                'mindmap',
                                item.recommended_next_skill_id
                              )
                            }
                            className="mt-1 text-left text-xs font-bold text-white hover:text-cyan-200 transition-colors cursor-pointer line-clamp-2"
                          >
                            {item.recommended_next_skill_name}
                          </button>
                        ) : (
                          <div className="mt-1 text-xs text-slate-400">
                            No remaining subsequent step
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {item.minutes_per_day ?? 90} min/day ·{' '}
                        {(item.study_days || []).join(', ')}
                      </div>
                    </div>
                  </div>

                  {/* Recent Session Progress Activity Log */}
                  {item.recent_activity && item.recent_activity.length > 0 && (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                      <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                        <History className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Recent Session Activity</span>
                      </div>
                      <div className="space-y-1">
                        {item.recent_activity.slice(0, 2).map((act) => (
                          <div
                            key={act.id}
                            className="text-xs text-slate-300 flex items-center justify-between gap-2 bg-slate-950/50 px-2.5 py-1 rounded border border-slate-800/70"
                          >
                            <span className="truncate">
                              <strong className="font-medium text-slate-200">
                                {act.skill_name || act.skill_id}
                              </strong>{' '}
                              → <span className="text-emerald-300">{act.new_status.replace('_', ' ')}</span>
                            </span>
                            <span className="text-[10px] font-mono text-slate-500 shrink-0">
                              {act.updated_at.slice(0, 10)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Primary Session Execution Footer Actions */}
                <div className="pt-4 border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onResumeRoadmap(item.roadmap_id, 'mindmap')}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>{isCurrentActive ? 'Open Active Workspace' : 'Execute / Resume Session'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onResumeRoadmap(item.roadmap_id, 'schedule')}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors cursor-pointer"
                    >
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Schedule</span>
                    </button>

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onEditRoadmapInForm(item.roadmap_id)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors cursor-pointer"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                      <span>Edit Inputs</span>
                    </button>
                  </div>

                  {/* Delete Session Control with Inline Confirmation */}
                  {confirmDeleteId === item.roadmap_id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDeleteConfirm(item.roadmap_id)}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors cursor-pointer"
                      >
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(item.roadmap_id)}
                      aria-label={`Delete saved roadmap for ${item.learner_name}`}
                      className="p-2 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-900 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};
