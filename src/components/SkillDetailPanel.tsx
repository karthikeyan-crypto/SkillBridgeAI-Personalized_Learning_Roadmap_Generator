import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  ArrowUpRight,
  BookOpen,
  Code2,
  HelpCircle,
  PlayCircle,
  RefreshCw,
  X,
  ArrowRight,
  Calendar,
  Compass,
  ArrowRightCircle,
  AlertTriangle,
} from 'lucide-react';
import type {
  SkillNodeData,
  SkillNodeStatus,
} from '../types/roadmap';
import { STATUS_VISUAL_CONFIG } from './MindMapGraph';

interface SkillDetailPanelProps {
  skill: SkillNodeData;
  allSkillsById: Map<string, SkillNodeData>;
  isUpdatingStatus: boolean;
  onSelectSkill: (skillId: string) => void;
  onUpdateStatus: (skillId: string, newStatus: SkillNodeStatus) => void;
  onClose?: () => void;
}

const KNOWLEDGE_LABELS: Record<string, string> = {
  already_known: 'Already Known',
  needs_review: 'Needs Review (Partial)',
  unverified: 'Unverified',
  not_yet_learned: 'Not Yet Learned',
};

const READINESS_LABELS: Record<string, string> = {
  available_now: 'Available Now',
  waiting_for_prerequisites: 'Waiting for Prerequisite',
  completed: 'Completed / Satisfied',
};

export const SkillDetailPanel: React.FC<SkillDetailPanelProps> = ({
  skill,
  allSkillsById,
  isUpdatingStatus,
  onSelectSkill,
  onUpdateStatus,
  onClose,
}) => {
  const [showDiagnosticAnswer, setShowDiagnosticAnswer] = useState(false);

  const statusCfg = STATUS_VISUAL_CONFIG[skill.status] || STATUS_VISUAL_CONFIG.ready_to_learn;
  const StatusIcon = statusCfg.icon;

  const isCompletedOrKnown =
    skill.completion_status === 'completed' && !skill.has_unverified_prerequisite;

  const strictPrereqIds = skill.strict_prerequisites || skill.prerequisites || [];
  const recFoundationIds = skill.recommended_foundations || [];
  const unmetStrictIds = skill.unmet_strict_prerequisites || [];

  const primaryResource =
    skill.resources.find((r) => r.is_primary) || skill.resources[0] || null;
  const alternativeResources = skill.resources.filter(
    (r) => primaryResource && r.resource_id !== primaryResource.resource_id
  );

  return (
    <aside
      aria-label={`Skill details for ${skill.skill_name}`}
      className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-5 sm:p-6 flex flex-col gap-5 max-h-[720px] overflow-y-auto"
    >
      {/* Header & Priority Role Banner */}
      <div className="border-b border-slate-800/80 pb-4 space-y-2">
        {skill.recommendation_role === 'start_here' && (
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-300">
            <Compass className="w-4 h-4 text-emerald-400" />
            <span>START HERE · RECOMMENDED FIRST SKILL (STEP #{skill.active_step_number ?? 1})</span>
          </div>
        )}

        {skill.recommendation_role === 'next_to_learn' && (
          <div className="inline-flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-300">
            <ArrowRightCircle className="w-4 h-4 text-cyan-400" />
            <span>NEXT TO LEARN · RECOMMENDED SECOND SKILL (STEP #{skill.active_step_number ?? 2})</span>
          </div>
        )}

        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-400 mb-1">
              <span>
                {skill.active_step_number
                  ? `Learning Step #${skill.active_step_number}`
                  : `Catalogue Order #${skill.sequence_order}`}
              </span>
              <span>·</span>
              <span>{skill.stage}</span>
              <span>·</span>
              <span className="capitalize text-indigo-300">{skill.importance}</span>
              <span>·</span>
              <span>{skill.difficulty_level}</span>
            </div>

            <h2 className="text-lg sm:text-xl font-bold text-slate-50 leading-snug">
              {skill.skill_name}
            </h2>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close skill detail panel"
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Separated Knowledge, Readiness, and Completion Statuses */}
        <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] font-mono">
          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <div className="text-slate-500">Knowledge</div>
            <div className="text-slate-200 font-semibold mt-0.5 truncate">
              {KNOWLEDGE_LABELS[skill.knowledge_status] || skill.knowledge_status}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <div className="text-slate-500">Readiness</div>
            <div
              className={`font-semibold mt-0.5 truncate ${
                skill.readiness_status === 'available_now'
                  ? 'text-emerald-300'
                  : skill.readiness_status === 'waiting_for_prerequisites'
                  ? 'text-amber-300'
                  : 'text-indigo-300'
              }`}
            >
              {READINESS_LABELS[skill.readiness_status] || skill.readiness_status}
            </div>
          </div>

          <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
            <div className="text-slate-500">Status</div>
            <div className={`font-semibold mt-0.5 inline-flex items-center gap-1 truncate ${statusCfg.textClass}`}>
              <StatusIcon className="w-3 h-3 shrink-0" />
              <span className="truncate">{statusCfg.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning if Learner Reported Knowledge on a Skill with Unmet Strict Prerequisites */}
      {unmetStrictIds.length > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 text-xs text-amber-100 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="font-semibold text-amber-200">
                Waiting for Strict Prerequisite{unmetStrictIds.length > 1 ? 's' : ''}:
              </strong>{' '}
              {skill.knowledge_status === 'needs_review' || skill.knowledge_status === 'already_known'
                ? `Your reported experience (${skill.learner_proficiency}) is preserved, but this topic requires completing its foundation first before it becomes the primary study action.`
                : 'Complete the required foundational skill(s) below first to unlock this skill.'}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-6">
            {unmetStrictIds.map((uid) => {
              const pNode = allSkillsById.get(uid);
              return (
                <button
                  key={uid}
                  type="button"
                  onClick={() => onSelectSkill(uid)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 rounded-md transition-colors cursor-pointer"
                >
                  <span>Go to Prerequisite: {pNode?.skill_name || uid}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Why It Appears at This Point in the Sequence */}
      {skill.sequence_rationale && (
        <div className="p-3.5 rounded-xl bg-indigo-950/25 border border-indigo-500/30 text-xs text-indigo-100/90 leading-relaxed">
          <div className="font-mono text-[11px] text-indigo-300 font-semibold mb-1">
            WHY THIS APPEARS AT THIS POINT IN YOUR SEQUENCE
          </div>
          <p>{skill.sequence_rationale}</p>
        </div>
      )}

      {/* Primary Completion & Schedule Controls */}
      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-300 font-medium">
            Progress & Schedule Control
          </div>
          <div className="text-xs font-mono text-cyan-300 tabular-nums flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>
              {skill.estimated_hours > 0
                ? `${skill.estimated_hours}h scheduled (${skill.baseline_hours}h baseline)`
                : `0h remaining (${skill.baseline_hours}h saved)`}
            </span>
          </div>
        </div>

        {skill.scheduled_period && (
          <div className="text-xs text-slate-400 flex items-center gap-1.5 font-mono">
            <Calendar className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>{skill.scheduled_period}</span>
          </div>
        )}

        <p className="text-xs text-slate-400">{skill.status_explanation}</p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!isCompletedOrKnown ? (
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => onUpdateStatus(skill.skill_id, 'completed')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Mark as Completed</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => onUpdateStatus(skill.skill_id, 'needs_review')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-200 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-500/40 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reopen for Review</span>
            </button>
          )}

          {skill.status !== 'in_progress' &&
            !isCompletedOrKnown &&
            unmetStrictIds.length === 0 && (
              <button
                type="button"
                disabled={isUpdatingStatus}
                onClick={() => onUpdateStatus(skill.skill_id, 'in_progress')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-cyan-200 bg-cyan-950/50 hover:bg-cyan-900/50 border border-cyan-500/40 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                <span>Start Studying</span>
              </button>
            )}

          {skill.status !== 'ready_to_learn' && skill.status !== 'blocked' && (
            <button
              type="button"
              disabled={isUpdatingStatus}
              onClick={() => onUpdateStatus(skill.skill_id, 'ready_to_learn')}
              className="px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Reset to Ready
            </button>
          )}
        </div>
      </div>

      {/* Plain-English Explanation & Goal Relevance */}
      <div className="space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-300 mb-1">
            What This Skill Covers
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">{skill.description}</p>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-300 mb-1">
            Why It Is Relevant to Your Goal
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">{skill.why_relevant}</p>
        </div>
      </div>

      {/* Separated Strict Prerequisites, Recommended Foundations & Unlocked Dependent Skills */}
      <div className="pt-4 border-t border-slate-800/80 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Strict Prerequisites */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 mb-2">
              Strict Prerequisites ({strictPrereqIds.length})
            </h3>
            {strictPrereqIds.length > 0 ? (
              <div className="space-y-1.5">
                {strictPrereqIds.map((pid) => {
                  const pNode = allSkillsById.get(pid);
                  if (!pNode) return null;
                  const pCfg = STATUS_VISUAL_CONFIG[pNode.status];
                  const PIcon = pCfg.icon;
                  return (
                    <button
                      key={pid}
                      type="button"
                      onClick={() => onSelectSkill(pid)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-950/70 hover:bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-200 truncate">
                        <PIcon className={`w-3.5 h-3.5 shrink-0 ${pCfg.textClass}`} />
                        <span className="truncate">{pNode.skill_name}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                No strict prerequisites — can be started directly.
              </p>
            )}
          </div>

          {/* Unlocks Dependent Skills */}
          <div>
            <h3 className="text-xs font-semibold text-slate-300 mb-2">
              Unlocks Dependent Skills ({skill.dependent_skills.length})
            </h3>
            {skill.dependent_skills.length > 0 ? (
              <div className="space-y-1.5">
                {skill.dependent_skills.map((did) => {
                  const dNode = allSkillsById.get(did);
                  if (!dNode) return null;
                  const dCfg = STATUS_VISUAL_CONFIG[dNode.status];
                  const DIcon = dCfg.icon;
                  return (
                    <button
                      key={did}
                      type="button"
                      onClick={() => onSelectSkill(did)}
                      className="w-full text-left px-3 py-2 rounded-lg bg-slate-950/70 hover:bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 transition-colors cursor-pointer"
                    >
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-200 truncate">
                        <DIcon className={`w-3.5 h-3.5 shrink-0 ${dCfg.textClass}`} />
                        <span className="truncate">{dNode.skill_name}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Terminal specialization / milestone skill in this branch.
              </p>
            )}
          </div>
        </div>

        {/* Recommended Foundations (Non-Blocking) */}
        {recFoundationIds.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-400 mb-1.5">
              Recommended Foundations (Helpful Context, Non-Blocking)
            </h3>
            <div className="flex flex-wrap gap-2">
              {recFoundationIds.map((rid) => {
                const rNode = allSkillsById.get(rid);
                if (!rNode) return null;
                return (
                  <button
                    key={rid}
                    type="button"
                    onClick={() => onSelectSkill(rid)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950/50 hover:bg-slate-900 border border-dashed border-slate-700 text-xs text-slate-300 transition-colors cursor-pointer"
                  >
                    <span>{rNode.skill_name}</span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Expected Proficiency / Completion Criteria & Optional Diagnostic Check */}
      <div className="pt-4 border-t border-slate-800/80 space-y-3">
        <div>
          <h3 className="text-xs font-semibold text-slate-200 mb-1">
            Expected Mastery & Completion Criterion
          </h3>
          <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 leading-relaxed">
            {skill.completion_criteria}
          </p>
        </div>

        {skill.diagnostic_check && (
          <div className="p-3.5 rounded-xl bg-indigo-950/25 border border-indigo-500/30">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                <HelpCircle className="w-3.5 h-3.5" />
                Self-Assessment Diagnostic Question
              </span>
              <button
                type="button"
                onClick={() => setShowDiagnosticAnswer((prev) => !prev)}
                className="text-[11px] text-indigo-300 hover:text-indigo-200 underline"
              >
                {showDiagnosticAnswer ? 'Hide Guidance' : 'How to Verify'}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-200 leading-relaxed">
              {skill.diagnostic_check}
            </p>
            {showDiagnosticAnswer && (
              <p className="mt-2 pt-2 border-t border-indigo-500/20 text-[11px] text-indigo-200/90">
                If you can answer and implement this without consulting basic syntax tutorials,
                you may mark this skill as Completed. Otherwise, use the recommended starting
                resource below to review.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Verified Learning Resources (Primary Starting Resource + Alternatives) */}
      <div className="pt-4 border-t border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>Verified Learning Resources ({skill.resources.length})</span>
          </h3>
          <span className="text-[11px] font-mono text-slate-500">
            Verified: {skill.last_verified_date}
          </span>
        </div>

        {primaryResource && (
          <div className="p-4 rounded-xl bg-slate-950/90 border border-indigo-500/40 space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-indigo-300">
              <span>RECOMMENDED STARTING RESOURCE</span>
              <span>
                {primaryResource.free_or_paid} · {primaryResource.level} ·{' '}
                {primaryResource.estimated_duration_when_verified}
              </span>
            </div>

            <a
              href={primaryResource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100 hover:text-indigo-300 transition-colors"
            >
              <span>{primaryResource.title}</span>
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            </a>

            <div className="text-xs text-slate-400">
              Provider: <span className="text-slate-300">{primaryResource.provider}</span> ·{' '}
              {primaryResource.resource_type}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {primaryResource.why_appropriate}
            </p>

            <div className="pt-2 border-t border-slate-800/80 text-xs text-cyan-200/90">
              <strong className="font-medium text-cyan-300">How to practise: </strong>
              {primaryResource.practice_suggestion}
            </div>
          </div>
        )}

        {alternativeResources.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-400">
              Alternative Verified Resources:
            </div>
            {alternativeResources.map((alt) => (
              <div
                key={alt.resource_id}
                className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <a
                    href={alt.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-200 hover:text-indigo-300 transition-colors"
                  >
                    <span>{alt.title}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </a>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">
                    {alt.free_or_paid} · {alt.level}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{alt.why_appropriate}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggested Exercises & Mini-Project */}
      <div className="pt-4 border-t border-slate-800/80 space-y-3">
        {skill.suggested_exercises && skill.suggested_exercises.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Suggested Practice Exercises</span>
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-300 list-disc list-inside">
              {skill.suggested_exercises.map((ex, i) => (
                <li key={i} className="leading-relaxed">
                  {ex}
                </li>
              ))}
            </ul>
          </div>
        )}

        {skill.mini_project && (
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
            <div className="text-[11px] font-mono text-cyan-400 mb-1">
              PRACTICAL MINI-PROJECT
            </div>
            <p className="text-xs text-slate-200 leading-relaxed">{skill.mini_project}</p>
          </div>
        )}

        <div className="text-[11px] text-slate-500 font-mono pt-1">
          Source Attribution: {skill.source_reference}
        </div>
      </div>
    </aside>
  );
};
