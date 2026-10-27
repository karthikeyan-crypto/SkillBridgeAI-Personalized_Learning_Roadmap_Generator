"""
SkillBridge AI — Structured Output Models & JSON Schema Validation.
Uses Pydantic v2 when installed, with a deterministic stdlib validation layer
so schema validation and JSON Schema generation work in any Python 3.10+ environment.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any

try:
    from pydantic import BaseModel, Field, ValidationError as PydanticValidationError
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    PydanticValidationError = ValueError


VALID_PROFICIENCY_LEVELS = {
    "none",
    "beginner",
    "basic",
    "intermediate",
    "confident",
    "unknown",
}

VALID_NODE_STATUSES = {
    "already_known",
    "needs_review",
    "ready_to_learn",
    "in_progress",
    "completed",
    "optional",
    "blocked",
}

VALID_KNOWLEDGE_STATUSES = {
    "already_known",
    "needs_review",
    "unverified",
    "not_yet_learned",
}

VALID_READINESS_STATUSES = {
    "available_now",
    "waiting_for_prerequisites",
    "completed",
}

VALID_COMPLETION_STATUSES = {
    "completed",
    "in_progress",
    "incomplete",
}

VALID_IMPORTANCE_LEVELS = {"essential", "recommended", "optional"}

VALID_STUDY_DAYS = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}


class SchemaValidationError(Exception):
    """Raised when learner input or LLM structured output fails schema validation."""

    def __init__(self, message: str, errors: Optional[List[str]] = None):
        super().__init__(message)
        self.message = message
        self.errors = errors or [message]


@dataclass
class CurrentSkillInput:
    skill_name: str
    proficiency: str  # none | beginner | basic | intermediate | confident | unknown
    skill_id: Optional[str] = None

    def validate(self) -> List[str]:
        errs: List[str] = []
        if not self.skill_name or not self.skill_name.strip():
            errs.append("Skill name cannot be empty.")
        if self.proficiency not in VALID_PROFICIENCY_LEVELS:
            errs.append(
                f"Invalid proficiency '{self.proficiency}' for skill '{self.skill_name}'. "
                f"Expected one of {sorted(VALID_PROFICIENCY_LEVELS)}."
            )
        return errs


@dataclass
class StudyTimeInput:
    minutes_per_day: int = 90
    study_days: List[str] = field(default_factory=lambda: ["Mon", "Tue", "Wed", "Thu", "Fri"])
    start_date: Optional[str] = None
    target_completion_date: Optional[str] = None

    def validate(self) -> List[str]:
        errs: List[str] = []
        if not isinstance(self.minutes_per_day, (int, float)) or self.minutes_per_day < 15 or self.minutes_per_day > 720:
            errs.append("Study time per day must be between 15 and 720 minutes.")
        if not self.study_days or len(self.study_days) == 0:
            errs.append("At least one available study day per week must be selected.")
        for d in self.study_days:
            if d not in VALID_STUDY_DAYS:
                errs.append(f"Invalid study day '{d}'. Must be one of Mon, Tue, Wed, Thu, Fri, Sat, Sun.")
        return errs


@dataclass
class LearnerPreferences:
    prefer_free_resources: bool = False
    preferred_language: str = "English"
    learning_style: str = "balanced"  # hands_on | documentation | video_guided | balanced


@dataclass
class LearnerInputRequest:
    learner_name: str
    target_goal: str
    current_skills: List[CurrentSkillInput] = field(default_factory=list)
    study_time: StudyTimeInput = field(default_factory=StudyTimeInput)
    preferences: LearnerPreferences = field(default_factory=LearnerPreferences)
    allow_safe_fallback: bool = False
    confirmed_goal_id: Optional[str] = None
    preferred_ollama_model: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LearnerInputRequest":
        if not isinstance(data, dict):
            raise SchemaValidationError("Request payload must be a JSON object.")

        learner_name = str(data.get("learner_name", "")).strip()
        target_goal = str(data.get("target_goal", "")).strip()

        raw_skills = data.get("current_skills", [])
        if not isinstance(raw_skills, list):
            raise SchemaValidationError("'current_skills' must be a list.")

        skills: List[CurrentSkillInput] = []
        for item in raw_skills:
            if isinstance(item, dict):
                skills.append(
                    CurrentSkillInput(
                        skill_name=str(item.get("skill_name", "")).strip(),
                        proficiency=str(item.get("proficiency", "beginner")).strip().lower(),
                        skill_id=item.get("skill_id"),
                    )
                )

        raw_time = data.get("study_time", {}) or {}
        study_time = StudyTimeInput(
            minutes_per_day=int(raw_time.get("minutes_per_day", 90)),
            study_days=list(raw_time.get("study_days", ["Mon", "Tue", "Wed", "Thu", "Fri"])),
            start_date=raw_time.get("start_date") or None,
            target_completion_date=raw_time.get("target_completion_date") or None,
        )

        raw_prefs = data.get("preferences", {}) or {}
        preferences = LearnerPreferences(
            prefer_free_resources=bool(raw_prefs.get("prefer_free_resources", False)),
            preferred_language=str(raw_prefs.get("preferred_language", "English")),
            learning_style=str(raw_prefs.get("learning_style", "balanced")),
        )

        confirmed_gid = data.get("confirmed_goal_id")
        pref_model = data.get("preferred_ollama_model")
        req = cls(
            learner_name=learner_name,
            target_goal=target_goal,
            current_skills=skills,
            study_time=study_time,
            preferences=preferences,
            allow_safe_fallback=bool(data.get("allow_safe_fallback", False)),
            confirmed_goal_id=str(confirmed_gid).strip() if confirmed_gid else None,
            preferred_ollama_model=str(pref_model).strip() if pref_model else None,
        )
        req.validate_or_raise()
        return req

    def validate_or_raise(self) -> None:
        errors: List[str] = []
        if not self.learner_name:
            errors.append("Learner name is required.")
        elif len(self.learner_name) > 80:
            errors.append("Learner name must be 80 characters or fewer.")

        if not self.target_goal or len(self.target_goal) < 3:
            errors.append("A clear learning goal (at least 3 characters) is required.")
        elif len(self.target_goal) > 240:
            errors.append("Learning goal must be 240 characters or fewer.")

        for sk in self.current_skills:
            errors.extend(sk.validate())

        errors.extend(self.study_time.validate())

        if errors:
            raise SchemaValidationError("Learner input validation failed.", errors)


def get_ollama_structured_json_schema() -> Dict[str, Any]:
    """
    Returns the strict JSON Schema passed to Ollama's `format` parameter
    so the local language model outputs a deterministic JSON structure.
    """
    return {
        "type": "object",
        "required": [
            "matched_goal_id",
            "goal_match_confidence",
            "goal_type",
            "personalized_summary",
            "selected_skills",
            "assumptions",
            "missing_information",
        ],
        "properties": {
            "matched_goal_id": {
                "type": "string",
                "description": "Closest matching goal_id from the curated knowledge base.",
            },
            "goal_match_confidence": {
                "type": "string",
                "enum": ["high", "medium", "low"],
                "description": "Whether the learner's goal directly matches the curated goal or is an approximate match requiring confirmation.",
            },
            "goal_type": {
                "type": "string",
                "enum": ["career_role", "technical_objective", "project_goal"],
            },
            "personalized_summary": {
                "type": "string",
                "description": "2-3 sentence personalized executive overview tailored to the learner's name, goal, current skills, and study time.",
            },
            "selected_skills": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["skill_id", "importance", "tailored_rationale"],
                    "properties": {
                        "skill_id": {"type": "string"},
                        "importance": {
                            "type": "string",
                            "enum": ["essential", "recommended", "optional"],
                        },
                        "tailored_rationale": {
                            "type": "string",
                            "description": "Why this skill matters specifically for the learner's goal and current proficiency.",
                        },
                        "adjusted_hours": {
                            "type": "number",
                            "description": "Suggested study effort in hours before learner proficiency adjustment.",
                        },
                    },
                },
            },
            "assumptions": {
                "type": "array",
                "items": {"type": "string"},
            },
            "missing_information": {
                "type": "array",
                "items": {"type": "string"},
            },
        },
    }


def validate_roadmap_response_schema(roadmap: Dict[str, Any], valid_skill_ids: set) -> List[str]:
    """
    Validates a full generated RoadmapResponse dictionary against structural
    and referential integrity rules before sending to the frontend.
    """
    errors: List[str] = []
    required_top_keys = [
        "roadmap_id",
        "learner_profile",
        "target_goal",
        "goal_type",
        "summary",
        "recommended_first_skill_id",
        "recommended_next_skill_id",
        "recommended_next_action",
        "recommended_next_reason",
        "learning_sequence",
        "parallel_learning_options",
        "skill_nodes",
        "prerequisite_edges",
        "learning_stages",
        "schedule",
        "resource_references",
        "project_milestones",
        "assumptions",
        "missing_information",
        "validation_status",
    ]
    for key in required_top_keys:
        if key not in roadmap:
            errors.append(f"Missing required top-level field: '{key}'")

    nodes = roadmap.get("skill_nodes", [])
    if not isinstance(nodes, list) or len(nodes) == 0:
        errors.append("Roadmap must contain at least one skill node.")
        return errors

    node_ids_in_plan = set()
    for node in nodes:
        sid = node.get("skill_id")
        if not sid or sid not in valid_skill_ids:
            errors.append(f"Invalid or unverified skill_id in roadmap: '{sid}'")
        node_ids_in_plan.add(sid)

        if node.get("status") not in VALID_NODE_STATUSES:
            errors.append(f"Invalid learner status '{node.get('status')}' on skill '{sid}'")

        if node.get("knowledge_status") not in VALID_KNOWLEDGE_STATUSES:
            errors.append(f"Invalid knowledge_status '{node.get('knowledge_status')}' on skill '{sid}'")

        if node.get("readiness_status") not in VALID_READINESS_STATUSES:
            errors.append(f"Invalid readiness_status '{node.get('readiness_status')}' on skill '{sid}'")

        if node.get("completion_status") not in VALID_COMPLETION_STATUSES:
            errors.append(f"Invalid completion_status '{node.get('completion_status')}' on skill '{sid}'")

        if node.get("importance") not in VALID_IMPORTANCE_LEVELS:
            errors.append(f"Invalid importance '{node.get('importance')}' on skill '{sid}'")

        if not isinstance(node.get("resources"), list) or len(node.get("resources", [])) == 0:
            errors.append(f"Skill '{sid}' is missing attached verified learning resources.")

    edges = roadmap.get("prerequisite_edges", [])
    for edge in edges:
        src = edge.get("prerequisite_skill_id")
        dst = edge.get("skill_id")
        if src not in node_ids_in_plan or dst not in node_ids_in_plan:
            errors.append(f"Broken prerequisite edge: {src} -> {dst} references skill outside plan.")

    return errors
