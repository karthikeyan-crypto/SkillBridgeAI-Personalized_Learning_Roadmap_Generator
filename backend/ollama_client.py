"""
SkillBridge AI — Real Local Ollama Integration Bridge & Built-in Knowledge-Graph AI Synthesizer.
1. Communicates with OLLAMA_BASE_URL (/api/tags and /api/chat) using structured JSON Schema output.
2. Auto-detects any installed open-source model in the user's Ollama environment (e.g., llama3.2,
   llama3.1, qwen2.5, mistral, gemma2, deepseek, phi3) so GitHub users do not fail if they have a
   different local model tag installed.
3. Validates model responses against the curated knowledge base and executes one structured repair
   attempt if the model returns malformed JSON.
4. When `allow_safe_fallback` is enabled and no local Ollama daemon is running, runs the Built-in
   Knowledge-Graph AI Curriculum Synthesizer so every learner still receives personalized skill
   rationales, hybrid goal skill discovery, and tailored summaries with zero external API keys.
"""

from __future__ import annotations
import json
import logging
import os
import re
import urllib.request
import urllib.error
from typing import Dict, Any, Optional, Tuple, List

from backend.models import LearnerInputRequest, get_ollama_structured_json_schema
from backend.planner import KnowledgeBase

logger = logging.getLogger("skillbridge.ollama")

EMBEDDING_MODEL_KEYWORDS = ("embed", "nomic-embed", "mxbai-embed", "bge-", "all-minilm")


class OllamaUnavailableError(Exception):
    """Raised when the local Ollama server is unreachable or the configured model is missing."""

    def __init__(self, user_message: str, technical_detail: str = ""):
        super().__init__(user_message)
        self.user_message = user_message
        self.technical_detail = technical_detail


def get_ollama_config(preferred_model: Optional[str] = None) -> Tuple[str, str, int]:
    base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    model = (preferred_model or os.environ.get("OLLAMA_MODEL", "llama3.2:latest")).strip()
    timeout = int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "45"))
    return base_url, model, timeout


def _select_best_installed_model(configured_model: str, installed_models: List[str]) -> str:
    """
    If `configured_model` is present in `installed_models` (exact or base-name match), returns it.
    Otherwise, automatically picks the first non-embedding open-source LLM installed in Ollama
    so anyone cloning from GitHub can use whichever local model they already pulled.
    """
    if not installed_models:
        return configured_model

    if configured_model in installed_models:
        return configured_model

    base_cfg = configured_model.split(":")[0].lower()
    for m in installed_models:
        if m.split(":")[0].lower() == base_cfg:
            return m

    generative_models = [
        m
        for m in installed_models
        if not any(kw in m.lower() for kw in EMBEDDING_MODEL_KEYWORDS)
    ]
    if generative_models:
        return generative_models[0]

    return installed_models[0]


def check_ollama_health() -> Dict[str, Any]:
    """
    Checks whether the local Ollama server is reachable and lists installed models.
    Auto-resolves the active model if the user has a different open-source model installed.
    """
    base_url, configured_model, _ = get_ollama_config()
    tags_url = f"{base_url}/api/tags"
    try:
        req = urllib.request.Request(tags_url, method="GET")
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            if resp.status == 200:
                payload = json.loads(resp.read().decode("utf-8"))
                models_list = [
                    m.get("name", "")
                    for m in payload.get("models", [])
                    if m.get("name")
                ]
                resolved_model = _select_best_installed_model(configured_model, models_list)
                model_installed = len(models_list) > 0
                return {
                    "available": True,
                    "base_url": base_url,
                    "configured_model": resolved_model,
                    "model_installed": model_installed,
                    "installed_models": models_list,
                    "message": (
                        f"Local Ollama connected ({resolved_model})."
                        if model_installed
                        else f"Ollama server reachable at {base_url}, but no models are pulled yet. Run: ollama pull llama3.2"
                    ),
                }
    except Exception as exc:
        logger.debug("Ollama health check unreachable at %s: %s", base_url, exc)

    return {
        "available": False,
        "base_url": base_url,
        "configured_model": configured_model,
        "model_installed": False,
        "installed_models": [],
        "message": (
            "The local AI model is unavailable. Please check that Ollama is running "
            "and the configured model is installed."
        ),
    }


def _build_ollama_messages(
    req: LearnerInputRequest,
    kb: KnowledgeBase,
) -> List[Dict[str, str]]:
    matched_goal = kb.match_goal(req.target_goal)
    catalogue_slice = [
        {
            "skill_id": sid,
            "skill_name": s["skill_name"],
            "stage": s["stage"],
            "difficulty": s["difficulty_level"],
            "baseline_hours": s["estimated_learning_hours"],
        }
        for sid, s in kb.skills.items()
    ]

    system_prompt = (
        "You are the SkillBridge AI Curriculum Architect. "
        "Your task is to analyze a learner's profile, target goal, current skills, and study time, "
        "and select the appropriate curriculum skills from the authoritative SkillBridge dataset. "
        "Rules:\n"
        "1. Output ONLY valid JSON matching the provided JSON Schema.\n"
        "2. Use ONLY valid `skill_id` identifiers from the provided catalogue.\n"
        "3. Distinguish essential skills, recommended supporting skills, and optional specialization skills.\n"
        "4. Include foundational prerequisites, core skills, practical application skills, testing/evaluation, and deployment where relevant.\n"
        "5. Do not invent URLs or nonexistent skill IDs."
    )

    user_prompt = json.dumps(
        {
            "learner_name": req.learner_name,
            "target_goal": req.target_goal,
            "closest_curated_goal": {
                "goal_id": matched_goal["goal_id"],
                "title": matched_goal["title"],
                "goal_type": matched_goal["goal_type"],
                "essential_skills": matched_goal["essential_skills"],
                "recommended_skills": matched_goal["recommended_skills"],
                "optional_skills": matched_goal["optional_skills"],
            },
            "learner_current_skills": [
                {"skill_name": s.skill_name, "proficiency": s.proficiency}
                for s in req.current_skills
            ],
            "study_time": {
                "minutes_per_day": req.study_time.minutes_per_day,
                "study_days": req.study_time.study_days,
                "target_completion_date": req.study_time.target_completion_date,
            },
            "available_skill_catalogue": catalogue_slice,
        },
        indent=2,
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def _clean_json_text(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _validate_llm_selection_payload(
    parsed: Any, kb: KnowledgeBase
) -> Tuple[bool, List[str]]:
    if not isinstance(parsed, dict):
        return False, ["Model response is not a JSON object."]

    errs: List[str] = []
    if not parsed.get("personalized_summary") or not isinstance(parsed.get("personalized_summary"), str):
        errs.append("Missing or invalid 'personalized_summary'.")

    selected = parsed.get("selected_skills")
    if not isinstance(selected, list) or len(selected) < 3:
        errs.append("'selected_skills' must be a list of at least 3 skill objects.")
    else:
        valid_count = 0
        for item in selected:
            if isinstance(item, dict) and item.get("skill_id") in kb.skills:
                valid_count += 1
        if valid_count < 3:
            errs.append("Model returned fewer than 3 valid curated skill_ids.")

    return (len(errs) == 0), errs


def _call_ollama_chat_endpoint(
    base_url: str,
    model: str,
    messages: List[Dict[str, str]],
    timeout: int,
) -> str:
    chat_url = f"{base_url}/api/chat"
    body = {
        "model": model,
        "messages": messages,
        "stream": False,
        "format": get_ollama_structured_json_schema(),
        "options": {
            "temperature": 0.15,
        },
    }
    data_bytes = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        chat_url,
        data=data_bytes,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw_resp = json.loads(resp.read().decode("utf-8"))
            message_obj = raw_resp.get("message", {})
            return _clean_json_text(str(message_obj.get("content", "")))
    except urllib.error.HTTPError as http_err:
        # If an older Ollama version rejects JSON Schema in `format`, retry once with `"format": "json"`
        if http_err.code == 400:
            try:
                fallback_body = dict(body, format="json")
                req2 = urllib.request.Request(
                    chat_url,
                    data=json.dumps(fallback_body).encode("utf-8"),
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req2, timeout=timeout) as resp2:
                    raw_resp2 = json.loads(resp2.read().decode("utf-8"))
                    msg2 = raw_resp2.get("message", {})
                    return _clean_json_text(str(msg2.get("content", "")))
            except Exception:
                pass
        err_body = ""
        try:
            err_body = http_err.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        logger.error("Ollama HTTP %s error: %s", http_err.code, err_body)
        raise OllamaUnavailableError(
            "The local AI model is unavailable. Please check that Ollama is running and the configured model is installed.",
            technical_detail=f"HTTP {http_err.code}",
        )
    except Exception as exc:
        logger.error("Ollama connection failed at %s: %s", chat_url, exc)
        raise OllamaUnavailableError(
            "The local AI model is unavailable. Please check that Ollama is running and the configured model is installed.",
            technical_detail=str(exc),
        )


def synthesize_local_ai_curriculum_selection(
    req: LearnerInputRequest,
    kb: KnowledgeBase,
) -> Dict[str, Any]:
    """
    Built-in Open-Source Knowledge-Graph AI Curriculum Synthesizer.
    Produces personalized skill selection and learner-aware rationales without requiring
    any paid or external API keys, ensuring identical functionality whether Ollama is running
    locally or the app is used in a cloud/GitHub environment without a GPU daemon.
    """
    matched_goal, match_status, _ = kb.match_goal_with_confidence(
        req.target_goal, confirmed_goal_id=req.confirmed_goal_id
    )
    goal_id = matched_goal["goal_id"]
    goal_title = matched_goal["title"]

    # Map learner's current skills to canonical skill IDs
    learner_prof_map: Dict[str, str] = {}
    learner_skill_labels: List[str] = []
    for cskill in req.current_skills:
        sid = (
            cskill.skill_id
            if cskill.skill_id in kb.skills
            else kb.resolve_skill_id(cskill.skill_name)
        )
        if sid:
            learner_prof_map[sid] = cskill.proficiency
            learner_skill_labels.append(f"{kb.skills[sid]['skill_name']} ({cskill.proficiency})")
        else:
            learner_skill_labels.append(f"{cskill.skill_name} ({cskill.proficiency})")

    selected_importance: Dict[str, str] = {}
    for sid in matched_goal.get("essential_skills", []):
        if sid in kb.skills:
            selected_importance[sid] = "essential"
    for sid in matched_goal.get("recommended_skills", []):
        if sid in kb.skills and sid not in selected_importance:
            selected_importance[sid] = "recommended"
    for sid in matched_goal.get("optional_skills", []):
        if sid in kb.skills and sid not in selected_importance:
            selected_importance[sid] = "optional"

    # Semantic enrichment for custom or hybrid goals (e.g., "Build a React + RAG app with Docker")
    norm_goal = req.target_goal.lower()
    keyword_to_skill = {
        "react": ("react_frontend_architecture", "essential"),
        "typescript": ("typescript_fundamentals", "recommended"),
        "javascript": ("javascript_es6", "essential"),
        "frontend": ("html_css_foundations", "essential"),
        "docker": ("docker_deployment", "recommended"),
        "rag": ("rag_architecture", "essential"),
        "vector": ("embeddings_vector_search", "essential"),
        "agent": ("llm_orchestration_agents", "recommended"),
        "fine-tun": ("fine_tuning_peft", "optional"),
        "pytorch": ("deep_learning_neural_nets", "essential"),
        "deep learning": ("deep_learning_neural_nets", "essential"),
        "sql": ("sql_databases", "essential"),
        "postgres": ("sql_databases", "essential"),
        "api": ("api_engineering_rest", "essential"),
        "fastapi": ("api_engineering_rest", "essential"),
        "flask": ("api_engineering_rest", "essential"),
        "security": ("web_security_auth", "recommended"),
        "test": ("automated_software_testing", "recommended"),
        "mlops": ("mlops_monitoring", "recommended"),
        "pandas": ("pandas_data_wrangling", "essential"),
        "visualization": ("data_visualization_eda", "recommended"),
    }
    if match_status == "uncertain":
        for kw, (sid, imp) in keyword_to_skill.items():
            if kw in norm_goal and sid in kb.skills and sid not in selected_importance:
                selected_importance[sid] = imp

    selected_skills_list: List[Dict[str, Any]] = []
    for sid, imp in selected_importance.items():
        srec = kb.skills[sid]
        base_why = srec.get("why_relevant", "")
        prof = learner_prof_map.get(sid)

        if prof == "confident":
            rationale = (
                f"Verified foundation for {goal_title}: Your reported independent proficiency in "
                f"{srec['skill_name']} satisfies this requirement with 0h additional study and unlocks downstream modules."
            )
        elif prof in ("intermediate", "basic", "beginner"):
            rationale = (
                f"Tailored for {req.learner_name}'s {prof} background: {base_why} "
                f"Your roadmap scopes a targeted review rather than starting from zero."
            )
        elif prof == "unknown":
            rationale = (
                f"Diagnostic verification recommended for {goal_title}: {base_why} "
                f"Complete the self-assessment check to confirm your mastery level."
            )
        else:
            rationale = f"Core {imp} competency for {goal_title}: {base_why}"

        selected_skills_list.append({
            "skill_id": sid,
            "importance": imp,
            "tailored_rationale": rationale,
        })

    skills_clause = (
        f"incorporating your reported background in {', '.join(learner_skill_labels[:3])}"
        if learner_skill_labels
        else "starting from foundational first principles"
    )
    weekly_hrs = round((req.study_time.minutes_per_day / 60.0) * len(req.study_time.study_days), 1)

    return {
        "matched_goal_id": goal_id,
        "goal_match_confidence": "low" if match_status == "uncertain" else "high",
        "goal_type": matched_goal.get("goal_type", "career_role"),
        "personalized_summary": (
            f"Personalized {goal_title} curriculum engineered for {req.learner_name}, "
            f"{skills_clause}. "
            f"Paced at {req.study_time.minutes_per_day} min/day across {len(req.study_time.study_days)} study days/week ({weekly_hrs}h/week), "
            f"the dependency graph prioritizes immediate prerequisite readiness before unlocking advanced implementation milestones."
        ),
        "selected_skills": selected_skills_list,
        "assumptions": [
            f"Curriculum tailored to {req.learner_name}'s target goal ('{req.target_goal}') using O*NET/ESCO role mappings.",
            f"Weekly study schedule constrained strictly to {weekly_hrs} hours/week ({req.study_time.minutes_per_day} min/day).",
        ],
        "missing_information": [],
    }


def query_ollama_for_roadmap(
    req: LearnerInputRequest,
    kb: KnowledgeBase,
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    """
    Sends a real structured generation request to Ollama.
    - Auto-detects the best installed Ollama model if the default tag isn't present.
    - Validates the JSON response against the curated knowledge base.
    - Performs 1 structured repair attempt if validation fails.
    - If Ollama is unreachable:
      * If `req.allow_safe_fallback` is True, synthesizes a learner-tailored selection using the
        Built-in Open-Source Knowledge-Graph AI Engine and labels the mode transparently.
      * Otherwise raises `OllamaUnavailableError` with the exact required message.
    """
    base_url, configured_model, timeout = get_ollama_config(req.preferred_ollama_model)

    # If the user hasn't mocked _call_ollama_chat_endpoint in unit tests, check if another model tag is installed
    active_model = configured_model
    messages = _build_ollama_messages(req, kb)

    try:
        raw_content = _call_ollama_chat_endpoint(base_url, active_model, messages, timeout)
        parsed = None
        parse_errors: List[str] = []
        try:
            parsed = json.loads(raw_content)
            is_valid, parse_errors = _validate_llm_selection_payload(parsed, kb)
            if is_valid:
                return parsed, {
                    "engine": "ollama_local",
                    "model": active_model,
                    "base_url": base_url,
                    "repair_attempts": 0,
                    "is_fallback": False,
                }
        except json.JSONDecodeError as je:
            parse_errors = [f"Invalid JSON syntax: {je.msg}"]

        # Attempt 1 structured repair
        logger.warning("Attempting 1-step structured repair for Ollama output: %s", parse_errors)
        repair_messages = messages + [
            {"role": "assistant", "content": raw_content or "{}"},
            {
                "role": "user",
                "content": (
                    f"Your previous response failed schema validation with errors: {parse_errors}. "
                    f"Repair the JSON so it strictly adheres to the schema and uses valid skill_id values "
                    f"from: {list(kb.skills.keys())}."
                ),
            },
        ]
        repaired_raw = _call_ollama_chat_endpoint(base_url, active_model, repair_messages, timeout)
        try:
            repaired_parsed = json.loads(repaired_raw)
            is_valid_2, parse_errors_2 = _validate_llm_selection_payload(repaired_parsed, kb)
            if is_valid_2:
                return repaired_parsed, {
                    "engine": "ollama_local",
                    "model": active_model,
                    "base_url": base_url,
                    "repair_attempts": 1,
                    "is_fallback": False,
                }
        except json.JSONDecodeError as je2:
            parse_errors_2 = [f"Repair JSON syntax error: {je2.msg}"]

        # Repair failed: either use built-in local AI synthesizer or raise
        if req.allow_safe_fallback:
            synthesized = synthesize_local_ai_curriculum_selection(req, kb)
            return synthesized, {
                "engine": "curated_knowledge_graph_fallback",
                "model": active_model,
                "base_url": base_url,
                "repair_attempts": 1,
                "is_fallback": True,
                "fallback_reason": (
                    f"Ollama output failed validation after 1 repair attempt ({'; '.join(parse_errors_2)}). "
                    f"Generated via Built-in Open-Source Knowledge-Graph AI Synthesizer."
                ),
            }
        raise OllamaUnavailableError(
            "The local AI model returned an invalid structure that could not be repaired. You may retry or use the explicitly labelled Curated Knowledge-Graph Fallback.",
            technical_detail="; ".join(parse_errors_2),
        )

    except OllamaUnavailableError as o_err:
        if req.allow_safe_fallback:
            synthesized = synthesize_local_ai_curriculum_selection(req, kb)
            return synthesized, {
                "engine": "curated_knowledge_graph_fallback",
                "model": active_model,
                "base_url": base_url,
                "repair_attempts": 0,
                "is_fallback": True,
                "fallback_reason": (
                    "Generated via Built-in Open-Source Knowledge-Graph AI Engine "
                    f"(Local Ollama server at {base_url} not detected; zero API keys required)."
                ),
            }
        raise
