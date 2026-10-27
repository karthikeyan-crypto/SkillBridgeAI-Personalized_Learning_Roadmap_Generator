"""
SkillBridge AI — Personalized Planning, Dependency Graph & Calendar Scheduling Engine.
Performs:
1. Authoritative knowledge base loading & goal matching with confidence detection
2. Goal-specific separation of strict_prerequisite, recommended_foundation, suggested_sequence, and parallel_allowed
3. Multi-factor pedagogical topological sorting (Kahn's algorithm + goal curriculum priority + unlocking power)
4. Orthogonal Knowledge Status, Readiness Status, and Completion Status resolution
5. Clear First Skill (START HERE), Next Skill (NEXT TO LEARN), Upcoming sequence, and Parallel options
6. Deterministic Python calendar scheduling respecting daily minutes, available weekdays, and strict prerequisites
"""

from __future__ import annotations
import json
import math
import os
import uuid
from collections import defaultdict, deque
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Set

from backend.models import (
    LearnerInputRequest,
    validate_roadmap_response_schema,
)

DATA_PATH = Path(__file__).resolve().parent / "data" / "knowledge_base.json"

STAGE_ORDER = [
    "Foundations",
    "Core Skills",
    "Supporting Skills & Tools",
    "Practical Application & Projects",
    "Testing & Evaluation",
    "Deployment & Production",
    "Advanced Specialization",
]

IMPORTANCE_RANK = {
    "essential": 0,
    "recommended": 1,
    "optional": 2,
}

DIFFICULTY_RANK = {
    "Beginner": 0,
    "Intermediate": 1,
    "Advanced": 2,
}

WEEKDAY_INDEX_TO_NAME = {
    0: "Mon",
    1: "Tue",
    2: "Wed",
    3: "Thu",
    4: "Fri",
    5: "Sat",
    6: "Sun",
}

SKILL_ALIASES = {
    "python": "python_programming",
    "python 3": "python_programming",
    "git": "git_version_control",
    "github": "git_version_control",
    "sql": "sql_databases",
    "postgresql": "sql_databases",
    "sqlite": "sql_databases",
    "linear algebra": "math_linear_algebra_calc",
    "calculus": "math_linear_algebra_calc",
    "math": "math_linear_algebra_calc",
    "statistics": "probability_statistics",
    "probability": "probability_statistics",
    "numpy": "numpy_scientific_computing",
    "pandas": "pandas_data_wrangling",
    "matplotlib": "data_visualization_eda",
    "seaborn": "data_visualization_eda",
    "data visualization": "data_visualization_eda",
    "eda": "data_visualization_eda",
    "machine learning": "classical_machine_learning",
    "scikit-learn": "classical_machine_learning",
    "sklearn": "classical_machine_learning",
    "ml": "classical_machine_learning",
    "feature engineering": "feature_engineering_pipelines",
    "model evaluation": "model_validation_metrics",
    "metrics": "model_validation_metrics",
    "deep learning": "deep_learning_neural_nets",
    "pytorch": "deep_learning_neural_nets",
    "neural networks": "deep_learning_neural_nets",
    "llm": "llm_foundations_prompting",
    "llms": "llm_foundations_prompting",
    "prompt engineering": "llm_foundations_prompting",
    "ollama": "llm_foundations_prompting",
    "embeddings": "embeddings_vector_search",
    "vector search": "embeddings_vector_search",
    "vector database": "embeddings_vector_search",
    "rag": "rag_architecture",
    "retrieval augmented generation": "rag_architecture",
    "ai evaluation": "ai_evaluation_testing",
    "llm agents": "llm_orchestration_agents",
    "tool calling": "llm_orchestration_agents",
    "fine tuning": "fine_tuning_peft",
    "fine-tuning": "fine_tuning_peft",
    "lora": "fine_tuning_peft",
    "flask": "api_engineering_rest",
    "rest api": "api_engineering_rest",
    "fastapi": "api_engineering_rest",
    "backend": "api_engineering_rest",
    "docker": "docker_deployment",
    "containers": "docker_deployment",
    "mlops": "mlops_monitoring",
    "html": "html_css_foundations",
    "css": "html_css_foundations",
    "html/css": "html_css_foundations",
    "tailwind": "html_css_foundations",
    "javascript": "javascript_es6",
    "js": "javascript_es6",
    "typescript": "typescript_fundamentals",
    "ts": "typescript_fundamentals",
    "react": "react_frontend_architecture",
    "accessibility": "Accessibility_responsive_ui",
    "wcag": "Accessibility_responsive_ui",
    "security": "web_security_auth",
    "web security": "web_security_auth",
    "testing": "automated_software_testing",
    "unit testing": "automated_software_testing",
    "pytest": "automated_software_testing",
}


class KnowledgeBase:
    """Loads and indexes the authoritative SkillBridge dataset."""

    def __init__(self, path: Path = DATA_PATH):
        with open(path, "r", encoding="utf-8") as f:
            self.raw = json.load(f)

        self.goals: Dict[str, Dict[str, Any]] = {
            g["goal_id"]: g for g in self.raw.get("goals", [])
        }
        self.skills: Dict[str, Dict[str, Any]] = {
            s["skill_id"]: s for s in self.raw.get("skills", [])
        }
        self.prerequisites: List[Dict[str, Any]] = self.raw.get("prerequisites", [])
        self.resources_by_skill: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for r in self.raw.get("resources", []):
            self.resources_by_skill[r["skill_id"]].append(r)

        self.projects: List[Dict[str, Any]] = self.raw.get("projects", [])
        self.evaluation_benchmark: List[Dict[str, Any]] = self.raw.get("evaluation_benchmark", [])

    def resolve_skill_id(self, name_or_id: str) -> Optional[str]:
        norm = name_or_id.strip().lower()
        if norm in self.skills:
            return norm
        if norm in SKILL_ALIASES:
            return SKILL_ALIASES[norm]
        for sid, sdata in self.skills.items():
            if sdata["skill_name"].lower() == norm or norm in sdata["skill_name"].lower():
                return sid
        return None

    def match_goal_with_confidence(
        self, goal_text: str, confirmed_goal_id: Optional[str] = None
    ) -> Tuple[Dict[str, Any], str, List[Dict[str, Any]]]:
        """
        Matches a learner's goal text against curated goals without silently assuming
        every custom goal is 'ai_engineer'.
        Returns (matched_goal_dict, match_status, candidate_goals).
        match_status is one of: 'confirmed' | 'exact' | 'matched' | 'uncertain'
        """
        all_candidates = [
            {
                "goal_id": g["goal_id"],
                "title": g["title"],
                "goal_type": g["goal_type"],
                "description": g["description"],
            }
            for g in self.raw.get("goals", [])
        ]

        if confirmed_goal_id and confirmed_goal_id in self.goals:
            return self.goals[confirmed_goal_id], "confirmed", all_candidates

        norm = goal_text.strip().lower()
        # 1. Exact ID or title match
        for gid, g in self.goals.items():
            if norm == gid or norm == g["title"].lower():
                return g, "exact", all_candidates

        # 2. Domain-specific project/objective intent detection (prioritize practical LLM/RAG project goals over broad career roles)
        if any(w in norm for w in ["rag", "retrieval-augmented", "retrieval augmented", "vector search app"]):
            return self.goals["rag_application"], "matched", all_candidates
        if any(
            phrase in norm
            for phrase in [
                "using an llm",
                "existing llm",
                "pretrained model",
                "pretrained llm",
                "deploy an ai application",
                "build an ai application",
                "build and deploy an ai",
                "llm application",
                "llm app",
            ]
        ):
            return self.goals["llm_app_deployment"], "matched", all_candidates

        # 3. Keyword scoring across curated goals
        scored: List[Tuple[float, Dict[str, Any]]] = []
        for gid, g in self.goals.items():
            score = 0.0
            for kw in g.get("keywords", []):
                if kw.lower() in norm:
                    score += 3.0
            for word in norm.replace("-", " ").split():
                if len(word) > 2 and word in g["title"].lower():
                    score += 1.0
                if len(word) > 3 and word in g["description"].lower():
                    score += 0.4
            scored.append((score, g))

        scored.sort(key=lambda x: x[0], reverse=True)
        best_score, best_goal = scored[0]

        if best_score >= 2.0:
            return best_goal, "matched", all_candidates

        # 4. Broad domain keyword fallback with explicit confidence check
        if any(w in norm for w in ["web", "frontend", "react", "html", "css", "javascript", "ui"]):
            if any(w in norm for w in ["full", "backend", "stack", "database", "api"]):
                return self.goals["fullstack_developer"], "matched", all_candidates
            return self.goals["web_dev_beginner"], "matched", all_candidates
        if any(w in norm for w in ["data scien", "statistics", "analytics", "pandas"]):
            return self.goals["data_scientist"], "matched", all_candidates
        if any(w in norm for w in ["machine learning", "ml engineer", "pytorch", "scikit"]):
            return self.goals["ml_engineer"], "matched", all_candidates
        if any(w in norm for w in ["ai engineer", "artificial intelligence"]):
            return self.goals["ai_engineer"], "matched", all_candidates

        # 5. Uncertain match — do NOT pretend certainty; return closest candidate with 'uncertain' status
        ranked_candidates = [
            {
                "goal_id": g["goal_id"],
                "title": g["title"],
                "goal_type": g["goal_type"],
                "description": g["description"],
            }
            for _, g in scored
        ]
        chosen = best_goal if best_score > 0 else self.goals["fullstack_developer"]
        return chosen, "uncertain", ranked_candidates

    def match_goal(self, goal_text: str) -> Dict[str, Any]:
        goal, _, _ = self.match_goal_with_confidence(goal_text)
        return goal

    def get_goal_aware_prerequisite_edges(
        self, goal_id: str, skill_ids: Optional[Set[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Resolves prerequisite relationships for a specific goal:
        - Distinguishes `strict_prerequisite` vs `recommended_foundation`
        - Evaluates `strict_for_goals` so practical project goals (like `llm_app_deployment`)
          are not forced through deep theoretical chains meant for broad career roles.
        """
        resolved_edges: List[Dict[str, Any]] = []
        for edge in self.prerequisites:
            target = edge["skill_id"]
            prereq = edge["prerequisite_skill_id"]
            if skill_ids is not None and (target not in skill_ids or prereq not in skill_ids):
                continue

            rel_type = edge.get("relationship_type", "strict_prerequisite")
            strict_goals = edge.get("strict_for_goals")
            if strict_goals is not None and rel_type == "strict_prerequisite":
                if goal_id not in strict_goals:
                    rel_type = "recommended_foundation"

            resolved_edges.append({
                "skill_id": target,
                "prerequisite_skill_id": prereq,
                "relationship_type": rel_type,
                "justification": edge.get("justification", ""),
            })
        return resolved_edges


def detect_circular_prerequisites(
    skill_ids: Set[str], edges: List[Dict[str, Any]]
) -> Tuple[bool, List[str]]:
    """
    Uses Kahn's algorithm on strict_prerequisite edges (or all provided edges if relationship_type
    is not specified) to detect circular prerequisite dependencies.
    Returns (has_cycle, topological_order_or_cycle_nodes).
    """
    in_degree: Dict[str, int] = {sid: 0 for sid in skill_ids}
    adj: Dict[str, List[str]] = defaultdict(list)

    for edge in edges:
        rel = edge.get("relationship_type", "strict_prerequisite")
        if rel != "strict_prerequisite":
            continue
        prereq = edge["prerequisite_skill_id"]
        target = edge["skill_id"]
        if prereq in skill_ids and target in skill_ids:
            adj[prereq].append(target)
            in_degree[target] += 1

    queue = deque(sorted([sid for sid, deg in in_degree.items() if deg == 0]))
    ordered: List[str] = []

    while queue:
        curr = queue.popleft()
        ordered.append(curr)
        for nxt in sorted(adj[curr]):
            in_degree[nxt] -= 1
            if in_degree[nxt] == 0:
                queue.append(nxt)

    if len(ordered) != len(skill_ids):
        cycle_nodes = sorted([sid for sid in skill_ids if sid not in ordered])
        return True, cycle_nodes

    return False, ordered


def compute_transitive_dependents_count(
    skill_ids: Set[str], strict_edges: List[Dict[str, Any]]
) -> Dict[str, Set[str]]:
    """Computes for each skill the set of all downstream skills that strictly depend on it."""
    adj: Dict[str, List[str]] = defaultdict(list)
    for edge in strict_edges:
        if edge.get("relationship_type", "strict_prerequisite") == "strict_prerequisite":
            p = edge["prerequisite_skill_id"]
            t = edge["skill_id"]
            if p in skill_ids and t in skill_ids:
                adj[p].append(t)

    descendants: Dict[str, Set[str]] = {}
    for sid in skill_ids:
        visited: Set[str] = set()
        queue = deque(adj[sid])
        while queue:
            curr = queue.popleft()
            if curr not in visited:
                visited.add(curr)
                for nxt in adj[curr]:
                    if nxt not in visited:
                        queue.append(nxt)
        descendants[sid] = visited
    return descendants


def topological_sort_skills(
    skill_ids: Set[str],
    edges: List[Dict[str, Any]],
    kb: KnowledgeBase,
    importance_map: Dict[str, str],
    matched_goal: Optional[Dict[str, Any]] = None,
    learner_prof_by_id: Optional[Dict[str, str]] = None,
) -> List[str]:
    """
    Authoritative multi-factor topological sorting engine:
    1. Never violates `strict_prerequisite` dependencies (Kahn's algorithm invariant).
    2. Prioritizes skills whose `recommended_foundation` skills have already been placed.
    3. Prioritizes essential > recommended > optional skills for the target goal.
    4. Uses the goal's curated `preferred_learning_sequence` from the knowledge base.
    5. Respects stage progression (`Foundations` -> `Core Skills` -> ...).
    6. Prioritizes skills that unlock more downstream dependent skills.
    7. Considers learner proficiency and difficulty level (`Beginner` -> `Intermediate` -> `Advanced`).
    """
    strict_in_degree: Dict[str, int] = {sid: 0 for sid in skill_ids}
    strict_adj: Dict[str, List[str]] = defaultdict(list)
    recommended_prereqs: Dict[str, Set[str]] = defaultdict(set)

    for edge in edges:
        prereq = edge["prerequisite_skill_id"]
        target = edge["skill_id"]
        if prereq not in skill_ids or target not in skill_ids:
            continue
        rel = edge.get("relationship_type", "strict_prerequisite")
        if rel == "strict_prerequisite":
            strict_adj[prereq].append(target)
            strict_in_degree[target] += 1
        elif rel == "recommended_foundation":
            recommended_prereqs[target].add(prereq)

    preferred_seq = (matched_goal or {}).get("preferred_learning_sequence", [])
    preferred_index_map: Dict[str, int] = {
        sid: idx for idx, sid in enumerate(preferred_seq)
    }

    transitive_deps = compute_transitive_dependents_count(skill_ids, edges)
    prof_map = learner_prof_by_id or {}

    scheduled_set: Set[str] = set()

    def priority_key(sid: str) -> Tuple[int, int, int, int, int, int, int, str]:
        srec = kb.skills[sid]
        stage_name = srec.get("stage", "Core Skills")
        stage_idx = STAGE_ORDER.index(stage_name) if stage_name in STAGE_ORDER else 99
        imp_idx = IMPORTANCE_RANK.get(importance_map.get(sid, "essential"), 1)
        pref_idx = preferred_index_map.get(sid, 500)

        # Count how many recommended foundations are not yet scheduled
        unmet_rec = sum(1 for r in recommended_prereqs[sid] if r not in scheduled_set)

        # If a skill is already known or needs review and unlocks downstream work, prioritize resolving it early
        prof = prof_map.get(sid, "none")
        unlocks_count = len(transitive_deps.get(sid, set()))
        review_unlock_boost = 0 if (prof in ("confident", "intermediate", "basic", "beginner") and unlocks_count > 0) else 1

        diff_idx = DIFFICULTY_RANK.get(srec.get("difficulty_level", "Intermediate"), 1)

        return (
            imp_idx if imp_idx == 2 else 0,  # Defer optional skills after essential/recommended
            stage_idx,
            unmet_rec,
            pref_idx,
            imp_idx,
            review_unlock_boost,
            -unlocks_count,
            sid,
        )

    available = [sid for sid, deg in strict_in_degree.items() if deg == 0]
    available.sort(key=priority_key)
    ordered: List[str] = []

    while available:
        curr = available.pop(0)
        ordered.append(curr)
        scheduled_set.add(curr)
        for nxt in strict_adj[curr]:
            strict_in_degree[nxt] -= 1
            if strict_in_degree[nxt] == 0:
                available.append(nxt)
        available.sort(key=priority_key)

    return ordered


def compute_personalized_skill_state(
    skill_record: Dict[str, Any],
    learner_proficiency: Optional[str],
    importance: str,
) -> Tuple[str, str, str, float, str]:
    """
    Determines initial orthogonal statuses:
    - knowledge_status: 'already_known' | 'needs_review' | 'unverified' | 'not_yet_learned'
    - completion_status: 'completed' | 'in_progress' | 'incomplete'
    - raw_display_status: initial display status before prerequisite readiness check
    - remaining_hours: adjusted study effort
    - status_note: explanation
    """
    base_hours = float(skill_record.get("estimated_learning_hours", 12))
    difficulty = skill_record.get("difficulty_level", "Intermediate")
    prof = (learner_proficiency or "none").lower()

    if prof == "confident":
        return (
            "already_known",
            "completed",
            "already_known",
            0.0,
            "Marked as already known based on reported independent proficiency. Includes a diagnostic verification check.",
        )

    if prof == "intermediate":
        if difficulty == "Beginner":
            return (
                "already_known",
                "completed",
                "already_known",
                0.0,
                "Already known: Your intermediate proficiency covers this foundational skill.",
            )
        review_hours = max(2.0, round(base_hours * 0.35, 1))
        return (
            "needs_review",
            "incomplete",
            "needs_review",
            review_hours,
            f"Targeted review ({review_hours}h vs {base_hours}h baseline) to bridge intermediate knowledge to production completion criteria.",
        )

    if prof == "basic":
        review_hours = max(3.0, round(base_hours * 0.6, 1))
        return (
            "needs_review",
            "incomplete",
            "needs_review",
            review_hours,
            f"Refinement required ({review_hours}h vs {base_hours}h baseline) to move from basic familiarity to hands-on mastery.",
        )

    if prof == "beginner":
        review_hours = max(4.0, round(base_hours * 0.75, 1))
        return (
            "needs_review",
            "incomplete",
            "needs_review",
            review_hours,
            f"Structured progression ({review_hours}h vs {base_hours}h baseline) building on your introductory exposure.",
        )

    if prof == "unknown":
        review_hours = max(4.0, round(base_hours * 0.8, 1))
        return (
            "unverified",
            "incomplete",
            "needs_review",
            review_hours,
            "Proficiency marked as unverified. Complete the diagnostic check or targeted review to verify mastery.",
        )

    if importance == "optional":
        return (
            "not_yet_learned",
            "incomplete",
            "optional",
            base_hours,
            "Optional specialization skill. Can be studied after essential and recommended milestones.",
        )

    return (
        "not_yet_learned",
        "incomplete",
        "ready_to_learn",
        base_hours,
        f"Full curriculum allocation ({base_hours}h estimated effort).",
    )


def resolve_ready_vs_blocked_statuses(
    skill_nodes: List[Dict[str, Any]],
) -> None:
    """
    Separates and resolves:
    1. `knowledge_status`: 'already_known' | 'needs_review' | 'unverified' | 'not_yet_learned'
    2. `completion_status`: 'completed' | 'in_progress' | 'incomplete'
    3. `readiness_status`: 'available_now' | 'waiting_for_prerequisites' | 'completed'
    4. `status`: unified visual state ('already_known', 'completed', 'in_progress', 'needs_review', 'ready_to_learn', 'optional', 'blocked')

    Key invariant:
    - A strict prerequisite P is satisfied ONLY when P's `completion_status == 'completed'`
      AND all of P's own strict prerequisites are also transitively satisfied!
    - A skill with `knowledge_status == 'needs_review'` (or `'unverified'`) is NOT yet completed,
      so it does NOT satisfy strict prerequisites for downstream skills until reviewed/completed,
      AND if its own strict prerequisites are incomplete, its `readiness_status` is `'waiting_for_prerequisites'`.
    - `recommended_foundation` edges never block readiness (`waiting_for_prerequisites`).
    """
    nodes_by_id: Dict[str, Dict[str, Any]] = {n["skill_id"]: n for n in skill_nodes}

    # Ensure orthogonal fields exist on every node (for backward compatibility with saved DB records)
    for node in skill_nodes:
        st = node.get("status", "ready_to_learn")
        if "knowledge_status" not in node:
            if st == "already_known":
                node["knowledge_status"] = "already_known"
            elif st == "needs_review":
                node["knowledge_status"] = "needs_review"
            else:
                node["knowledge_status"] = "not_yet_learned"

        if "completion_status" not in node:
            if st in ("completed", "already_known"):
                node["completion_status"] = "completed"
            elif st == "in_progress":
                node["completion_status"] = "in_progress"
            else:
                node["completion_status"] = "incomplete"

        if "strict_prerequisites" not in node:
            node["strict_prerequisites"] = list(node.get("prerequisites", []))
        if "recommended_foundations" not in node:
            node["recommended_foundations"] = []

    # Compute transitive satisfaction of strict prerequisites
    transitively_satisfied: Set[str] = set()
    changed = True
    while changed:
        changed = False
        for sid, node in nodes_by_id.items():
            if sid in transitively_satisfied:
                continue
            if node.get("completion_status") == "completed":
                strict_prereqs = [
                    p for p in node.get("strict_prerequisites", []) if p in nodes_by_id
                ]
                if all(p in transitively_satisfied for p in strict_prereqs):
                    transitively_satisfied.add(sid)
                    changed = True

    # Update readiness_status, unmet_strict_prerequisites, and unified status on every node
    for node in skill_nodes:
        sid = node["skill_id"]
        strict_prereqs = [
            p for p in node.get("strict_prerequisites", []) if p in nodes_by_id
        ]
        rec_foundations = [
            p for p in node.get("recommended_foundations", []) if p in nodes_by_id
        ]

        unmet_strict = [p for p in strict_prereqs if p not in transitively_satisfied]
        unmet_rec = [p for p in rec_foundations if p not in transitively_satisfied]

        node["unmet_strict_prerequisites"] = unmet_strict
        node["unmet_recommended_foundations"] = unmet_rec
        node["has_unverified_prerequisite"] = len(unmet_strict) > 0

        comp_status = node.get("completion_status", "incomplete")
        know_status = node.get("knowledge_status", "not_yet_learned")

        if len(unmet_strict) == 0:
            if comp_status == "completed":
                node["readiness_status"] = "completed"
                node["status"] = "already_known" if know_status == "already_known" else "completed"
            else:
                node["readiness_status"] = "available_now"
                if comp_status == "in_progress":
                    node["status"] = "in_progress"
                elif know_status in ("needs_review", "unverified"):
                    node["status"] = "needs_review"
                elif node.get("importance") == "optional":
                    node["status"] = "optional"
                else:
                    node["status"] = "ready_to_learn"
        else:
            # Has unmet strict prerequisites!
            node["readiness_status"] = "waiting_for_prerequisites"
            if comp_status == "completed" and know_status == "already_known":
                # Preserve the learner's reported known state while flagging the unverified foundation
                node["status"] = "already_known"
            else:
                # Even if knowledge_status == 'needs_review', it is waiting for a strict prerequisite
                node["status"] = "blocked"


def compute_recommendations_and_sequence(
    skill_nodes: List[Dict[str, Any]],
    matched_goal_title: str,
) -> Dict[str, Any]:
    """
    Computes:
    - `recommended_first_skill_id` (START HERE)
    - `recommended_next_skill_id` (NEXT TO LEARN)
    - `recommended_next_action`
    - `recommended_next_reason`
    - `learning_sequence` (complete step-by-step ordered learning sequence with rationale)
    - `parallel_learning_options` (independent skills available now that can be studied alongside START HERE)
    And annotates each skill_node with `recommendation_role` and `sequence_rationale`.
    """
    nodes_by_id = {n["skill_id"]: n for n in skill_nodes}

    # Separate active/incomplete skills from already completed/verified skills
    # Note: skill_nodes is already in authoritative topological & pedagogical order!
    incomplete_nodes = [
        n for n in skill_nodes if n.get("readiness_status") != "completed"
    ]

    # Available now candidates (all strict prerequisites transitively satisfied)
    available_now_nodes = [
        n for n in incomplete_nodes if n.get("readiness_status") == "available_now"
    ]

    # Sort available_now_nodes so that:
    # 1. Any 'in_progress' skill comes first
    # 2. Essential > Recommended > Optional
    # 3. Skills with 0 unmet recommended foundations come before those with unmet recommended foundations
    # 4. Authoritative sequence_order
    def available_sort_key(n: Dict[str, Any]) -> Tuple[int, int, int, int]:
        in_prog = 0 if n.get("completion_status") == "in_progress" else 1
        imp = IMPORTANCE_RANK.get(n.get("importance", "essential"), 1)
        unmet_rec_count = len(n.get("unmet_recommended_foundations", []))
        return (in_prog, imp, unmet_rec_count, n["sequence_order"])

    available_now_nodes.sort(key=available_sort_key)

    first_node = available_now_nodes[0] if available_now_nodes else None
    recommended_first_skill_id = first_node["skill_id"] if first_node else None

    # Determine NEXT TO LEARN (`recommended_next_skill_id`):
    # Simulate completing `recommended_first_skill_id` to see what becomes available or is next in priority order
    next_node: Optional[Dict[str, Any]] = None
    unlocked_by_first: List[str] = []

    if first_node is not None:
        first_id = first_node["skill_id"]
        # Which currently blocked skills have `first_id` as their ONLY unmet strict prerequisite?
        for cand in incomplete_nodes:
            if cand["skill_id"] == first_id:
                continue
            unmet = cand.get("unmet_strict_prerequisites", [])
            if unmet == [first_id]:
                unlocked_by_first.append(cand["skill_id"])

        # Candidate pool for NEXT TO LEARN:
        # Other currently available skills + skills immediately unlocked by completing first_node
        next_candidates: List[Dict[str, Any]] = []
        for cand in incomplete_nodes:
            cid = cand["skill_id"]
            if cid == first_id:
                continue
            if cand.get("readiness_status") == "available_now" or cid in unlocked_by_first:
                next_candidates.append(cand)

        if not next_candidates:
            # Fallback to the next incomplete node in topological sequence
            remaining = [n for n in incomplete_nodes if n["skill_id"] != first_id]
            next_candidates = remaining

        if next_candidates:
            # Sort next_candidates by:
            # 1. Essential > Recommended > Optional
            # 2. Unmet recommended foundations after first_id is completed
            # 3. Authoritative topological sequence_order
            def next_sort_key(n: Dict[str, Any]) -> Tuple[int, int, int]:
                imp = IMPORTANCE_RANK.get(n.get("importance", "essential"), 1)
                unmet_rec = [
                    r
                    for r in n.get("unmet_recommended_foundations", [])
                    if r != first_id
                ]
                return (imp, len(unmet_rec), n["sequence_order"])

            next_candidates.sort(key=next_sort_key)
            next_node = next_candidates[0]

    recommended_next_skill_id = next_node["skill_id"] if next_node else None

    # Identify parallel learning options:
    # Other skills that are ALREADY `available_now` right now (independent of `recommended_first_skill_id`)
    parallel_options: List[Dict[str, Any]] = []
    for n in available_now_nodes:
        if n["skill_id"] == recommended_first_skill_id:
            continue
        if n.get("parallel_allowed", True):
            parallel_options.append({
                "skill_id": n["skill_id"],
                "skill_name": n["skill_name"],
                "stage": n["stage"],
                "importance": n["importance"],
                "estimated_hours": n["estimated_hours"],
                "reason": (
                    f"No unmet prerequisites — can be studied in parallel alongside "
                    f"{first_node['skill_name'] if first_node else 'your primary track'} if schedule permits."
                ),
            })

    # Build human-readable explanations for START HERE and NEXT TO LEARN
    if first_node is None:
        recommended_next_action = (
            f"All {len(skill_nodes)} skills in your {matched_goal_title} roadmap are completed!"
        )
        recommended_next_reason = (
            "You have completed or verified every skill in this curriculum. You may review advanced specializations or start a capstone milestone."
        )
    else:
        first_unlocks_names = [
            nodes_by_id[uid]["skill_name"]
            for uid in first_node.get("dependent_skills", [])
            if uid in nodes_by_id
        ]
        unlocks_clause = (
            f" and directly unlocks {', '.join(first_unlocks_names[:3])}"
            if first_unlocks_names
            else ""
        )
        if first_node.get("knowledge_status") in ("needs_review", "unverified"):
            recommended_next_action = (
                f"Start Here: Review & Verify {first_node['skill_name']} ({first_node['estimated_hours']}h)"
            )
            first_why = (
                f"You reported partial or unverified proficiency in {first_node['skill_name']}. "
                f"Completing this targeted review ({first_node['estimated_hours']}h vs {first_node['baseline_hours']}h baseline) "
                f"verifies your foundation{unlocks_clause}."
            )
        else:
            recommended_next_action = (
                f"Start Here: {first_node['skill_name']} ({first_node['estimated_hours']}h)"
            )
            first_why = (
                f"{first_node['skill_name']} is the highest-priority {first_node['importance']} "
                f"{first_node['stage'].lower()} skill with all strict prerequisites satisfied{unlocks_clause}."
            )

        if next_node is not None:
            if next_node["skill_id"] in unlocked_by_first:
                next_why = (
                    f"Next to Learn is {next_node['skill_name']} ({next_node['estimated_hours']}h) because completing "
                    f"{first_node['skill_name']} satisfies its strict prerequisite."
                )
            elif first_node["skill_id"] in next_node.get("recommended_foundations", []):
                next_why = (
                    f"Next to Learn is {next_node['skill_name']} ({next_node['estimated_hours']}h), which builds upon "
                    f"{first_node['skill_name']} as a recommended foundation."
                )
            else:
                next_why = (
                    f"Next to Learn is {next_node['skill_name']} ({next_node['estimated_hours']}h), the next prioritized "
                    f"{next_node['importance']} skill in your {matched_goal_title} curriculum sequence "
                    f"(also eligible for parallel study)."
                )
            recommended_next_reason = f"{first_why} {next_why}"
        else:
            recommended_next_reason = first_why

    # Build the complete `learning_sequence` list and annotate every node
    learning_sequence: List[Dict[str, Any]] = []
    active_step_counter = 0

    for node in skill_nodes:
        sid = node["skill_id"]
        strict_p_names = [
            nodes_by_id[p]["skill_name"]
            for p in node.get("strict_prerequisites", [])
            if p in nodes_by_id
        ]
        rec_p_names = [
            nodes_by_id[p]["skill_name"]
            for p in node.get("recommended_foundations", [])
            if p in nodes_by_id
        ]
        dep_names = [
            nodes_by_id[d]["skill_name"]
            for d in node.get("dependent_skills", [])
            if d in nodes_by_id
        ]

        if node.get("readiness_status") == "completed":
            node["recommendation_role"] = "completed_or_known"
            node["active_step_number"] = None
            rationale = (
                f"Already verified/completed ({node['status_explanation']}). "
                + (
                    f"Satisfies prerequisite for: {', '.join(dep_names)}."
                    if dep_names
                    else "No downstream dependent skills blocked."
                )
            )
            node["sequence_rationale"] = rationale
            continue

        active_step_counter += 1
        node["active_step_number"] = active_step_counter

        if sid == recommended_first_skill_id:
            role = "start_here"
        elif sid == recommended_next_skill_id:
            role = "next_to_learn"
        elif active_step_counter <= 5:
            role = "upcoming"
        elif any(p["skill_id"] == sid for p in parallel_options):
            role = "parallel_option"
        else:
            role = "later_in_sequence"

        node["recommendation_role"] = role

        # Construct clear sequence rationale for why this skill appears at this point
        parts: List[str] = []
        if sid == recommended_first_skill_id:
            parts.append("Recommended First Action (START HERE): All strict prerequisites are satisfied.")
        elif sid == recommended_next_skill_id:
            parts.append("Recommended Second Action (NEXT TO LEARN): Immediately follows your first priority skill.")

        if strict_p_names:
            unmet_s_names = [
                nodes_by_id[p]["skill_name"]
                for p in node.get("unmet_strict_prerequisites", [])
                if p in nodes_by_id
            ]
            if unmet_s_names:
                parts.append(
                    f"Requires strict prerequisite(s) to be completed first: {', '.join(unmet_s_names)}."
                )
            else:
                parts.append(
                    f"All strict prerequisites satisfied ({', '.join(strict_p_names)})."
                )
        else:
            parts.append(f"Foundational {node['stage']} skill with no hard prerequisites.")

        if rec_p_names:
            parts.append(f"Recommended foundation(s): {', '.join(rec_p_names)}.")

        if dep_names:
            parts.append(f"Completing this unlocks: {', '.join(dep_names)}.")

        node["sequence_rationale"] = " ".join(parts)

        learning_sequence.append({
            "step_number": active_step_counter,
            "sequence_order": node["sequence_order"],
            "skill_id": sid,
            "skill_name": node["skill_name"],
            "stage": node["stage"],
            "importance": node["importance"],
            "status": node["status"],
            "knowledge_status": node["knowledge_status"],
            "readiness_status": node["readiness_status"],
            "completion_status": node["completion_status"],
            "recommendation_role": role,
            "estimated_hours": node["estimated_hours"],
            "strict_prerequisites": node.get("strict_prerequisites", []),
            "unmet_strict_prerequisites": node.get("unmet_strict_prerequisites", []),
            "recommended_foundations": node.get("recommended_foundations", []),
            "unlocks_skills": node.get("dependent_skills", []),
            "rationale": node["sequence_rationale"],
        })

    return {
        "recommended_first_skill_id": recommended_first_skill_id,
        "recommended_next_skill_id": recommended_next_skill_id,
        "recommended_next_action": recommended_next_action,
        "recommended_next_reason": recommended_next_reason,
        "learning_sequence": learning_sequence,
        "parallel_learning_options": parallel_options,
    }


def calculate_study_schedule(
    ordered_skill_nodes: List[Dict[str, Any]],
    minutes_per_day: int,
    study_days: List[str],
    start_date_str: Optional[str] = None,
    target_date_str: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Pure Python calendar scheduling engine.
    Schedules skills in the exact validated learning order so that:
    - START HERE (`recommended_first_skill_id`) is scheduled first
    - NEXT TO LEARN (`recommended_next_skill_id`) is scheduled immediately after
    - No dependent skill is ever scheduled before its strict prerequisites finish
    - Daily study minutes and allowed study weekdays are strictly respected.
    """
    today = date.today()
    if start_date_str:
        try:
            start_dt = date.fromisoformat(start_date_str[:10])
        except ValueError:
            start_dt = today
    else:
        start_dt = today

    target_dt: Optional[date] = None
    if target_date_str:
        try:
            target_dt = date.fromisoformat(target_date_str[:10])
        except ValueError:
            target_dt = None

    hours_per_study_day = round(minutes_per_day / 60.0, 2)
    allowed_weekdays = set(study_days)
    weekly_capacity_hours = round(hours_per_study_day * len(allowed_weekdays), 1)

    def next_valid_study_day(d: date) -> date:
        curr = d
        for _ in range(14):
            if WEEKDAY_INDEX_TO_NAME[curr.weekday()] in allowed_weekdays:
                return curr
            curr += timedelta(days=1)
        return d

    current_date = next_valid_study_day(start_dt)
    remaining_day_capacity = hours_per_study_day

    schedule_entries: List[Dict[str, Any]] = []
    completion_date_by_skill: Dict[str, date] = {}

    total_active_hours = 0.0
    essential_only_hours = 0.0
    total_baseline_hours = 0.0
    hours_saved_by_prior_knowledge = 0.0

    for node in ordered_skill_nodes:
        sid = node["skill_id"]
        baseline = float(node.get("baseline_hours", node.get("estimated_hours", 0)))
        remaining = float(node.get("estimated_hours", 0))
        total_baseline_hours += baseline
        hours_saved_by_prior_knowledge += max(0.0, baseline - remaining)

        if node.get("readiness_status") == "completed" or remaining <= 0:
            completion_date_by_skill[sid] = start_dt
            schedule_entries.append({
                "skill_id": sid,
                "skill_name": node["skill_name"],
                "stage": node["stage"],
                "importance": node["importance"],
                "status": node["status"],
                "knowledge_status": node.get("knowledge_status", "already_known"),
                "readiness_status": node.get("readiness_status", "completed"),
                "recommendation_role": node.get("recommendation_role", "completed_or_known"),
                "active_step_number": node.get("active_step_number"),
                "estimated_hours": 0.0,
                "baseline_hours": baseline,
                "prerequisites": node.get("strict_prerequisites", node.get("prerequisites", [])),
                "recommended_foundations": node.get("recommended_foundations", []),
                "planned_start_date": start_dt.isoformat(),
                "planned_completion_date": start_dt.isoformat(),
                "study_sessions_count": 0,
                "workload_distribution": "Completed / Verified prior proficiency (0h required)",
                "parallel_eligible": bool(node.get("parallel_allowed", False)),
            })
            node["scheduled_period"] = "Already Known / Completed — 0h required"
            continue

        total_active_hours += remaining
        if node["importance"] == "essential":
            essential_only_hours += remaining

        # Guarantee this skill never starts before all its strict prerequisites have finished
        for prereq_id in node.get("strict_prerequisites", node.get("prerequisites", [])):
            prereq_end = completion_date_by_skill.get(prereq_id)
            if prereq_end and current_date < prereq_end:
                current_date = next_valid_study_day(prereq_end)
                remaining_day_capacity = hours_per_study_day

        hours_left = remaining
        skill_start_date: Optional[date] = None
        skill_end_date: Optional[date] = None
        sessions_count = 0

        while hours_left > 1e-6:
            current_date = next_valid_study_day(current_date)
            if remaining_day_capacity <= 1e-6:
                current_date = next_valid_study_day(current_date + timedelta(days=1))
                remaining_day_capacity = hours_per_study_day

            if skill_start_date is None:
                skill_start_date = current_date

            allocated = min(hours_left, remaining_day_capacity)
            hours_left -= allocated
            remaining_day_capacity -= allocated
            sessions_count += 1
            skill_end_date = current_date

            if remaining_day_capacity <= 1e-6 and hours_left > 1e-6:
                current_date = next_valid_study_day(current_date + timedelta(days=1))
                remaining_day_capacity = hours_per_study_day

        final_start = skill_start_date or start_dt
        final_end = skill_end_date or start_dt
        completion_date_by_skill[sid] = final_end

        s_start = final_start.isoformat()
        s_end = final_end.isoformat()
        node["scheduled_period"] = (
            f"{s_start} to {s_end} ({sessions_count} session{'s' if sessions_count != 1 else ''})"
        )

        schedule_entries.append({
            "skill_id": sid,
            "skill_name": node["skill_name"],
            "stage": node["stage"],
            "importance": node["importance"],
            "status": node["status"],
            "knowledge_status": node.get("knowledge_status", "not_yet_learned"),
            "readiness_status": node.get("readiness_status", "available_now"),
            "recommendation_role": node.get("recommendation_role", "later_in_sequence"),
            "active_step_number": node.get("active_step_number"),
            "estimated_hours": round(remaining, 1),
            "baseline_hours": round(baseline, 1),
            "prerequisites": node.get("strict_prerequisites", node.get("prerequisites", [])),
            "recommended_foundations": node.get("recommended_foundations", []),
            "planned_start_date": s_start,
            "planned_completion_date": s_end,
            "study_sessions_count": sessions_count,
            "workload_distribution": (
                f"{sessions_count} session{'s' if sessions_count != 1 else ''} @ up to "
                f"{minutes_per_day} min/day ({', '.join(study_days)})"
            ),
            "parallel_eligible": bool(node.get("parallel_allowed", False)),
        })

    estimated_completion_date = (
        schedule_entries[-1]["planned_completion_date"]
        if schedule_entries
        else start_dt.isoformat()
    )
    active_entries = [e for e in schedule_entries if e["estimated_hours"] > 0]
    if active_entries:
        estimated_completion_date = max(e["planned_completion_date"] for e in active_entries)

    total_weeks = round(total_active_hours / max(weekly_capacity_hours, 0.5), 1)

    is_feasible = True
    deadline_warning: Optional[str] = None
    alternatives: List[str] = []

    if target_dt is not None:
        est_end_dt = date.fromisoformat(estimated_completion_date)
        if target_dt < start_dt:
            is_feasible = False
            deadline_warning = (
                f"Target date ({target_dt.isoformat()}) is earlier than the start date ({start_dt.isoformat()})."
            )
        elif est_end_dt > target_dt:
            is_feasible = False
            avail_days_count = 0
            probe = start_dt
            while probe <= target_dt:
                if WEEKDAY_INDEX_TO_NAME[probe.weekday()] in allowed_weekdays:
                    avail_days_count += 1
                probe += timedelta(days=1)

            available_hours_before_deadline = round(avail_days_count * hours_per_study_day, 1)
            shortfall_hours = round(total_active_hours - available_hours_before_deadline, 1)
            required_daily_minutes = (
                math.ceil((total_active_hours * 60.0) / max(avail_days_count, 1))
                if avail_days_count > 0
                else 999
            )

            deadline_warning = (
                f"Target date {target_dt.isoformat()} provides {avail_days_count} study days "
                f"({available_hours_before_deadline}h capacity at {minutes_per_day} min/day), "
                f"but the personalized plan requires ~{round(total_active_hours, 1)}h "
                f"(a shortfall of {shortfall_hours}h). Your stated study hours and deadline were preserved without silent modification."
            )
            alternatives = [
                f"Option 1 (Extend Target Date): Move target completion date to {estimated_completion_date} while keeping {minutes_per_day} min/day on {', '.join(study_days)}.",
                f"Option 2 (Increase Study Time): Increase study allocation to ~{required_daily_minutes} min/day across your {len(allowed_weekdays)} selected study days.",
                f"Option 3 (Essential Skills First): Focus strictly on Essential skills first ({round(essential_only_hours, 1)}h total effort) and defer Recommended/Optional specializations.",
            ]

    return {
        "start_date": start_dt.isoformat(),
        "target_completion_date": target_dt.isoformat() if target_dt else None,
        "estimated_completion_date": estimated_completion_date,
        "is_estimate_notice": "All learning durations and completion dates are estimates based on curated skill benchmarks and your stated study capacity.",
        "minutes_per_day": minutes_per_day,
        "study_days": study_days,
        "weekly_capacity_hours": weekly_capacity_hours,
        "total_baseline_hours": round(total_baseline_hours, 1),
        "hours_saved_by_prior_knowledge": round(hours_saved_by_prior_knowledge, 1),
        "total_remaining_hours": round(total_active_hours, 1),
        "essential_only_hours": round(essential_only_hours, 1),
        "estimated_weeks": total_weeks,
        "is_deadline_feasible": is_feasible,
        "deadline_warning": deadline_warning,
        "deadline_alternatives": alternatives,
        "entries": schedule_entries,
    }


def build_personalized_roadmap(
    req: LearnerInputRequest,
    kb: KnowledgeBase,
    llm_selection: Optional[Dict[str, Any]] = None,
    generation_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Combines the validated Ollama structured output (or explicitly labelled fallback)
    with the authoritative SkillBridge dataset, goal-specific prerequisite rules,
    multi-factor topological priority solver, and deterministic Python schedule calculator.
    """
    matched_goal, match_status, candidate_goals = kb.match_goal_with_confidence(
        req.target_goal, confirmed_goal_id=req.confirmed_goal_id
    )

    if llm_selection and llm_selection.get("matched_goal_id") in kb.goals and not req.confirmed_goal_id:
        llm_gid = llm_selection["matched_goal_id"]
        if match_status == "uncertain":
            matched_goal = kb.goals[llm_gid]
            if llm_selection.get("goal_match_confidence") == "high":
                match_status = "llm_matched"

    goal_id = matched_goal["goal_id"]
    goal_type = (
        llm_selection.get("goal_type")
        if llm_selection and llm_selection.get("goal_type") in ("career_role", "technical_objective", "project_goal")
        else matched_goal["goal_type"]
    )

    # Map learner's current skills to canonical skill IDs + track custom skills
    learner_prof_by_id: Dict[str, str] = {}
    unmatched_custom_skills: List[Dict[str, str]] = []
    for cskill in req.current_skills:
        resolved_id = (
            cskill.skill_id
            if cskill.skill_id in kb.skills
            else kb.resolve_skill_id(cskill.skill_name)
        )
        if resolved_id:
            learner_prof_by_id[resolved_id] = cskill.proficiency
        else:
            unmatched_custom_skills.append({
                "skill_name": cskill.skill_name,
                "proficiency": cskill.proficiency,
            })

    # Determine the goal-specific skill set and importance levels
    importance_map: Dict[str, str] = {}
    tailored_rationale_map: Dict[str, str] = {}

    for sid in matched_goal.get("essential_skills", []):
        if sid in kb.skills:
            importance_map[sid] = "essential"
    for sid in matched_goal.get("recommended_skills", []):
        if sid in kb.skills and sid not in importance_map:
            importance_map[sid] = "recommended"
    for sid in matched_goal.get("optional_skills", []):
        if sid in kb.skills and sid not in importance_map:
            importance_map[sid] = "optional"

    # Incorporate LLM-selected skills & rationales (verified against KB and goal relevance)
    hallucinated_skills_rejected: List[str] = []
    goal_all_curated = (
        set(matched_goal.get("essential_skills", []))
        | set(matched_goal.get("recommended_skills", []))
        | set(matched_goal.get("optional_skills", []))
    )

    if llm_selection and isinstance(llm_selection.get("selected_skills"), list):
        for item in llm_selection["selected_skills"]:
            if not isinstance(item, dict):
                continue
            raw_sid = str(item.get("skill_id", "")).strip()
            resolved = raw_sid if raw_sid in kb.skills else kb.resolve_skill_id(raw_sid)
            if resolved and resolved in kb.skills:
                # Only add extra LLM skill if it's part of the curated goal or custom uncertain goal
                if resolved not in importance_map and (
                    resolved in goal_all_curated or match_status == "uncertain"
                ):
                    imp = item.get("importance", "recommended")
                    importance_map[resolved] = imp if imp in IMPORTANCE_RANK else "recommended"
                if item.get("tailored_rationale"):
                    tailored_rationale_map[resolved] = str(item["tailored_rationale"])
            elif raw_sid:
                hallucinated_skills_rejected.append(raw_sid)

    # Preserve any curated skill the learner explicitly reported so their knowledge is visible in the graph
    for l_sid in learner_prof_by_id:
        if l_sid in kb.skills and l_sid not in importance_map:
            importance_map[l_sid] = "optional"

    # Compute transitive closure ONLY for goal-aware `strict_prerequisite` relationships!
    # Do NOT pull in `recommended_foundation` skills that aren't part of the goal (e.g., deep learning for a simple LLM app).
    all_goal_edges = kb.get_goal_aware_prerequisite_edges(goal_id)
    added_missing_prereqs: List[str] = []
    changed = True
    while changed:
        changed = False
        for edge in all_goal_edges:
            if edge["relationship_type"] != "strict_prerequisite":
                continue
            target = edge["skill_id"]
            prereq = edge["prerequisite_skill_id"]
            if target in importance_map and prereq in kb.skills and prereq not in importance_map:
                importance_map[prereq] = (
                    "essential" if importance_map[target] == "essential" else "recommended"
                )
                added_missing_prereqs.append(prereq)
                changed = True

    selected_skill_ids = set(importance_map.keys())

    # Filter prerequisite edges to selected skills in the plan
    plan_edges = kb.get_goal_aware_prerequisite_edges(goal_id, selected_skill_ids)

    # Verify DAG (no circular strict dependencies)
    has_cycle, cycle_info = detect_circular_prerequisites(selected_skill_ids, plan_edges)
    if has_cycle:
        plan_edges = [e for e in plan_edges if e["skill_id"] != e["prerequisite_skill_id"]]

    # Authoritative multi-factor topological sort
    ordered_ids = topological_sort_skills(
        skill_ids=selected_skill_ids,
        edges=plan_edges,
        kb=kb,
        importance_map=importance_map,
        matched_goal=matched_goal,
        learner_prof_by_id=learner_prof_by_id,
    )

    # Build lookup maps for strict prerequisites, recommended foundations, and dependents
    strict_prereqs_by_skill: Dict[str, List[str]] = defaultdict(list)
    rec_foundations_by_skill: Dict[str, List[str]] = defaultdict(list)
    all_prereqs_by_skill: Dict[str, List[str]] = defaultdict(list)
    strict_dependents_by_skill: Dict[str, List[str]] = defaultdict(list)

    for edge in plan_edges:
        t = edge["skill_id"]
        p = edge["prerequisite_skill_id"]
        all_prereqs_by_skill[t].append(p)
        if edge["relationship_type"] == "strict_prerequisite":
            strict_prereqs_by_skill[t].append(p)
            strict_dependents_by_skill[p].append(t)
        else:
            rec_foundations_by_skill[t].append(p)

    # Construct skill_nodes with resources and orthogonal statuses
    skill_nodes: List[Dict[str, Any]] = []
    all_plan_resources: List[Dict[str, Any]] = []
    seen_resource_ids: Set[str] = set()

    for order_idx, sid in enumerate(ordered_ids, start=1):
        srec = kb.skills[sid]
        imp = importance_map.get(sid, "recommended")
        learner_prof = learner_prof_by_id.get(sid)

        know_status, comp_status, raw_status, adj_hours, status_note = (
            compute_personalized_skill_state(srec, learner_prof, imp)
        )

        skill_resources = list(kb.resources_by_skill.get(sid, []))
        if req.preferences.prefer_free_resources:
            free_only = [
                r for r in skill_resources if r.get("free_or_paid", "Free").lower() == "free"
            ]
            if free_only:
                skill_resources = free_only

        for r in skill_resources:
            if r["resource_id"] not in seen_resource_ids:
                seen_resource_ids.add(r["resource_id"])
                all_plan_resources.append(r)

        why_text = tailored_rationale_map.get(sid) or srec.get("why_relevant", "")

        skill_nodes.append({
            "skill_id": sid,
            "skill_name": srec["skill_name"],
            "sequence_order": order_idx,
            "active_step_number": None,
            "stage": srec["stage"],
            "skill_category": srec["skill_category"],
            "difficulty_level": srec["difficulty_level"],
            "importance": imp,
            "parallel_allowed": bool(srec.get("parallel_allowed", True)),
            "description": srec["description"],
            "why_relevant": why_text,
            "learner_proficiency": learner_prof or "none",
            "knowledge_status": know_status,
            "completion_status": comp_status,
            "readiness_status": "available_now",
            "status": raw_status,
            "recommendation_role": "later_in_sequence",
            "status_explanation": status_note,
            "sequence_rationale": "",
            "baseline_hours": float(srec["estimated_learning_hours"]),
            "estimated_hours": adj_hours,
            "prerequisites": strict_prereqs_by_skill[sid],
            "strict_prerequisites": strict_prereqs_by_skill[sid],
            "recommended_foundations": rec_foundations_by_skill[sid],
            "unmet_strict_prerequisites": [],
            "unmet_recommended_foundations": [],
            "has_unverified_prerequisite": False,
            "dependent_skills": strict_dependents_by_skill[sid],
            "completion_criteria": srec["completion_criteria"],
            "diagnostic_check": srec.get("diagnostic_check", ""),
            "suggested_exercises": srec.get("suggested_exercises", []),
            "mini_project": srec.get("mini_project", ""),
            "subtopics": srec.get("subtopics", []),
            "resources": skill_resources,
            "source_reference": srec.get("source_reference", ""),
            "last_verified_date": srec.get("last_verified_date", "2025-02-15"),
            "scheduled_period": "",
        })

    # 1. Resolve orthogonal readiness vs blocked statuses
    resolve_ready_vs_blocked_statuses(skill_nodes)

    # 2. Compute START HERE, NEXT TO LEARN, learning_sequence, and parallel options
    rec_bundle = compute_recommendations_and_sequence(
        skill_nodes=skill_nodes,
        matched_goal_title=matched_goal["title"],
    )

    # 3. Re-order incomplete nodes in `skill_nodes` so START HERE is Step #1 of active work
    # and NEXT TO LEARN is Step #2 while preserving strict prerequisite invariants
    seq_order_lookup = {
        item["skill_id"]: idx
        for idx, item in enumerate(rec_bundle["learning_sequence"], start=1)
    }
    # Ensure START HERE and NEXT TO LEARN lead the active schedule
    def schedule_node_order_key(n: Dict[str, Any]) -> Tuple[int, int, int]:
        if n.get("readiness_status") == "completed":
            return (0, 0, n["sequence_order"])
        role = n.get("recommendation_role", "later_in_sequence")
        role_rank = {
            "start_here": 1,
            "next_to_learn": 2,
            "upcoming": 3,
            "parallel_option": 4,
            "later_in_sequence": 5,
        }.get(role, 5)
        return (1, role_rank, seq_order_lookup.get(n["skill_id"], n["sequence_order"]))

    # Only reorder if doing so doesn't violate any strict prerequisite
    candidate_sorted = sorted(skill_nodes, key=schedule_node_order_key)
    pos_map = {n["skill_id"]: idx for idx, n in enumerate(candidate_sorted)}
    violates_strict = any(
        pos_map[e["prerequisite_skill_id"]] > pos_map[e["skill_id"]]
        for e in plan_edges
        if e["relationship_type"] == "strict_prerequisite"
    )
    if not violates_strict:
        skill_nodes = candidate_sorted
        for new_idx, n in enumerate(skill_nodes, start=1):
            n["sequence_order"] = new_idx
        rec_bundle = compute_recommendations_and_sequence(
            skill_nodes=skill_nodes,
            matched_goal_title=matched_goal["title"],
        )

    # 4. Calculate deterministic calendar schedule matching the exact validated learning order
    schedule_data = calculate_study_schedule(
        ordered_skill_nodes=skill_nodes,
        minutes_per_day=req.study_time.minutes_per_day,
        study_days=req.study_time.study_days,
        start_date_str=req.study_time.start_date,
        target_date_str=req.study_time.target_completion_date,
    )

    # Group into learning stages
    stages_map: Dict[str, List[str]] = defaultdict(list)
    for n in skill_nodes:
        stages_map[n["stage"]].append(n["skill_id"])

    learning_stages = []
    for st_name in STAGE_ORDER:
        if st_name in stages_map:
            st_nodes = [n for n in skill_nodes if n["stage"] == st_name]
            learning_stages.append({
                "stage_name": st_name,
                "skill_ids": stages_map[st_name],
                "total_hours": round(sum(n["estimated_hours"] for n in st_nodes), 1),
                "completed_or_known_count": sum(
                    1 for n in st_nodes if n.get("readiness_status") == "completed"
                ),
                "total_count": len(st_nodes),
            })

    relevant_projects = [
        p
        for p in kb.projects
        if p.get("relevant_goal") == matched_goal["goal_id"]
        or len(set(p.get("required_skills", [])) & selected_skill_ids) >= 4
    ]

    known_count = sum(1 for n in skill_nodes if n.get("readiness_status") == "completed")
    review_count = sum(
        1 for n in skill_nodes if n.get("knowledge_status") in ("needs_review", "unverified")
    )

    first_skill_name = (
        next(
            (
                n["skill_name"]
                for n in skill_nodes
                if n["skill_id"] == rec_bundle["recommended_first_skill_id"]
            ),
            "Foundations",
        )
    )
    next_skill_name = (
        next(
            (
                n["skill_name"]
                for n in skill_nodes
                if n["skill_id"] == rec_bundle["recommended_next_skill_id"]
            ),
            None,
        )
    )

    default_summary = (
        f"Personalized {matched_goal['title']} roadmap for {req.learner_name}: "
        f"{len(skill_nodes)} validated skills across {len(learning_stages)} stages. "
        f"Start first with {first_skill_name}"
        + (f", followed next by {next_skill_name}. " if next_skill_name else ". ")
        + f"Accounts for {known_count} verified known skill{'s' if known_count != 1 else ''} and "
        f"{review_count} skill{'s' if review_count != 1 else ''} scoped for review, "
        f"saving {schedule_data['hours_saved_by_prior_knowledge']}h of redundant study. "
        f"At {req.study_time.minutes_per_day} min/day across {len(req.study_time.study_days)} study days/week "
        f"({schedule_data['weekly_capacity_hours']}h/week), estimated completion is {schedule_data['estimated_completion_date']}."
    )

    summary_text = (
        llm_selection.get("personalized_summary")
        if llm_selection and llm_selection.get("personalized_summary")
        else default_summary
    )

    assumptions = [
        f"Authoritative learning sequence ordered by strict prerequisites, recommended foundations, and {matched_goal['title']} curriculum priority.",
        f"Study schedule calculated strictly at {req.study_time.minutes_per_day} min/day on {', '.join(req.study_time.study_days)} ({schedule_data['weekly_capacity_hours']}h/week).",
        "Skills with partial or unverified prerequisites are held from primary recommendation until their strict foundations are verified.",
    ]
    if llm_selection and isinstance(llm_selection.get("assumptions"), list):
        for a in llm_selection["assumptions"][:3]:
            if a and a not in assumptions:
                assumptions.append(str(a))

    missing_info: List[str] = []
    if match_status == "uncertain":
        missing_info.append(
            f"Custom goal '{req.target_goal}' did not directly match a pre-built role title; mapped to closest curated curriculum '{matched_goal['title']}'. Please confirm or select an alternative goal if needed."
        )
    for sk in req.current_skills:
        if sk.proficiency == "unknown":
            missing_info.append(
                f"Skill '{sk.skill_name}' was marked with unknown proficiency; a diagnostic check has been attached to verify your level."
            )
    for n in skill_nodes:
        if n.get("has_unverified_prerequisite") and n.get("knowledge_status") in ("already_known", "needs_review"):
            missing_info.append(
                f"You reported experience in '{n['skill_name']}', but its strict prerequisite(s) ({', '.join(n['unmet_strict_prerequisites'])}) are not yet verified. Complete the prerequisite first to unlock dependent topics."
            )
    if unmatched_custom_skills:
        names = ", ".join(u["skill_name"] for u in unmatched_custom_skills)
        missing_info.append(
            f"Custom reported skill(s) ({names}) are recorded in your learner profile; core roadmap nodes are drawn from verified O*NET/ESCO technical records."
        )
    if not req.study_time.target_completion_date:
        missing_info.append(
            "No target completion date was specified; estimated completion date was derived from your weekly study capacity."
        )

    gen_meta = generation_metadata or {
        "engine": "ollama_local",
        "model": os.environ.get("OLLAMA_MODEL", "llama3.2:latest"),
        "repair_attempts": 0,
        "is_fallback": False,
    }

    roadmap_dict = {
        "roadmap_id": f"rm_{uuid.uuid4().hex[:12]}",
        "created_at": datetime.utcnow().isoformat() + "Z",
        "learner_profile": {
            "learner_name": req.learner_name,
            "current_skills": [
                {
                    "skill_name": s.skill_name,
                    "proficiency": s.proficiency,
                    "resolved_skill_id": kb.resolve_skill_id(s.skill_name),
                }
                for s in req.current_skills
            ],
            "study_time": {
                "minutes_per_day": req.study_time.minutes_per_day,
                "study_days": req.study_time.study_days,
                "start_date": schedule_data["start_date"],
                "target_completion_date": req.study_time.target_completion_date,
            },
            "preferences": {
                "prefer_free_resources": req.preferences.prefer_free_resources,
                "preferred_language": req.preferences.preferred_language,
                "learning_style": req.preferences.learning_style,
            },
        },
        "target_goal": req.target_goal,
        "matched_goal_title": matched_goal["title"],
        "matched_goal_id": matched_goal["goal_id"],
        "goal_match_status": match_status,
        "goal_match_uncertain": match_status == "uncertain",
        "closest_goal_candidates": candidate_goals if match_status == "uncertain" else [],
        "goal_type": goal_type,
        "onet_reference": matched_goal.get("onet_code", "15-1252.00"),
        "esco_reference": matched_goal.get("esco_uri", ""),
        "summary": summary_text,
        "recommended_first_skill_id": rec_bundle["recommended_first_skill_id"],
        "recommended_next_skill_id": rec_bundle["recommended_next_skill_id"],
        "recommended_next_action": rec_bundle["recommended_next_action"],
        "recommended_next_reason": rec_bundle["recommended_next_reason"],
        "learning_sequence": rec_bundle["learning_sequence"],
        "parallel_learning_options": rec_bundle["parallel_learning_options"],
        "skill_nodes": skill_nodes,
        "prerequisite_edges": plan_edges,
        "learning_stages": learning_stages,
        "schedule": schedule_data,
        "resource_references": all_plan_resources,
        "project_milestones": relevant_projects,
        "assumptions": assumptions,
        "missing_information": missing_info,
        "validation_status": {
            "is_valid": True,
            "schema_validated": True,
            "has_circular_dependencies": has_cycle,
            "missing_essential_skills_repaired": added_missing_prereqs,
            "hallucinated_skills_rejected": hallucinated_skills_rejected,
            "resource_coverage_ratio": round(
                sum(1 for n in skill_nodes if len(n["resources"]) > 0) / max(len(skill_nodes), 1),
                3,
            ),
            "generation_mode": gen_meta.get("engine", "ollama_local"),
            "ollama_model": gen_meta.get("model", ""),
            "ollama_base_url": gen_meta.get(
                "base_url", os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
            ),
            "repair_attempts": gen_meta.get("repair_attempts", 0),
            "is_fallback": bool(gen_meta.get("is_fallback", False)),
            "fallback_reason": gen_meta.get("fallback_reason"),
            "confidence_note": (
                "Curriculum alignment score reflects structural match against curated O*NET/ESCO role-skill taxonomy. "
                "Self-reported model confidence is never treated as a calibrated probability."
            ),
        },
    }

    schema_errors = validate_roadmap_response_schema(roadmap_dict, set(kb.skills.keys()))
    if schema_errors:
        roadmap_dict["validation_status"]["is_valid"] = False
        roadmap_dict["validation_status"]["validation_errors"] = schema_errors

    return roadmap_dict
