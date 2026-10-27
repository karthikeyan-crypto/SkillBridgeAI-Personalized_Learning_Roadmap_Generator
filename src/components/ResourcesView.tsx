import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  ExternalLink,
  Search,
  ArrowRight,
} from 'lucide-react';
import type {
  RoadmapResponse,
  SkillNodeStatus,
} from '../types/roadmap';
import { STATUS_VISUAL_CONFIG } from './MindMapGraph';

interface ResourcesViewProps {
  roadmap: RoadmapResponse;
  onSelectSkillInMap: (skillId: string) => void;
}

export const ResourcesView: React.FC<ResourcesViewProps> = ({
  roadmap,
  onSelectSkillInMap,
}) => {
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const filteredSkillNodes = useMemo(() => {
    return roadmap.skill_nodes.filter((node) => {
      if (stageFilter !== 'ALL' && node.stage !== stageFilter) return false;
      if (statusFilter !== 'ALL' && node.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const skillMatch =
          node.skill_name.toLowerCase().includes(q) ||
          node.description.toLowerCase().includes(q);
        const resMatch = node.resources.some(
          (r) =>
            r.title.toLowerCase().includes(q) ||
            r.provider.toLowerCase().includes(q)
        );
        return skillMatch || resMatch;
      }
      return true;
    });
  }, [roadmap.skill_nodes, stageFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Filter Toolbar */}
      <div className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100">
            Verified Skill Resource Library ({roadmap.resource_references.length} Verified Resources)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Every skill in your generated roadmap is paired with verified official documentation,
            open textbooks, and hands-on courses.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills or providers..."
              aria-label="Search skills or resource providers"
              className="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            aria-label="Filter resources by learning stage"
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
          >
            <option value="ALL">All Stages</option>
            {roadmap.learning_stages.map((st) => (
              <option key={st.stage_name} value={st.stage_name}>
                {st.stage_name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter resources by skill status"
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
          >
            <option value="ALL">All Skill Statuses</option>
            {(
              [
                'ready_to_learn',
                'needs_review',
                'in_progress',
                'already_known',
                'completed',
                'optional',
                'blocked',
              ] as SkillNodeStatus[]
            ).map((st) => (
              <option key={st} value={st}>
                {STATUS_VISUAL_CONFIG[st].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Skill-to-Resource Mapping List */}
      <div className="space-y-4">
        {filteredSkillNodes.map((skill) => {
          const cfg = STATUS_VISUAL_CONFIG[skill.status] || STATUS_VISUAL_CONFIG.ready_to_learn;
          const StatusIcon = cfg.icon;

          return (
            <div
              key={skill.skill_id}
              className="bg-[#0F172A] border border-slate-800/90 rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono text-slate-400 mb-1">
                    <span>#{skill.sequence_order}</span>
                    <span>·</span>
                    <span>{skill.stage}</span>
                    <span>·</span>
                    <span className="capitalize text-indigo-300">{skill.importance}</span>
                    <span>·</span>
                    <span className={`inline-flex items-center gap-1 ${cfg.textClass}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {cfg.label}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-100">{skill.skill_name}</h3>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectSkillInMap(skill.skill_id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 rounded-lg transition-colors whitespace-nowrap self-start sm:self-auto"
                >
                  <span>Inspect in Mind Map</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {skill.resources.map((res, idx) => (
                  <div
                    key={res.resource_id}
                    className={`p-4 rounded-xl border space-y-2 ${
                      idx === 0
                        ? 'bg-slate-950/80 border-indigo-500/40'
                        : 'bg-slate-950/45 border-slate-800/90'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
                      <span className={idx === 0 ? 'text-indigo-300 font-medium' : ''}>
                        {idx === 0 ? 'RECOMMENDED STARTING RESOURCE' : 'ALTERNATIVE RESOURCE'}
                      </span>
                      <span>
                        {res.free_or_paid} · {res.level} · {res.estimated_duration_when_verified}
                      </span>
                    </div>

                    <a
                      href={res.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-100 hover:text-indigo-300 transition-colors"
                    >
                      <BookOpen className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{res.title}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </a>

                    <div className="text-xs text-slate-400">
                      Provider: <span className="text-slate-300">{res.provider}</span> ·{' '}
                      {res.resource_type} · Verified {res.verified_date}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">
                      {res.why_appropriate}
                    </p>

                    <div className="pt-2 border-t border-slate-800/80 text-xs text-cyan-200/90">
                      <span className="font-medium text-cyan-300">Suggested practice: </span>
                      {res.practice_suggestion}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
