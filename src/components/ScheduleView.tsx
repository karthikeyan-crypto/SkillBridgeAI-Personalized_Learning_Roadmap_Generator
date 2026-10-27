import React, { useState } from 'react';
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  ArrowRight,
  Compass,
  ArrowRightCircle,
} from 'lucide-react';
import type {
  RoadmapResponse,
  SkillNodeStatus,
} from '../types/roadmap';
import { STATUS_VISUAL_CONFIG } from './MindMapGraph';

interface ScheduleViewProps {
  roadmap: RoadmapResponse;
  isUpdating: boolean;
  onSelectSkillInMap: (skillId: string) => void;
  onUpdateStatus: (skillId: string, newStatus: SkillNodeStatus) => void;
  onReschedule: (
    minutesPerDay: number,
    studyDays: string[],
    targetCompletionDate: string | null
  ) => void;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  roadmap,
  isUpdating,
  onSelectSkillInMap,
  onUpdateStatus,
  onReschedule,
}) => {
  const { schedule } = roadmap;
  const [showAdjustPanel, setShowAdjustPanel] = useState(false);
  const [minutesInput, setMinutesInput] = useState(schedule.minutes_per_day);
  const [daysInput, setDaysInput] = useState<string[]>(schedule.study_days);
  const [targetDateInput, setTargetDateInput] = useState<string>(
    schedule.target_completion_date ?? ''
  );

  const toggleDay = (d: string) => {
    setDaysInput((prev) => {
      if (prev.includes(d)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== d);
      }
      return WEEKDAYS.filter((x) => prev.includes(x) || x === d);
    });
  };

  const handleApplyReschedule = (e: React.FormEvent) => {
    e.preventDefault();
    onReschedule(minutesInput, daysInput, targetDateInput || null);
    setShowAdjustPanel(false);
  };

  return (
    <div className="space-y-6">
      {/* Schedule Header Summary Bar */}
      <div className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div>
            <h2 className="text-lg font-bold text-slate-100">
              Topological Study Schedule & Calendar Timeline
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              {schedule.is_estimate_notice}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowAdjustPanel((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap self-start lg:self-auto"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
            <span>{showAdjustPanel ? 'Hide Schedule Settings' : 'Adjust Study Hours / Deadline'}</span>
          </button>
        </div>

        {/* Clean Unboxed Metric Strip (Tabular Numerals) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-5 text-sm">
          <div>
            <div className="text-xs text-slate-400">Stated Study Capacity</div>
            <div className="mt-1 font-mono font-semibold text-slate-100 tabular-nums">
              {schedule.minutes_per_day} min/day · {schedule.weekly_capacity_hours}h/wk
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {schedule.study_days.join(', ')}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Remaining Study Effort</div>
            <div className="mt-1 font-mono font-semibold text-cyan-300 tabular-nums">
              {schedule.total_remaining_hours} hrs (~{schedule.estimated_weeks} wks)
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Essential only: {schedule.essential_only_hours}h
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Prior Knowledge Savings</div>
            <div className="mt-1 font-mono font-semibold text-emerald-300 tabular-nums">
              {schedule.hours_saved_by_prior_knowledge} hrs saved
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              vs {schedule.total_baseline_hours}h full baseline
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400">Estimated Completion Date</div>
            <div className="mt-1 font-mono font-semibold text-indigo-300 tabular-nums">
              {schedule.estimated_completion_date}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Start: {schedule.start_date}
            </div>
          </div>
        </div>

        {/* Inline Study Time Recalculation Panel */}
        {showAdjustPanel && (
          <form
            onSubmit={handleApplyReschedule}
            className="mt-6 pt-5 border-t border-slate-800 bg-slate-950/60 p-4 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
          >
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Minutes per Day
              </label>
              <input
                type="number"
                min={15}
                max={720}
                step={15}
                value={minutesInput}
                onChange={(e) => setMinutesInput(Math.max(15, Number(e.target.value) || 15))}
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-100"
              />
            </div>

            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Available Study Days
              </label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      daysInput.includes(d)
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={targetDateInput}
                onChange={(e) => setTargetDateInput(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-200"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={isUpdating}
                className="w-full px-3 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                Recalculate
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Impossible Deadline Warning & Actionable Alternatives */}
      {!schedule.is_deadline_feasible && schedule.deadline_warning && (
        <div
          role="alert"
          className="p-5 rounded-2xl bg-amber-950/30 border border-amber-500/40 text-amber-100 space-y-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-amber-200">
                Target Completion Date Conflict Detected
              </h3>
              <p className="mt-1 text-xs text-amber-100/90 leading-relaxed">
                {schedule.deadline_warning}
              </p>
            </div>
          </div>

          {schedule.deadline_alternatives.length > 0 && (
            <div className="pl-8 space-y-1.5">
              <div className="text-xs font-medium text-amber-200">
                Practical Alternatives:
              </div>
              <ul className="text-xs text-amber-100/85 space-y-1 list-disc list-inside">
                {schedule.deadline_alternatives.map((alt, i) => (
                  <li key={i}>{alt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Topological Schedule Table */}
      <div className="bg-[#0F172A] border border-slate-800/90 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-mono text-slate-400">
                <th className="py-3 px-4">Sequence</th>
                <th className="py-3 px-4">Skill & Stage</th>
                <th className="py-3 px-4">Strict Prerequisites</th>
                <th className="py-3 px-4">Readiness & Status</th>
                <th className="py-3 px-4 text-right">Effort</th>
                <th className="py-3 px-4">Planned Window & Sessions</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {schedule.entries.map((entry, idx) => {
                const cfg = STATUS_VISUAL_CONFIG[entry.status] || STATUS_VISUAL_CONFIG.ready_to_learn;
                const StatusIcon = cfg.icon;
                const isDone = entry.readiness_status === 'completed';
                const isStartHere = entry.skill_id === roadmap.recommended_first_skill_id;
                const isNextToLearn = entry.skill_id === roadmap.recommended_next_skill_id;

                return (
                  <tr
                    key={entry.skill_id}
                    className={`transition-colors ${
                      isStartHere
                        ? 'bg-emerald-950/20 hover:bg-emerald-950/30'
                        : isNextToLearn
                        ? 'bg-cyan-950/15 hover:bg-cyan-950/25'
                        : 'hover:bg-slate-900/60'
                    }`}
                  >
                    <td className="py-3.5 px-4 font-mono tabular-nums">
                      {isStartHere ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300 font-bold">
                          <Compass className="w-3.5 h-3.5" />
                          <span>START #{entry.active_step_number ?? 1}</span>
                        </span>
                      ) : isNextToLearn ? (
                        <span className="inline-flex items-center gap-1 text-cyan-300 font-bold">
                          <ArrowRightCircle className="w-3.5 h-3.5" />
                          <span>NEXT #{entry.active_step_number ?? 2}</span>
                        </span>
                      ) : entry.active_step_number ? (
                        <span className="text-slate-300">Step #{entry.active_step_number}</span>
                      ) : (
                        <span className="text-slate-500">Done ({idx + 1})</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => onSelectSkillInMap(entry.skill_id)}
                        className="text-left font-semibold text-slate-100 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <span>{entry.skill_name}</span>
                        <ArrowRight className="w-3 h-3 text-slate-500" />
                      </button>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {entry.stage} · <span className="capitalize">{entry.importance}</span>
                        {entry.parallel_eligible && !isDone && (
                          <span> · Parallel-eligible</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-400 max-w-[200px]">
                      {entry.prerequisites.length > 0 ? (
                        <span className="font-mono text-[11px]">
                          {entry.prerequisites.join(', ')}
                        </span>
                      ) : (
                        <span className="text-slate-500">None (Foundation)</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${cfg.textClass}`}>
                        <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>{cfg.label}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-slate-200">
                      {entry.estimated_hours > 0 ? (
                        <span>{entry.estimated_hours}h</span>
                      ) : (
                        <span className="text-emerald-400">0h</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono tabular-nums text-slate-300">
                      {entry.estimated_hours > 0 ? (
                        <div>
                          <div className="inline-flex items-center gap-1.5 text-slate-200">
                            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                            <span>
                              {entry.planned_start_date} → {entry.planned_completion_date}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {entry.workload_distribution}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-500">{entry.workload_distribution}</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      {!isDone ? (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => onUpdateStatus(entry.skill_id, 'completed')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-950/50 hover:bg-emerald-900/60 border border-emerald-500/30 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Complete</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => onUpdateStatus(entry.skill_id, 'needs_review')}
                          className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                        >
                          Review
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
