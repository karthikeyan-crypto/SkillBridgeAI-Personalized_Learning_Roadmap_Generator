import React, { useMemo, useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from '@xyflow/react';
import {
  CheckCircle2,
  Clock,
  Lock,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Layers,
  CircleDot,
  Eye,
  EyeOff,
  Compass,
  ArrowRightCircle,
} from 'lucide-react';
import type {
  RoadmapResponse,
  SkillNodeData,
  SkillNodeStatus,
} from '../types/roadmap';

interface MindMapGraphProps {
  roadmap: RoadmapResponse;
  selectedSkillId: string | null;
  onSelectSkill: (skillId: string) => void;
}

export const STATUS_VISUAL_CONFIG: Record<
  SkillNodeStatus,
  {
    label: string;
    borderClass: string;
    bgClass: string;
    textClass: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  already_known: {
    label: 'Already Known',
    borderClass: 'border-emerald-500/70',
    bgClass: 'bg-emerald-950/40',
    textClass: 'text-emerald-300',
    icon: CheckCircle2,
  },
  completed: {
    label: 'Completed',
    borderClass: 'border-emerald-400',
    bgClass: 'bg-emerald-950/60',
    textClass: 'text-emerald-200',
    icon: CheckCircle2,
  },
  in_progress: {
    label: 'In Progress',
    borderClass: 'border-cyan-400',
    bgClass: 'bg-cyan-950/50',
    textClass: 'text-cyan-200',
    icon: PlayCircle,
  },
  ready_to_learn: {
    label: 'Ready to Learn',
    borderClass: 'border-indigo-400',
    bgClass: 'bg-indigo-950/50',
    textClass: 'text-indigo-200',
    icon: CircleDot,
  },
  needs_review: {
    label: 'Needs Review',
    borderClass: 'border-amber-400/80',
    bgClass: 'bg-amber-950/45',
    textClass: 'text-amber-200',
    icon: RefreshCw,
  },
  optional: {
    label: 'Optional Specialization',
    borderClass: 'border-slate-600 border-dashed',
    bgClass: 'bg-slate-900/80',
    textClass: 'text-slate-300',
    icon: Sparkles,
  },
  blocked: {
    label: 'Waiting for Prerequisite',
    borderClass: 'border-slate-700/90',
    bgClass: 'bg-slate-950/85',
    textClass: 'text-slate-400',
    icon: Lock,
  },
};

/**
 * Central Target Goal Root Node
 */
const GoalRootNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    title: string;
    learnerName: string;
    totalSkills: number;
    totalHours: number;
    firstSkillName?: string;
  };
  return (
    <div className="px-6 py-4 rounded-2xl bg-indigo-950/90 border-2 border-indigo-400 shadow-lg min-w-[300px] max-w-[380px] text-center">
      <div className="flex items-center justify-center gap-2 text-xs font-mono text-indigo-300 mb-1">
        <Target className="w-4 h-4 text-indigo-400" />
        <span>TARGET GOAL · {d.learnerName}</span>
      </div>
      <div className="text-base font-bold text-white leading-snug">{d.title}</div>
      <div className="mt-2 text-xs text-indigo-200/90 font-mono tabular-nums">
        {d.totalSkills} Validated Skills · {d.totalHours}h Remaining Effort
      </div>
      {d.firstSkillName && (
        <div className="mt-1.5 pt-1.5 border-t border-indigo-500/30 text-[11px] text-emerald-300 font-mono truncate">
          Start Here: {d.firstSkillName}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-indigo-400 !w-3 !h-3 !border-2 !border-slate-950"
      />
    </div>
  );
};

/**
 * Learning Stage Branch Node (Visual Grouping Header)
 */
const StageBranchNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    stageName: string;
    stageIndex: number;
    skillCount: number;
    completedCount: number;
    totalHours: number;
  };
  return (
    <div className="px-4 py-3 rounded-xl bg-[#131C31] border border-slate-700 min-w-[230px] max-w-[255px] text-center shadow-md">
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-500 !w-2.5 !h-2.5 !border-slate-950"
      />
      <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-slate-400">
        <Layers className="w-3.5 h-3.5 text-indigo-400" />
        <span>STAGE 0{d.stageIndex} GROUP</span>
      </div>
      <div className="text-sm font-bold text-slate-100 mt-0.5">{d.stageName}</div>
      <div className="mt-1 text-[11px] text-slate-400 font-mono tabular-nums">
        {d.completedCount}/{d.skillCount} Done · {d.totalHours}h left
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-600 !w-2 !h-2 !border-slate-950"
      />
    </div>
  );
};

/**
 * Individual Skill Node with START HERE and NEXT TO LEARN highlights
 */
const CustomSkillNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as {
    skill: SkillNodeData;
    isSelected: boolean;
    isSearchMatch: boolean;
    isStartHere: boolean;
    isNextToLearn: boolean;
    onSelect: (id: string) => void;
  };
  const { skill, isSelected, isSearchMatch, isStartHere, isNextToLearn, onSelect } = d;
  const cfg = STATUS_VISUAL_CONFIG[skill.status] || STATUS_VISUAL_CONFIG.ready_to_learn;
  const StatusIcon = cfg.icon;

  // Determine if learner reported knowledge on a node that is currently waiting for a prerequisite
  const reportedButBlocked =
    skill.status === 'blocked' &&
    (skill.knowledge_status === 'needs_review' || skill.knowledge_status === 'already_known');

  return (
    <button
      type="button"
      onClick={() => onSelect(skill.skill_id)}
      className={`text-left rounded-xl border transition-all w-[245px] cursor-pointer focus:outline-none overflow-hidden ${
        cfg.bgClass
      } ${
        isStartHere
          ? 'border-2 border-emerald-400 ring-2 ring-emerald-400/40 shadow-lg'
          : isNextToLearn
          ? 'border-2 border-cyan-400 ring-1 ring-cyan-400/30 shadow-md'
          : cfg.borderClass
      } ${
        isSelected
          ? 'ring-2 ring-indigo-400 shadow-xl scale-[1.02]'
          : isSearchMatch
          ? 'ring-2 ring-amber-400 shadow-md'
          : 'hover:border-slate-400'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-2 !h-2 !border-slate-950"
      />

      {/* Prominent Priority Callout Bar for START HERE and NEXT TO LEARN */}
      {isStartHere && (
        <div className="px-3 py-1 bg-emerald-400 text-slate-950 text-[11px] font-mono font-bold flex items-center justify-between">
          <span className="inline-flex items-center gap-1">
            <Compass className="w-3.5 h-3.5" />
            <span>START HERE</span>
          </span>
          <span>STEP #{skill.active_step_number ?? 1}</span>
        </div>
      )}

      {!isStartHere && isNextToLearn && (
        <div className="px-3 py-1 bg-cyan-400 text-slate-950 text-[11px] font-mono font-bold flex items-center justify-between">
          <span className="inline-flex items-center gap-1">
            <ArrowRightCircle className="w-3.5 h-3.5" />
            <span>NEXT TO LEARN</span>
          </span>
          <span>STEP #{skill.active_step_number ?? 2}</span>
        </div>
      )}

      <div className="px-3.5 py-2.5">
        {/* Top Metadata Row */}
        <div className="flex items-center justify-between gap-1 text-[11px] font-mono mb-1">
          <span className={`inline-flex items-center gap-1 font-medium ${cfg.textClass}`}>
            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
            <span>{cfg.label}</span>
          </span>
          <span className="text-slate-400 tabular-nums">
            {skill.active_step_number
              ? `Step ${skill.active_step_number}`
              : 'Done'}
          </span>
        </div>

        {/* Skill Name */}
        <div className="text-xs font-semibold text-slate-100 leading-snug line-clamp-2">
          {skill.skill_name}
        </div>

        {/* Preserved Knowledge Note if Waiting on Prerequisite */}
        {reportedButBlocked && (
          <div className="mt-1 text-[10px] font-mono text-amber-300/90">
            Reported: {skill.learner_proficiency} (Needs prerequisite first)
          </div>
        )}

        {/* Bottom Effort & Prerequisite Count Row */}
        <div className="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
          <span className="capitalize">{skill.importance}</span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-500" />
            {skill.estimated_hours > 0 ? `${skill.estimated_hours}h` : '0h'}
          </span>
          <span>·</span>
          <span>
            {skill.strict_prerequisites?.length
              ? `${skill.strict_prerequisites.length} req`
              : 'No req'}
          </span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 !w-2 !h-2 !border-slate-950"
      />
    </button>
  );
};

const nodeTypes = {
  goalRoot: GoalRootNode,
  stageBranch: StageBranchNode,
  skillNode: CustomSkillNode,
};

export const MindMapGraph: React.FC<MindMapGraphProps> = ({
  roadmap,
  selectedSkillId,
  onSelectSkill,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeStageFilter, setActiveStageFilter] = useState<string>('ALL');
  const [showAdvancedOptional, setShowAdvancedOptional] = useState<boolean>(true);
  const [showRecommendedEdges, setShowRecommendedEdges] = useState<boolean>(true);

  const visibleStages = useMemo(() => {
    return roadmap.learning_stages.filter((st) => {
      if (activeStageFilter !== 'ALL' && st.stage_name !== activeStageFilter) {
        return false;
      }
      return true;
    });
  }, [roadmap.learning_stages, activeStageFilter]);

  const { computedNodes, computedEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const skillsById = new Map<string, SkillNodeData>();
    for (const sk of roadmap.skill_nodes) {
      skillsById.set(sk.skill_id, sk);
    }

    const firstSkillNode = roadmap.recommended_first_skill_id
      ? skillsById.get(roadmap.recommended_first_skill_id)
      : undefined;

    const totalStageColumns = Math.max(visibleStages.length, 1);
    const colWidth = 295;
    const totalGraphWidth = totalStageColumns * colWidth;
    const rootX = Math.max(0, totalGraphWidth / 2 - 170);

    // 1. Central Goal Root Node
    nodes.push({
      id: 'goal_root',
      type: 'goalRoot',
      position: { x: rootX, y: 15 },
      data: {
        title: roadmap.matched_goal_title || roadmap.target_goal,
        learnerName: roadmap.learner_profile.learner_name,
        totalSkills: roadmap.skill_nodes.length,
        totalHours: roadmap.schedule.total_remaining_hours,
        firstSkillName: firstSkillNode?.skill_name,
      },
      draggable: false,
    });

    const visibleSkillIds = new Set<string>();

    // 2. Stage Branch Headers & Skill Nodes arranged by stage without fake dependency arrows between independent siblings
    visibleStages.forEach((stageGroup, colIdx) => {
      const colX = colIdx * colWidth;
      const stageNodeId = `stage_${colIdx}`;

      nodes.push({
        id: stageNodeId,
        type: 'stageBranch',
        position: { x: colX, y: 175 },
        data: {
          stageName: stageGroup.stage_name,
          stageIndex: colIdx + 1,
          skillCount: stageGroup.total_count,
          completedCount: stageGroup.completed_or_known_count,
          totalHours: stageGroup.total_hours,
        },
        draggable: false,
      });

      // Structural grouping line from Goal Root to Stage Branch (no arrowhead so not confused with prerequisite edge)
      edges.push({
        id: `e_root_${stageNodeId}`,
        source: 'goal_root',
        target: stageNodeId,
        type: 'smoothstep',
        style: { stroke: '#334155', strokeWidth: 1.5 },
      });

      const stageSkills = stageGroup.skill_ids
        .map((id) => skillsById.get(id))
        .filter((s): s is SkillNodeData => Boolean(s))
        .filter((s) => (showAdvancedOptional ? true : s.importance !== 'optional'));

      stageSkills.forEach((skill, rowIdx) => {
        visibleSkillIds.add(skill.skill_id);
        const nodeY = 315 + rowIdx * 165;
        const q = searchQuery.trim().toLowerCase();
        const isMatch =
          q.length > 0 &&
          (skill.skill_name.toLowerCase().includes(q) ||
            skill.description.toLowerCase().includes(q) ||
            skill.skill_category.toLowerCase().includes(q));

        const isStartHere = roadmap.recommended_first_skill_id === skill.skill_id;
        const isNextToLearn = roadmap.recommended_next_skill_id === skill.skill_id;

        nodes.push({
          id: skill.skill_id,
          type: 'skillNode',
          position: { x: colX + 5, y: nodeY },
          data: {
            skill,
            isSelected: selectedSkillId === skill.skill_id,
            isSearchMatch: isMatch,
            isStartHere,
            isNextToLearn,
            onSelect: onSelectSkill,
          },
        });

        // Only connect the Stage Header to foundational entry nodes in that stage that have no in-plan prerequisites,
        // using a faint grouping line (no arrowhead) so unrelated siblings are NEVER falsely linked as prerequisites!
        const hasInPlanStrictPrereq = (skill.strict_prerequisites || []).some((p) =>
          skillsById.has(p)
        );
        if (!hasInPlanStrictPrereq) {
          edges.push({
            id: `e_group_${stageNodeId}_${skill.skill_id}`,
            source: stageNodeId,
            target: skill.skill_id,
            type: 'smoothstep',
            style: {
              stroke: '#1E293B',
              strokeWidth: 1.2,
            },
          });
        }
      });
    });

    // 3. Real Prerequisite Dependency Edges:
    // - Solid directional arrows for `strict_prerequisite`
    // - Dashed lighter arrows for `recommended_foundation`
    roadmap.prerequisite_edges.forEach((pedge, idx) => {
      if (
        !visibleSkillIds.has(pedge.prerequisite_skill_id) ||
        !visibleSkillIds.has(pedge.skill_id)
      ) {
        return;
      }

      const isStrict = pedge.relationship_type === 'strict_prerequisite';
      if (!isStrict && !showRecommendedEdges) {
        return;
      }

      const isHighlighted =
        selectedSkillId === pedge.skill_id ||
        selectedSkillId === pedge.prerequisite_skill_id;

      edges.push({
        id: `prereq_${idx}_${pedge.prerequisite_skill_id}_${pedge.skill_id}`,
        source: pedge.prerequisite_skill_id,
        target: pedge.skill_id,
        type: 'smoothstep',
        animated: isHighlighted && isStrict,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted
            ? '#22D3EE'
            : isStrict
            ? '#818CF8'
            : '#64748B',
        },
        style: {
          stroke: isHighlighted
            ? '#22D3EE'
            : isStrict
            ? '#818CF8'
            : '#475569',
          strokeWidth: isHighlighted ? 2.4 : isStrict ? 1.8 : 1.2,
          strokeDasharray: isStrict ? undefined : '5 5',
        },
      });
    });

    return { computedNodes: nodes, computedEdges: edges };
  }, [
    roadmap,
    visibleStages,
    selectedSkillId,
    searchQuery,
    showAdvancedOptional,
    showRecommendedEdges,
    onSelectSkill,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState(computedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(computedEdges);

  React.useEffect(() => {
    setNodes(computedNodes);
    setEdges(computedEdges);
  }, [computedNodes, computedEdges, setNodes, setEdges]);

  const matchingSkills = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return roadmap.skill_nodes.filter(
      (s) =>
        s.skill_name.toLowerCase().includes(q) ||
        s.skill_category.toLowerCase().includes(q)
    );
  }, [roadmap.skill_nodes, searchQuery]);

  const handleQuickJump = useCallback(
    (skillId: string) => {
      onSelectSkill(skillId);
      setSearchQuery('');
    },
    [onSelectSkill]
  );

  return (
    <div className="flex flex-col h-[720px] bg-[#0B1120] border border-slate-800/90 rounded-2xl overflow-hidden">
      {/* Graph Toolbar: Search, Stage Filter, and Dependency Toggles */}
      <div className="px-4 py-3 bg-[#0F172A] border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-3">
        {/* Search Skill Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Find skill in mind map..."
            aria-label="Find skill in mind map"
            className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
          />
          {matchingSkills.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-30 max-h-48 overflow-y-auto divide-y divide-slate-800">
              {matchingSkills.map((m) => (
                <button
                  key={m.skill_id}
                  type="button"
                  onClick={() => handleQuickJump(m.skill_id)}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 text-slate-200 flex items-center justify-between"
                >
                  <span className="truncate">{m.skill_name}</span>
                  <span className="text-[10px] font-mono text-slate-400 ml-2 shrink-0">
                    {m.active_step_number ? `Step ${m.active_step_number}` : 'Done'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Stage Filter Controls */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => setActiveStageFilter('ALL')}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeStageFilter === 'ALL'
                ? 'bg-indigo-600 text-white font-medium'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Stages ({roadmap.learning_stages.length})
          </button>
          {roadmap.learning_stages.map((st) => (
            <button
              key={st.stage_name}
              type="button"
              onClick={() => setActiveStageFilter(st.stage_name)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeStageFilter === st.stage_name
                  ? 'bg-indigo-600 text-white font-medium'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {st.stage_name} ({st.total_count})
            </button>
          ))}
        </div>

        {/* Edge & Optional Toggles */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRecommendedEdges((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {showRecommendedEdges ? (
              <Eye className="w-3.5 h-3.5 text-cyan-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>Recommended Foundations (Dashed)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAdvancedOptional((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {showAdvancedOptional ? (
              <Eye className="w-3.5 h-3.5 text-indigo-400" />
            ) : (
              <EyeOff className="w-3.5 h-3.5 text-slate-500" />
            )}
            <span>Optional Skills</span>
          </button>
        </div>
      </div>

      {/* Main Interactive React Flow Canvas (Explicit height prevents ResizeObserver loop notifications) */}
      <div className="w-full h-[580px] relative" style={{ width: '100%', height: 580 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          minZoom={0.25}
          maxZoom={1.6}
          proOptions={{ hideAttribution: false }}
        >
          <Background color="#1E293B" gap={24} size={1} />
          <Controls position="bottom-right" showInteractive={false} />
        </ReactFlow>
      </div>

      {/* Clear Visual State & Arrow Legend */}
      <div className="px-4 py-2.5 bg-[#0F172A] border-t border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
            <Compass className="w-3.5 h-3.5" />
            <span>START HERE (Step 1)</span>
          </span>
          <span className="inline-flex items-center gap-1 text-cyan-300 font-semibold">
            <ArrowRightCircle className="w-3.5 h-3.5" />
            <span>NEXT TO LEARN (Step 2)</span>
          </span>
          <span className="text-slate-600">|</span>
          {(
            [
              'already_known',
              'needs_review',
              'ready_to_learn',
              'in_progress',
              'completed',
              'blocked',
            ] as SkillNodeStatus[]
          ).map((stKey) => {
            const cfg = STATUS_VISUAL_CONFIG[stKey];
            const Icon = cfg.icon;
            return (
              <span
                key={stKey}
                className={`inline-flex items-center gap-1 ${cfg.textClass}`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{cfg.label}</span>
              </span>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span>───▶ Strict Prerequisite</span>
          <span>- - ▶ Recommended Foundation</span>
        </div>
      </div>
    </div>
  );
};
