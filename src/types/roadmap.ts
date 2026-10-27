export type ProficiencyLevel =
  | 'none'
  | 'beginner'
  | 'basic'
  | 'intermediate'
  | 'confident'
  | 'unknown';

export type SkillNodeStatus =
  | 'already_known'
  | 'needs_review'
  | 'ready_to_learn'
  | 'in_progress'
  | 'completed'
  | 'optional'
  | 'blocked';

export type KnowledgeStatus =
  | 'already_known'
  | 'needs_review'
  | 'unverified'
  | 'not_yet_learned';

export type ReadinessStatus =
  | 'available_now'
  | 'waiting_for_prerequisites'
  | 'completed';

export type CompletionStatus =
  | 'completed'
  | 'in_progress'
  | 'incomplete';

export type RecommendationRole =
  | 'start_here'
  | 'next_to_learn'
  | 'upcoming'
  | 'parallel_option'
  | 'later_in_sequence'
  | 'completed_or_known';

export type SkillImportance = 'essential' | 'recommended' | 'optional';

export interface CurrentSkillEntry {
  skill_name: string;
  proficiency: ProficiencyLevel;
  skill_id?: string;
}

export interface StudyTimeSettings {
  minutes_per_day: number;
  study_days: string[];
  start_date?: string | null;
  target_completion_date?: string | null;
}

export interface LearnerPreferences {
  prefer_free_resources: boolean;
  preferred_language: string;
  learning_style: string;
}

export interface VerifiedResource {
  resource_id: string;
  skill_id: string;
  title: string;
  provider: string;
  url: string;
  resource_type: string;
  free_or_paid: string;
  language: string;
  level: string;
  verified_date: string;
  estimated_duration_when_verified: string;
  why_appropriate: string;
  practice_suggestion: string;
  source_reference: string;
  is_primary?: boolean;
}

export interface SkillNodeData {
  skill_id: string;
  skill_name: string;
  sequence_order: number;
  active_step_number?: number | null;
  stage: string;
  skill_category: string;
  difficulty_level: string;
  importance: SkillImportance;
  parallel_allowed?: boolean;
  description: string;
  why_relevant: string;
  learner_proficiency: ProficiencyLevel;
  knowledge_status: KnowledgeStatus;
  readiness_status: ReadinessStatus;
  completion_status: CompletionStatus;
  status: SkillNodeStatus;
  recommendation_role: RecommendationRole;
  status_explanation: string;
  sequence_rationale: string;
  baseline_hours: number;
  estimated_hours: number;
  prerequisites: string[];
  strict_prerequisites: string[];
  recommended_foundations: string[];
  unmet_strict_prerequisites: string[];
  unmet_recommended_foundations: string[];
  has_unverified_prerequisite: boolean;
  dependent_skills: string[];
  completion_criteria: string;
  diagnostic_check: string;
  suggested_exercises: string[];
  mini_project: string;
  subtopics: string[];
  resources: VerifiedResource[];
  source_reference: string;
  last_verified_date: string;
  scheduled_period: string;
}

export interface PrerequisiteEdge {
  skill_id: string;
  prerequisite_skill_id: string;
  relationship_type: 'strict_prerequisite' | 'recommended_foundation' | string;
  justification: string;
}

export interface LearningStageGroup {
  stage_name: string;
  skill_ids: string[];
  total_hours: number;
  completed_or_known_count: number;
  total_count: number;
}

export interface LearningSequenceItem {
  step_number: number;
  sequence_order: number;
  skill_id: string;
  skill_name: string;
  stage: string;
  importance: SkillImportance;
  status: SkillNodeStatus;
  knowledge_status: KnowledgeStatus;
  readiness_status: ReadinessStatus;
  completion_status: CompletionStatus;
  recommendation_role: RecommendationRole;
  estimated_hours: number;
  strict_prerequisites: string[];
  unmet_strict_prerequisites: string[];
  recommended_foundations: string[];
  unlocks_skills: string[];
  rationale: string;
}

export interface ParallelLearningOption {
  skill_id: string;
  skill_name: string;
  stage: string;
  importance: SkillImportance;
  estimated_hours: number;
  reason: string;
}

export interface ScheduleEntry {
  skill_id: string;
  skill_name: string;
  stage: string;
  importance: SkillImportance;
  status: SkillNodeStatus;
  knowledge_status?: KnowledgeStatus;
  readiness_status?: ReadinessStatus;
  recommendation_role?: RecommendationRole;
  active_step_number?: number | null;
  estimated_hours: number;
  baseline_hours: number;
  prerequisites: string[];
  recommended_foundations?: string[];
  planned_start_date: string;
  planned_completion_date: string;
  study_sessions_count: number;
  workload_distribution: string;
  parallel_eligible?: boolean;
}

export interface SchedulePlan {
  start_date: string;
  target_completion_date: string | null;
  estimated_completion_date: string;
  is_estimate_notice: string;
  minutes_per_day: number;
  study_days: string[];
  weekly_capacity_hours: number;
  total_baseline_hours: number;
  hours_saved_by_prior_knowledge: number;
  total_remaining_hours: number;
  essential_only_hours: number;
  estimated_weeks: number;
  is_deadline_feasible: boolean;
  deadline_warning: string | null;
  deadline_alternatives: string[];
  entries: ScheduleEntry[];
}

export interface ProjectMilestone {
  project_id: string;
  title: string;
  objective: string;
  required_skills: string[];
  estimated_effort: string;
  milestones: string[];
  completion_criteria: string;
  relevant_goal: string;
}

export interface ValidationStatus {
  is_valid: boolean;
  schema_validated: boolean;
  has_circular_dependencies: boolean;
  missing_essential_skills_repaired: string[];
  hallucinated_skills_rejected: string[];
  resource_coverage_ratio: number;
  generation_mode: string;
  ollama_model: string;
  ollama_base_url: string;
  repair_attempts: number;
  is_fallback: boolean;
  fallback_reason?: string | null;
  confidence_note: string;
}

export interface QualityAudit {
  essential_skill_completeness: number;
  expected_essential_count: number;
  covered_essential_count: number;
  prerequisite_dag_valid: boolean;
  circular_dependencies_detected: boolean;
  topological_ordering_violations: number;
  verified_resource_coverage: number;
  nodes_with_verified_resources: number;
  total_nodes: number;
  schedule_deadline_feasible: boolean;
}

export interface GoalCandidate {
  goal_id: string;
  title: string;
  goal_type: string;
  description: string;
}

export interface RoadmapResponse {
  roadmap_id: string;
  created_at: string;
  learner_profile: {
    learner_name: string;
    current_skills: Array<{
      skill_name: string;
      proficiency: ProficiencyLevel;
      resolved_skill_id?: string | null;
    }>;
    study_time: StudyTimeSettings;
    preferences: LearnerPreferences;
  };
  target_goal: string;
  matched_goal_title: string;
  matched_goal_id: string;
  goal_match_status?: string;
  goal_match_uncertain?: boolean;
  closest_goal_candidates?: GoalCandidate[];
  goal_type: 'career_role' | 'technical_objective' | 'project_goal';
  onet_reference: string;
  esco_reference: string;
  summary: string;
  recommended_first_skill_id: string | null;
  recommended_next_skill_id: string | null;
  recommended_next_action: string;
  recommended_next_reason: string;
  learning_sequence: LearningSequenceItem[];
  parallel_learning_options: ParallelLearningOption[];
  skill_nodes: SkillNodeData[];
  prerequisite_edges: PrerequisiteEdge[];
  learning_stages: LearningStageGroup[];
  schedule: SchedulePlan;
  resource_references: VerifiedResource[];
  project_milestones: ProjectMilestone[];
  assumptions: string[];
  missing_information: string[];
  validation_status: ValidationStatus;
  quality_audit?: QualityAudit;
}

export interface KnowledgeBaseCatalog {
  goals: GoalCandidate[];
  skills: Array<{
    skill_id: string;
    skill_name: string;
    stage: string;
    skill_category: string;
    difficulty_level: string;
    estimated_learning_hours: number;
  }>;
  sources: Array<{
    id: string;
    name: string;
    url: string;
    license: string;
  }>;
}

export interface ProgressLogEntry {
  id: number;
  roadmap_id: string;
  skill_id: string;
  skill_name?: string;
  previous_status: string;
  new_status: string;
  updated_at: string;
}

export interface SavedRoadmapSummary {
  roadmap_id: string;
  learner_name: string;
  target_goal: string;
  matched_goal_title: string;
  goal_type: string;
  created_at: string;
  updated_at: string;
  total_skills: number;
  completed_or_known_skills: number;
  in_progress_skills?: number;
  needs_review_skills?: number;
  progress_percent: number;
  total_remaining_hours?: number;
  hours_saved_by_prior_knowledge?: number;
  weekly_capacity_hours?: number;
  estimated_completion_date?: string;
  minutes_per_day?: number;
  study_days?: string[];
  recommended_first_skill_id?: string | null;
  recommended_first_skill_name?: string | null;
  recommended_first_skill_hours?: number;
  recommended_next_skill_id?: string | null;
  recommended_next_skill_name?: string | null;
  recommended_next_action?: string;
  recent_activity?: ProgressLogEntry[];
}

export interface EvaluationReportResponse {
  ml_evaluation: {
    status: string;
    task_description: string;
    sample_size: number;
    confusion_matrix: {
      true_positives: number;
      true_negatives: number;
      false_positives: number;
      false_negatives: number;
    };
    metrics: {
      accuracy: number;
      precision: number;
      recall: number;
      f1_score: number;
    };
    calibration_disclosure: string;
    cases: Array<{
      goal_id: string;
      skill_id: string;
      predicted: number;
      actual: number;
      outcome: string;
    }>;
  };
  roadmap_audit?: QualityAudit | null;
}
