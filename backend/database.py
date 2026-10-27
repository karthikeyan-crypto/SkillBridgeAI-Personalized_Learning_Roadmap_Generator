"""
SkillBridge AI — SQLite Persistence Layer.
Stores learner profiles, generated roadmaps, skill completion statuses, session activity logs,
and schedule recalculations using parameterized SQL queries.
Never creates fictional learners or fake activity.
"""

from __future__ import annotations
import json
import sqlite3
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional

from backend.planner import (
     STAGE_ORDER,
    KnowledgeBase,
    calculate_study_schedule,
    resolve_ready_vs_blocked_statuses,
    compute_recommendations_and_sequence,
    topological_sort_skills,
)

DEFAULT_DB_PATH = Path(__file__).resolve().parent / "skillbridge.db"


class RoadmapDatabase:
    def __init__(self, db_path: Path = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS roadmaps (
                    roadmap_id TEXT PRIMARY KEY,
                    learner_name TEXT NOT NULL,
                    target_goal TEXT NOT NULL,
                    matched_goal_title TEXT NOT NULL,
                    goal_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    roadmap_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS skill_progress_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    roadmap_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    previous_status TEXT NOT NULL,
                    new_status TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (roadmap_id) REFERENCES roadmaps(roadmap_id)
                )
                """
            )
            conn.commit()

    def _ensure_roadmap_upgraded(
        self, roadmap: Dict[str, Any], kb: Optional[KnowledgeBase] = None
    ) -> Dict[str, Any]:
        """
        Ensures any stored roadmap (including sessions created by earlier schema versions)
        has complete goal-aware prerequisite separation, topological ordering,
        orthogonal statuses, START HERE / NEXT TO LEARN recommendations, and schedule fields.
        """
        nodes = roadmap.get("skill_nodes", [])
        if not nodes:
            return roadmap

        needs_persist = False
        goal_id = roadmap.get("matched_goal_id")
        if not goal_id and kb is not None:
            matched_goal = kb.match_goal(roadmap.get("target_goal", ""))
            goal_id = matched_goal["goal_id"]
            roadmap["matched_goal_id"] = goal_id
            needs_persist = True

        # Ensure goal-aware strict_prerequisites and recommended_foundations are populated on edges and nodes
        if kb is not None and goal_id:
            selected_ids = {n["skill_id"] for n in nodes}
            plan_edges = kb.get_goal_aware_prerequisite_edges(goal_id, selected_ids)
            roadmap["prerequisite_edges"] = plan_edges

            strict_by_skill: Dict[str, List[str]] = defaultdict(list)
            rec_by_skill: Dict[str, List[str]] = defaultdict(list)
            dep_by_skill: Dict[str, List[str]] = defaultdict(list)

            for e in plan_edges:
                t = e["skill_id"]
                p = e["prerequisite_skill_id"]
                if e["relationship_type"] == "strict_prerequisite":
                    strict_by_skill[t].append(p)
                    dep_by_skill[p].append(t)
                else:
                    rec_by_skill[t].append(p)

            importance_map = {n["skill_id"]: n.get("importance", "essential") for n in nodes}
            prof_map = {n["skill_id"]: n.get("learner_proficiency", "none") for n in nodes}
            matched_goal_obj = kb.goals.get(goal_id)

            ordered_ids = topological_sort_skills(
                skill_ids=selected_ids,
                edges=plan_edges,
                kb=kb,
                importance_map=importance_map,
                matched_goal=matched_goal_obj,
                learner_prof_by_id=prof_map,
            )
            nodes_by_id = {n["skill_id"]: n for n in nodes}
            ordered_nodes: List[Dict[str, Any]] = []
            for idx, sid in enumerate(ordered_ids, start=1):
                node = nodes_by_id[sid]
                node["sequence_order"] = idx
                node["prerequisites"] = strict_by_skill[sid]
                node["strict_prerequisites"] = strict_by_skill[sid]
                node["recommended_foundations"] = rec_by_skill[sid]
                node["dependent_skills"] = dep_by_skill[sid]
                if "parallel_allowed" not in node and sid in kb.skills:
                    node["parallel_allowed"] = bool(kb.skills[sid].get("parallel_allowed", True))
                ordered_nodes.append(node)
            nodes = ordered_nodes
            roadmap["skill_nodes"] = nodes

        resolve_ready_vs_blocked_statuses(nodes)
        matched_title = roadmap.get("matched_goal_title", roadmap.get("target_goal", ""))
        rec_bundle = compute_recommendations_and_sequence(nodes, matched_title)

        if (
            "recommended_first_skill_id" not in roadmap
            or roadmap.get("recommended_first_skill_id") != rec_bundle["recommended_first_skill_id"]
            or "learning_sequence" not in roadmap
        ):
            needs_persist = True

        roadmap["recommended_first_skill_id"] = rec_bundle["recommended_first_skill_id"]
        roadmap["recommended_next_skill_id"] = rec_bundle["recommended_next_skill_id"]
        roadmap["recommended_next_action"] = rec_bundle["recommended_next_action"]
        roadmap["recommended_next_reason"] = rec_bundle["recommended_next_reason"]
        roadmap["learning_sequence"] = rec_bundle["learning_sequence"]
        roadmap["parallel_learning_options"] = rec_bundle["parallel_learning_options"]

        # Ensure schedule entries include readiness_status, recommendation_role, and active_step_number
        st = roadmap.get("learner_profile", {}).get("study_time", {})
        if st:
            roadmap["schedule"] = calculate_study_schedule(
                ordered_skill_nodes=nodes,
                minutes_per_day=int(st.get("minutes_per_day", 90)),
                study_days=list(st.get("study_days", ["Mon", "Tue", "Wed", "Thu", "Fri"])),
                start_date_str=st.get("start_date"),
                target_date_str=st.get("target_completion_date"),
            )

        # Update stage completion counts
        stages_map: Dict[str, List[str]] = defaultdict(list)
        for n in nodes:
            stages_map[n["stage"]].append(n["skill_id"])
        learning_stages = []
        for st_name in STAGE_ORDER:
            if st_name in stages_map:
                st_nodes = [n for n in nodes if n["stage"] == st_name]
                learning_stages.append({
                    "stage_name": st_name,
                    "skill_ids": stages_map[st_name],
                    "total_hours": round(sum(n["estimated_hours"] for n in st_nodes), 1),
                    "completed_or_known_count": sum(
                        1 for n in st_nodes if n.get("readiness_status") == "completed"
                    ),
                    "total_count": len(st_nodes),
                })
        roadmap["learning_stages"] = learning_stages

        if needs_persist:
            self.save_roadmap(roadmap)

        return roadmap

    def get_progress_log(self, roadmap_id: str, limit: int = 15) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, roadmap_id, skill_id, previous_status, new_status, updated_at
                FROM skill_progress_log
                WHERE roadmap_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (roadmap_id, limit),
            ).fetchall()
            return [
                {
                    "id": r["id"],
                    "roadmap_id": r["roadmap_id"],
                    "skill_id": r["skill_id"],
                    "previous_status": r["previous_status"],
                    "new_status": r["new_status"],
                    "updated_at": r["updated_at"],
                }
                for r in rows
            ]

    def save_roadmap(self, roadmap: Dict[str, Any]) -> None:
        roadmap_id = roadmap["roadmap_id"]
        learner_name = roadmap["learner_profile"]["learner_name"]
        target_goal = roadmap["target_goal"]
        matched_title = roadmap.get("matched_goal_title", target_goal)
        goal_type = roadmap.get("goal_type", "career_role")
        now = datetime.utcnow().isoformat() + "Z"
        created_at = roadmap.get("created_at", now)
        roadmap["updated_at"] = now

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO roadmaps (
                    roadmap_id, learner_name, target_goal, matched_goal_title,
                    goal_type, created_at, updated_at, roadmap_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(roadmap_id) DO UPDATE SET
                    learner_name = excluded.learner_name,
                    target_goal = excluded.target_goal,
                    matched_goal_title = excluded.matched_goal_title,
                    goal_type = excluded.goal_type,
                    updated_at = excluded.updated_at,
                    roadmap_json = excluded.roadmap_json
                """,
                (
                    roadmap_id,
                    learner_name,
                    target_goal,
                    matched_title,
                    goal_type,
                    created_at,
                    now,
                    json.dumps(roadmap),
                ),
            )
            conn.commit()

    def get_roadmap(
        self, roadmap_id: str, kb: Optional[KnowledgeBase] = None
    ) -> Optional[Dict[str, Any]]:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT roadmap_json, updated_at FROM roadmaps WHERE roadmap_id = ?",
                (roadmap_id,),
            ).fetchone()
            if not row:
                return None
            roadmap = json.loads(row["roadmap_json"])
            roadmap["updated_at"] = row["updated_at"]

        roadmap = self._ensure_roadmap_upgraded(roadmap, kb=kb)
        roadmap["progress_history"] = self.get_progress_log(roadmap_id, limit=20)
        return roadmap

    def delete_roadmap(self, roadmap_id: str) -> bool:
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM skill_progress_log WHERE roadmap_id = ?",
                (roadmap_id,),
            )
            cur = conn.execute(
                "DELETE FROM roadmaps WHERE roadmap_id = ?",
                (roadmap_id,),
            )
            conn.commit()
            return cur.rowcount > 0

    def list_roadmaps(self, kb: Optional[KnowledgeBase] = None) -> List[Dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT roadmap_id, learner_name, target_goal, matched_goal_title,
                       goal_type, created_at, updated_at, roadmap_json
                FROM roadmaps
                ORDER BY updated_at DESC
                LIMIT 50
                """
            ).fetchall()

        summaries: List[Dict[str, Any]] = []
        for r in rows:
            data = json.loads(r["roadmap_json"])
            data = self._ensure_roadmap_upgraded(data, kb=kb)
            nodes = data.get("skill_nodes", [])
            nodes_by_id = {n["skill_id"]: n for n in nodes}

            total = len(nodes)
            done = sum(
                1
                for n in nodes
                if n.get("readiness_status") == "completed"
                or n.get("status") in ("completed", "already_known")
            )
            in_prog = sum(1 for n in nodes if n.get("status") == "in_progress")
            needs_rev = sum(1 for n in nodes if n.get("status") == "needs_review")

            first_id = data.get("recommended_first_skill_id")
            next_id = data.get("recommended_next_skill_id")
            first_node = nodes_by_id.get(first_id) if first_id else None
            next_node = nodes_by_id.get(next_id) if next_id else None

            sched = data.get("schedule", {})
            st = data.get("learner_profile", {}).get("study_time", {})

            recent_logs = self.get_progress_log(r["roadmap_id"], limit=5)
            for log_entry in recent_logs:
                sk_node = nodes_by_id.get(log_entry["skill_id"])
                log_entry["skill_name"] = (
                    sk_node["skill_name"] if sk_node else log_entry["skill_id"]
                )

            summaries.append({
                "roadmap_id": r["roadmap_id"],
                "learner_name": r["learner_name"],
                "target_goal": r["target_goal"],
                "matched_goal_title": r["matched_goal_title"],
                "goal_type": r["goal_type"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "total_skills": total,
                "completed_or_known_skills": done,
                "in_progress_skills": in_prog,
                "needs_review_skills": needs_rev,
                "progress_percent": round((done / max(total, 1)) * 100),
                "total_remaining_hours": float(sched.get("total_remaining_hours", 0.0)),
                "hours_saved_by_prior_knowledge": float(
                    sched.get("hours_saved_by_prior_knowledge", 0.0)
                ),
                "weekly_capacity_hours": float(sched.get("weekly_capacity_hours", 7.5)),
                "estimated_completion_date": sched.get("estimated_completion_date", ""),
                "minutes_per_day": int(st.get("minutes_per_day", 90)),
                "study_days": list(st.get("study_days", ["Mon", "Tue", "Wed", "Thu", "Fri"])),
                "recommended_first_skill_id": first_id,
                "recommended_first_skill_name": (
                    first_node["skill_name"] if first_node else None
                ),
                "recommended_first_skill_hours": (
                    first_node["estimated_hours"] if first_node else 0.0
                ),
                "recommended_next_skill_id": next_id,
                "recommended_next_skill_name": (
                    next_node["skill_name"] if next_node else None
                ),
                "recommended_next_action": data.get("recommended_next_action", ""),
                "recent_activity": recent_logs,
            })
        return summaries

    def update_skill_status(
        self,
        roadmap_id: str,
        skill_id: str,
        new_status: str,
        kb: KnowledgeBase,
    ) -> Optional[Dict[str, Any]]:
        roadmap = self.get_roadmap(roadmap_id, kb=kb)
        if not roadmap:
            return None

        allowed = {
            "completed",
            "in_progress",
            "ready_to_learn",
            "needs_review",
            "already_known",
            "optional",
        }
        if new_status not in allowed:
            raise ValueError(f"Invalid status '{new_status}'.")

        nodes = roadmap.get("skill_nodes", [])
        target_node = None
        for n in nodes:
            if n["skill_id"] == skill_id:
                target_node = n
                break

        if not target_node:
            raise ValueError(f"Skill '{skill_id}' not found in roadmap '{roadmap_id}'.")

        prev_status = target_node["status"]

        # Update orthogonal completion_status and knowledge_status accurately
        if new_status == "completed":
            target_node["completion_status"] = "completed"
            target_node["estimated_hours"] = 0.0
        elif new_status == "already_known":
            target_node["knowledge_status"] = "already_known"
            target_node["completion_status"] = "completed"
            target_node["estimated_hours"] = 0.0
        elif new_status == "in_progress":
            target_node["completion_status"] = "in_progress"
            if target_node["estimated_hours"] <= 0.0:
                srec = kb.skills.get(skill_id, {})
                target_node["estimated_hours"] = float(
                    srec.get("estimated_learning_hours", target_node.get("baseline_hours", 10.0))
                )
        elif new_status == "needs_review":
            target_node["knowledge_status"] = "needs_review"
            target_node["completion_status"] = "incomplete"
            if target_node["estimated_hours"] <= 0.0:
                srec = kb.skills.get(skill_id, {})
                base_h = float(
                    srec.get("estimated_learning_hours", target_node.get("baseline_hours", 10.0))
                )
                target_node["estimated_hours"] = round(base_h * 0.6, 1)
        else:
            # ready_to_learn or optional
            target_node["completion_status"] = "incomplete"
            if target_node.get("knowledge_status") == "already_known":
                target_node["knowledge_status"] = "not_yet_learned"
            if target_node["estimated_hours"] <= 0.0:
                srec = kb.skills.get(skill_id, {})
                target_node["estimated_hours"] = float(
                    srec.get("estimated_learning_hours", target_node.get("baseline_hours", 10.0))
                )

        # 1. Re-evaluate readiness_status and unlock dependent skills whose strict prerequisites are now satisfied
        resolve_ready_vs_blocked_statuses(nodes)

        # 2. Recompute START HERE, NEXT TO LEARN, learning_sequence, and parallel options
        matched_title = roadmap.get("matched_goal_title", roadmap.get("target_goal", ""))
        rec_bundle = compute_recommendations_and_sequence(nodes, matched_title)
        roadmap["recommended_first_skill_id"] = rec_bundle["recommended_first_skill_id"]
        roadmap["recommended_next_skill_id"] = rec_bundle["recommended_next_skill_id"]
        roadmap["recommended_next_action"] = rec_bundle["recommended_next_action"]
        roadmap["recommended_next_reason"] = rec_bundle["recommended_next_reason"]
        roadmap["learning_sequence"] = rec_bundle["learning_sequence"]
        roadmap["parallel_learning_options"] = rec_bundle["parallel_learning_options"]

        # 3. Recalculate remaining study schedule without resetting completed progress
        st = roadmap["learner_profile"]["study_time"]
        roadmap["schedule"] = calculate_study_schedule(
            ordered_skill_nodes=nodes,
            minutes_per_day=int(st["minutes_per_day"]),
            study_days=list(st["study_days"]),
            start_date_str=st.get("start_date"),
            target_date_str=st.get("target_completion_date"),
        )

        # Update stage completion counts
        for stage_obj in roadmap.get("learning_stages", []):
            st_ids = set(stage_obj.get("skill_ids", []))
            st_nodes = [n for n in nodes if n["skill_id"] in st_ids]
            stage_obj["total_hours"] = round(sum(n["estimated_hours"] for n in st_nodes), 1)
            stage_obj["completed_or_known_count"] = sum(
                1 for n in st_nodes if n.get("readiness_status") == "completed"
            )

        now = datetime.utcnow().isoformat() + "Z"
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO skill_progress_log (roadmap_id, skill_id, previous_status, new_status, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (roadmap_id, skill_id, prev_status, target_node["status"], now),
            )
            conn.commit()

        self.save_roadmap(roadmap)
        roadmap["progress_history"] = self.get_progress_log(roadmap_id, limit=20)
        return roadmap

    def update_study_schedule_settings(
        self,
        roadmap_id: str,
        minutes_per_day: int,
        study_days: List[str],
        target_completion_date: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Recalculates the remaining schedule when the learner adjusts study hours,
        available days, or target completion date, preserving all completed progress.
        """
        roadmap = self.get_roadmap(roadmap_id)
        if not roadmap:
            return None

        if minutes_per_day < 15 or minutes_per_day > 720:
            raise ValueError("minutes_per_day must be between 15 and 720.")
        if not study_days:
            raise ValueError("At least one study day must be selected.")

        st = roadmap["learner_profile"]["study_time"]
        st["minutes_per_day"] = int(minutes_per_day)
        st["study_days"] = list(study_days)
        st["target_completion_date"] = target_completion_date or None

        nodes = roadmap.get("skill_nodes", [])
        roadmap["schedule"] = calculate_study_schedule(
            ordered_skill_nodes=nodes,
            minutes_per_day=int(minutes_per_day),
            study_days=list(study_days),
            start_date_str=st.get("start_date"),
            target_date_str=target_completion_date or None,
        )

        self.save_roadmap(roadmap)
        roadmap["progress_history"] = self.get_progress_log(roadmap_id, limit=20)
        return roadmap
