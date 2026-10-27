"""
SkillBridge AI — Python Flask Backend & CLI Dispatcher.
Provides:
- Standard Flask REST application (`app`) when Flask is installed
- Built-in WSGI / stdlib HTTP server & CLI dispatcher so the Python backend
  runs identically in environments with or without pip packages installed.
"""

from __future__ import annotations
import json
import os
import sys
from pathlib import Path
from typing import Dict, Any, Tuple

# Ensure project root is on sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.models import LearnerInputRequest, SchemaValidationError
from backend.planner import KnowledgeBase, build_personalized_roadmap
from backend.ollama_client import (
    check_ollama_health,
    query_ollama_for_roadmap,
    OllamaUnavailableError,
)
from backend.evaluator import (
    evaluate_goal_skill_relevance_classifier,
    audit_roadmap_quality,
)
from backend.database import RoadmapDatabase

kb = KnowledgeBase()
db = RoadmapDatabase()


def handle_api_action(action: str, payload: Dict[str, Any]) -> Tuple[int, Dict[str, Any]]:
    """
    Core transport-independent controller used by both Flask routes and the CLI/HTTP bridge.
    Returns (http_status_code, response_dict).
    """
    try:
        if action == "health":
            ollama_status = check_ollama_health()
            return 200, {
                "status": "ok",
                "service": "SkillBridge AI Python Planning Engine",
                "ollama": ollama_status,
                "knowledge_base": {
                    "version": kb.raw.get("metadata", {}).get("version", "2.4.0"),
                    "total_skills": len(kb.skills),
                    "total_goals": len(kb.goals),
                    "total_resources": len(kb.raw.get("resources", [])),
                },
            }

        if action == "knowledge_base":
            goals_summary = [
                {
                    "goal_id": g["goal_id"],
                    "title": g["title"],
                    "goal_type": g["goal_type"],
                    "description": g["description"],
                }
                for g in kb.raw.get("goals", [])
            ]
            skills_catalog = [
                {
                    "skill_id": s["skill_id"],
                    "skill_name": s["skill_name"],
                    "stage": s["stage"],
                    "skill_category": s["skill_category"],
                    "difficulty_level": s["difficulty_level"],
                    "estimated_learning_hours": s["estimated_learning_hours"],
                }
                for s in kb.raw.get("skills", [])
            ]
            return 200, {
                "goals": goals_summary,
                "skills": skills_catalog,
                "sources": kb.raw.get("metadata", {}).get("sources", []),
            }

        if action == "generate_roadmap":
            req = LearnerInputRequest.from_dict(payload)
            llm_selection, gen_meta = query_ollama_for_roadmap(req, kb)
            roadmap = build_personalized_roadmap(
                req=req,
                kb=kb,
                llm_selection=llm_selection,
                generation_metadata=gen_meta,
            )
            roadmap["quality_audit"] = audit_roadmap_quality(roadmap, kb)
            db.save_roadmap(roadmap)
            return 200, roadmap

        if action == "list_roadmaps":
            return 200, {"roadmaps": db.list_roadmaps(kb=kb)}

        if action == "get_roadmap":
            roadmap_id = str(payload.get("roadmap_id", "")).strip()
            if not roadmap_id:
                return 400, {"error": "roadmap_id is required."}
            rm = db.get_roadmap(roadmap_id, kb=kb)
            if not rm:
                return 404, {"error": f"Roadmap '{roadmap_id}' not found."}
            rm["quality_audit"] = audit_roadmap_quality(rm, kb)
            return 200, rm

        if action == "delete_roadmap":
            roadmap_id = str(payload.get("roadmap_id", "")).strip()
            if not roadmap_id:
                return 400, {"error": "roadmap_id is required."}
            deleted = db.delete_roadmap(roadmap_id)
            if not deleted:
                return 404, {"error": f"Roadmap '{roadmap_id}' not found."}
            return 200, {"deleted": True, "roadmap_id": roadmap_id, "roadmaps": db.list_roadmaps(kb=kb)}

        if action == "update_progress":
            roadmap_id = str(payload.get("roadmap_id", "")).strip()
            skill_id = str(payload.get("skill_id", "")).strip()
            new_status = str(payload.get("status", "")).strip()
            if not roadmap_id or not skill_id or not new_status:
                return 400, {"error": "roadmap_id, skill_id, and status are required."}
            updated = db.update_skill_status(roadmap_id, skill_id, new_status, kb)
            if not updated:
                return 404, {"error": f"Roadmap '{roadmap_id}' not found."}
            updated["quality_audit"] = audit_roadmap_quality(updated, kb)
            return 200, updated

        if action == "reschedule":
            roadmap_id = str(payload.get("roadmap_id", "")).strip()
            minutes_per_day = int(payload.get("minutes_per_day", 90))
            study_days = list(payload.get("study_days", ["Mon", "Tue", "Wed", "Thu", "Fri"]))
            target_completion_date = payload.get("target_completion_date") or None
            updated = db.update_study_schedule_settings(
                roadmap_id=roadmap_id,
                minutes_per_day=minutes_per_day,
                study_days=study_days,
                target_completion_date=target_completion_date,
            )
            if not updated:
                return 404, {"error": f"Roadmap '{roadmap_id}' not found."}
            updated["quality_audit"] = audit_roadmap_quality(updated, kb)
            return 200, updated

        if action == "evaluation":
            eval_report = evaluate_goal_skill_relevance_classifier(kb)
            roadmap_id = payload.get("roadmap_id")
            roadmap_audit = None
            if roadmap_id:
                rm = db.get_roadmap(str(roadmap_id))
                if rm:
                    roadmap_audit = audit_roadmap_quality(rm, kb)
            return 200, {
                "ml_evaluation": eval_report,
                "roadmap_audit": roadmap_audit,
            }

        return 400, {"error": f"Unknown action '{action}'."}

    except SchemaValidationError as sve:
        return 400, {
            "error": sve.message,
            "validation_errors": sve.errors,
        }
    except OllamaUnavailableError as oue:
        return 503, {
            "error": oue.user_message,
            "code": "OLLAMA_UNAVAILABLE",
            "can_use_safe_fallback": True,
            "ollama_base_url": os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
            "ollama_model": os.environ.get("OLLAMA_MODEL", "llama3.2:latest"),
        }
    except ValueError as ve:
        return 400, {"error": str(ve)}
    except Exception as exc:
        return 500, {"error": "An unexpected backend error occurred while processing the request."}


# Define Flask app when Flask is installed in the environment
try:
    from flask import Flask, request, jsonify

    app = Flask(__name__)

    @app.route("/api/health", methods=["GET"])
    def flask_health():
        code, data = handle_api_action("health", {})
        return jsonify(data), code

    @app.route("/api/knowledge-base", methods=["GET"])
    def flask_kb():
        code, data = handle_api_action("knowledge_base", {})
        return jsonify(data), code

    @app.route("/api/roadmaps/generate", methods=["POST"])
    def flask_generate():
        payload = request.get_json(silent=True) or {}
        code, data = handle_api_action("generate_roadmap", payload)
        return jsonify(data), code

    @app.route("/api/roadmaps", methods=["GET"])
    def flask_list_roadmaps():
        code, data = handle_api_action("list_roadmaps", {})
        return jsonify(data), code

    @app.route("/api/roadmaps/<roadmap_id>", methods=["GET"])
    def flask_get_roadmap(roadmap_id: str):
        code, data = handle_api_action("get_roadmap", {"roadmap_id": roadmap_id})
        return jsonify(data), code

    @app.route("/api/roadmaps/<roadmap_id>", methods=["DELETE"])
    def flask_delete_roadmap(roadmap_id: str):
        code, data = handle_api_action("delete_roadmap", {"roadmap_id": roadmap_id})
        return jsonify(data), code

    @app.route("/api/roadmaps/<roadmap_id>/progress", methods=["PATCH", "POST"])
    def flask_update_progress(roadmap_id: str):
        payload = request.get_json(silent=True) or {}
        payload["roadmap_id"] = roadmap_id
        code, data = handle_api_action("update_progress", payload)
        return jsonify(data), code

    @app.route("/api/roadmaps/<roadmap_id>/reschedule", methods=["PATCH", "POST"])
    def flask_reschedule(roadmap_id: str):
        payload = request.get_json(silent=True) or {}
        payload["roadmap_id"] = roadmap_id
        code, data = handle_api_action("reschedule", payload)
        return jsonify(data), code

    @app.route("/api/evaluation", methods=["GET"])
    def flask_evaluation():
        roadmap_id = request.args.get("roadmap_id")
        code, data = handle_api_action("evaluation", {"roadmap_id": roadmap_id})
        return jsonify(data), code

except ImportError:
    app = None


if __name__ == "__main__":
    # Support CLI invocation: python3 backend/app.py --cli <action>
    if len(sys.argv) >= 3 and sys.argv[1] == "--cli":
        cli_action = sys.argv[2]
        raw_input = sys.stdin.read().strip()
        cli_payload = json.loads(raw_input) if raw_input else {}
        status_code, resp_obj = handle_api_action(cli_action, cli_payload)
        sys.stdout.write(json.dumps({"status_code": status_code, "body": resp_obj}))
        sys.stdout.flush()
        sys.exit(0)

    port = int(os.environ.get("FLASK_PORT", "5001"))
    if app is not None:
        app.run(host="0.0.0.0", port=port, debug=False)
    else:
        # Standard library HTTP server fallback if Flask is not installed
        from http.server import BaseHTTPRequestHandler, HTTPServer
        from urllib.parse import urlparse, parse_qs

        class StdlibAPIHandler(BaseHTTPRequestHandler):
            def _send(self, code: int, body: Dict[str, Any]):
                encoded = json.dumps(body).encode("utf-8")
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(encoded)))
                self.end_headers()
                self.wfile.write(encoded)

            def do_GET(self):
                parsed = urlparse(self.path)
                path = parsed.path
                qs = parse_qs(parsed.query)
                if path == "/api/health":
                    c, b = handle_api_action("health", {})
                    return self._send(c, b)
                if path == "/api/knowledge-base":
                    c, b = handle_api_action("knowledge_base", {})
                    return self._send(c, b)
                if path == "/api/roadmaps":
                    c, b = handle_api_action("list_roadmaps", {})
                    return self._send(c, b)
                if path.startswith("/api/roadmaps/"):
                    rm_id = path.split("/api/roadmaps/")[1].split("/")[0]
                    c, b = handle_api_action("get_roadmap", {"roadmap_id": rm_id})
                    return self._send(c, b)
                if path == "/api/evaluation":
                    rm_id = qs.get("roadmap_id", [None])[0]
                    c, b = handle_api_action("evaluation", {"roadmap_id": rm_id})
                    return self._send(c, b)
                self._send(404, {"error": "Not found"})

            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length).decode("utf-8") if length > 0 else "{}"
                payload = json.loads(raw) if raw else {}
                parsed = urlparse(self.path)
                path = parsed.path
                if path == "/api/roadmaps/generate":
                    c, b = handle_api_action("generate_roadmap", payload)
                    return self._send(c, b)
                if path.startswith("/api/roadmaps/") and path.endswith("/progress"):
                    rm_id = path.split("/api/roadmaps/")[1].split("/")[0]
                    payload["roadmap_id"] = rm_id
                    c, b = handle_api_action("update_progress", payload)
                    return self._send(c, b)
                if path.startswith("/api/roadmaps/") and path.endswith("/reschedule"):
                    rm_id = path.split("/api/roadmaps/")[1].split("/")[0]
                    payload["roadmap_id"] = rm_id
                    c, b = handle_api_action("reschedule", payload)
                    return self._send(c, b)
                self._send(404, {"error": "Not found"})

            def do_PATCH(self):
                return self.do_POST()

        server = HTTPServer(("0.0.0.0", port), StdlibAPIHandler)
        print(f"SkillBridge Python Backend listening on http://0.0.0.0:{port}")
        server.serve_forever()
