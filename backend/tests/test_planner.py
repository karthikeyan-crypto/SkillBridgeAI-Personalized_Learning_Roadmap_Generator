"""
SkillBridge AI — Automated Backend Unit & Integration Tests.
Covers:
- Input validation
- Complete Alex AI Engineer workflow
- Scenario A: Beginner AI Engineer (no existing skills -> Python is START HERE, foundations ordered, parallel options available)
- Scenario B: Learner already knows Python (Python remains visible as known with 0h, START HERE advances)
- Scenario C: Learner knows basic NumPy but lacks a required foundation (preserves knowledge_status while blocking readiness until Python is satisfied)
- Scenario D: Build an application using an existing LLM (does not force deep learning from scratch before using a pretrained LLM)
- Scenario E: Complete a prerequisite (dependents unlock immediately and START HERE / NEXT TO LEARN update)
- Scenario F: Invalid dependency graph (circular prerequisites detected) & schedule compliance
- Ollama unavailability & 1-step structured repair
- ML confusion matrix evaluation metrics
"""

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from backend.models import LearnerInputRequest, SchemaValidationError
from backend.planner import (
    KnowledgeBase,
    build_personalized_roadmap,
    detect_circular_prerequisites,
)
from backend.database import RoadmapDatabase
from backend.evaluator import (
    evaluate_goal_skill_relevance_classifier,
)
from backend.app import handle_api_action


class TestSkillBridgeBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kb = KnowledgeBase()

    def test_01_learner_input_validation(self):
        with self.assertRaises(SchemaValidationError):
            LearnerInputRequest.from_dict({
                "learner_name": "   ",
                "target_goal": "Become an AI Engineer",
            })

        with self.assertRaises(SchemaValidationError):
            LearnerInputRequest.from_dict({
                "learner_name": "Alex",
                "target_goal": "Become an AI Engineer",
                "study_time": {"minutes_per_day": 5, "study_days": ["Mon"]},
            })

        with self.assertRaises(SchemaValidationError):
            LearnerInputRequest.from_dict({
                "learner_name": "Alex",
                "target_goal": "Become an AI Engineer",
                "study_time": {"minutes_per_day": 90, "study_days": []},
            })

    def test_02_scenario_a_beginner_ai_engineer(self):
        """
        Scenario A: Beginner AI Engineer (no existing skills).
        Verify that Python is START HERE, foundations appear in an intentional order,
        genuine prerequisites precede dependent topics, and independent topics are available
        for parallel study rather than treated as false strict dependencies.
        """
        req = LearnerInputRequest.from_dict({
            "learner_name": "Taylor",
            "target_goal": "Become an AI Engineer",
            "current_skills": [],
            "study_time": {
                "minutes_per_day": 90,
                "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "start_date": "2026-10-19",
            },
            "allow_safe_fallback": True,
        })
        roadmap = build_personalized_roadmap(req, self.kb)
        nodes_by_id = {n["skill_id"]: n for n in roadmap["skill_nodes"]}

        # Python is clearly recommended as START HERE
        self.assertEqual(roadmap["recommended_first_skill_id"], "python_programming")
        self.assertIsNotNone(roadmap["recommended_next_skill_id"])
        self.assertNotEqual(
            roadmap["recommended_first_skill_id"],
            roadmap["recommended_next_skill_id"],
        )

        # Independent foundations (Git, SQL, Linear Algebra) are available now in parallel_learning_options
        parallel_ids = {p["skill_id"] for p in roadmap["parallel_learning_options"]}
        self.assertIn("git_version_control", parallel_ids)
        self.assertIn("sql_databases", parallel_ids)

        # Dependent topics (NumPy, Pandas, Classical ML, Deep Learning, RAG) are waiting for prerequisites
        for dep_id in [
            "numpy_scientific_computing",
            "pandas_data_wrangling",
            "classical_machine_learning",
            "deep_learning_neural_nets",
            "rag_architecture",
        ]:
            self.assertEqual(
                nodes_by_id[dep_id]["readiness_status"],
                "waiting_for_prerequisites",
                f"{dep_id} must wait for its strict prerequisites",
            )
            self.assertEqual(nodes_by_id[dep_id]["status"], "blocked")

        # Strict prerequisites always precede dependents in sequence_order
        for edge in roadmap["prerequisite_edges"]:
            if edge["relationship_type"] == "strict_prerequisite":
                p_ord = nodes_by_id[edge["prerequisite_skill_id"]]["sequence_order"]
                t_ord = nodes_by_id[edge["skill_id"]]["sequence_order"]
                self.assertLess(p_ord, t_ord)

    def test_03_scenario_b_learner_already_knows_python(self):
        """
        Scenario B: Learner already knows Python.
        Verify that Python remains visible as known, its redundant study hours are removed,
        and the first recommendation moves to a suitable unfinished skill whose prerequisites are satisfied.
        """
        req = LearnerInputRequest.from_dict({
            "learner_name": "Jordan",
            "target_goal": "Become an AI Engineer",
            "current_skills": [
                {"skill_name": "Python", "proficiency": "confident"},
            ],
            "study_time": {
                "minutes_per_day": 90,
                "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "start_date": "2026-10-19",
            },
            "allow_safe_fallback": True,
        })
        roadmap = build_personalized_roadmap(req, self.kb)
        nodes_by_id = {n["skill_id"]: n for n in roadmap["skill_nodes"]}

        # Python remains in the graph as already_known with 0 hours
        self.assertIn("python_programming", nodes_by_id)
        self.assertEqual(nodes_by_id["python_programming"]["knowledge_status"], "already_known")
        self.assertEqual(nodes_by_id["python_programming"]["readiness_status"], "completed")
        self.assertEqual(nodes_by_id["python_programming"]["estimated_hours"], 0.0)

        # First recommendation is NOT Python; it moves to an unfinished skill whose strict prerequisites are satisfied
        first_id = roadmap["recommended_first_skill_id"]
        self.assertNotEqual(first_id, "python_programming")
        self.assertEqual(nodes_by_id[first_id]["readiness_status"], "available_now")
        self.assertEqual(len(nodes_by_id[first_id]["unmet_strict_prerequisites"]), 0)

        # Because Python is known, NumPy, LLM Foundations, and Backend API Engineering now have their strict prerequisite satisfied!
        self.assertEqual(nodes_by_id["numpy_scientific_computing"]["readiness_status"], "available_now")
        self.assertEqual(nodes_by_id["llm_foundations_prompting"]["readiness_status"], "available_now")

    def test_04_scenario_c_knows_basic_numpy_lacks_foundation(self):
        """
        Scenario C: Learner knows basic NumPy but lacks a required foundation (Python).
        Verify that the system preserves the learner's reported knowledge on NumPy
        but does not falsely imply that NumPy or its dependent skills are ready to learn
        before Python is completed.
        """
        req = LearnerInputRequest.from_dict({
            "learner_name": "Sam",
            "target_goal": "Become a Data Scientist",
            "current_skills": [
                {"skill_name": "NumPy", "proficiency": "basic"},
            ],
            "study_time": {
                "minutes_per_day": 60,
                "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
            },
            "allow_safe_fallback": True,
        })
        roadmap = build_personalized_roadmap(req, self.kb)
        nodes_by_id = {n["skill_id"]: n for n in roadmap["skill_nodes"]}

        numpy_node = nodes_by_id["numpy_scientific_computing"]
        # Preserves learner's reported basic knowledge & reduced review effort
        self.assertEqual(numpy_node["knowledge_status"], "needs_review")
        self.assertLess(numpy_node["estimated_hours"], numpy_node["baseline_hours"])

        # However, because Python (strict prerequisite) is not yet learned, NumPy is waiting for prerequisites!
        self.assertEqual(numpy_node["readiness_status"], "waiting_for_prerequisites")
        self.assertEqual(numpy_node["status"], "blocked")
        self.assertIn("python_programming", numpy_node["unmet_strict_prerequisites"])

        # Dependent skills of NumPy (Pandas, Classical ML) are also waiting for prerequisites
        self.assertEqual(
            nodes_by_id["pandas_data_wrangling"]["readiness_status"],
            "waiting_for_prerequisites",
        )
        self.assertEqual(
            nodes_by_id["classical_machine_learning"]["readiness_status"],
            "waiting_for_prerequisites",
        )

        # And START HERE is Python Programming (not NumPy or Pandas)
        self.assertEqual(roadmap["recommended_first_skill_id"], "python_programming")

    def test_05_scenario_d_build_llm_application_without_deep_learning_blocker(self):
        """
        Scenario D: Build an application using an existing LLM.
        Verify that the plan does not unnecessarily force the learner to master
        deep learning or classical ML from scratch before using a pretrained LLM.
        """
        req = LearnerInputRequest.from_dict({
            "learner_name": "Morgan",
            "target_goal": "Build and deploy an AI application using an LLM",
            "current_skills": [
                {"skill_name": "Python", "proficiency": "confident"},
            ],
            "study_time": {
                "minutes_per_day": 90,
                "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
            },
            "allow_safe_fallback": True,
        })
        roadmap = build_personalized_roadmap(req, self.kb)
        nodes_by_id = {n["skill_id"]: n for n in roadmap["skill_nodes"]}

        self.assertEqual(roadmap["matched_goal_id"], "llm_app_deployment")
        # Deep learning and classical ML are NOT forced into the practical LLM application plan
        self.assertNotIn("deep_learning_neural_nets", nodes_by_id)
        self.assertNotIn("classical_machine_learning", nodes_by_id)

        # With Python known, LLM Foundations & Structured Output Engineering is immediately available_now!
        self.assertIn("llm_foundations_prompting", nodes_by_id)
        self.assertEqual(
            nodes_by_id["llm_foundations_prompting"]["readiness_status"],
            "available_now",
        )

    def test_06_scenario_e_complete_prerequisite_updates_readiness_and_next(self):
        """
        Scenario E: Complete a prerequisite.
        Verify that the relevant dependent skills become available and that the
        displayed first/next recommendation changes correctly.
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test_skillbridge.db"
            temp_db = RoadmapDatabase(db_path=db_path)

            req = LearnerInputRequest.from_dict({
                "learner_name": "Casey",
                "target_goal": "Learn web development from the beginning",
                "current_skills": [],
                "study_time": {
                    "minutes_per_day": 90,
                    "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                },
                "allow_safe_fallback": True,
            })
            roadmap = build_personalized_roadmap(req, self.kb)
            rm_id = roadmap["roadmap_id"]
            temp_db.save_roadmap(roadmap)

            # Initially HTML/CSS is START HERE, and JavaScript + Accessibility are blocked by HTML/CSS
            self.assertEqual(roadmap["recommended_first_skill_id"], "html_css_foundations")
            nodes_before = {n["skill_id"]: n for n in roadmap["skill_nodes"]}
            self.assertEqual(
                nodes_before["javascript_es6"]["readiness_status"],
                "waiting_for_prerequisites",
            )

            # Complete html_css_foundations
            updated = temp_db.update_skill_status(
                rm_id, "html_css_foundations", "completed", self.kb
            )
            nodes_after = {n["skill_id"]: n for n in updated["skill_nodes"]}

            # JavaScript and Accessibility immediately become available_now
            self.assertEqual(
                nodes_after["javascript_es6"]["readiness_status"],
                "available_now",
            )
            self.assertEqual(
                nodes_after["Accessibility_responsive_ui"]["readiness_status"],
                "available_now",
            )
            # START HERE moves away from completed html_css_foundations
            self.assertNotEqual(updated["recommended_first_skill_id"], "html_css_foundations")
            self.assertIn(
                updated["recommended_first_skill_id"],
                {"git_version_control", "javascript_es6"},
            )

    def test_07_scenario_f_invalid_dependency_graph_and_schedule_compliance(self):
        """
        Scenario F: Invalid dependency graph & schedule compliance.
        Verify that circular prerequisite relationships are detected and that every
        skill schedule respects the dependency graph and stated study capacity.
        """
        skills = {"skill_a", "skill_b", "skill_c"}
        cyclic_edges = [
            {"prerequisite_skill_id": "skill_a", "skill_id": "skill_b", "relationship_type": "strict_prerequisite"},
            {"prerequisite_skill_id": "skill_b", "skill_id": "skill_c", "relationship_type": "strict_prerequisite"},
            {"prerequisite_skill_id": "skill_c", "skill_id": "skill_a", "relationship_type": "strict_prerequisite"},
        ]
        has_cycle, cycle_nodes = detect_circular_prerequisites(skills, cyclic_edges)
        self.assertTrue(has_cycle)
        self.assertEqual(set(cycle_nodes), skills)

        # Verify schedule compliance on Alex's AI Engineer roadmap
        alex_req = LearnerInputRequest.from_dict({
            "learner_name": "Alex",
            "target_goal": "Become an AI Engineer",
            "current_skills": [
                {"skill_name": "Python", "proficiency": "intermediate"},
                {"skill_name": "SQL", "proficiency": "beginner"},
                {"skill_name": "NumPy", "proficiency": "beginner"},
                {"skill_name": "Machine learning", "proficiency": "beginner"},
            ],
            "study_time": {
                "minutes_per_day": 90,
                "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"],
                "start_date": "2026-10-19",
            },
            "allow_safe_fallback": True,
        })
        roadmap = build_personalized_roadmap(alex_req, self.kb)
        sched_by_id = {e["skill_id"]: e for e in roadmap["schedule"]["entries"]}

        for edge in roadmap["prerequisite_edges"]:
            if edge["relationship_type"] == "strict_prerequisite":
                p_entry = sched_by_id[edge["prerequisite_skill_id"]]
                t_entry = sched_by_id[edge["skill_id"]]
                if t_entry["estimated_hours"] > 0 and p_entry["estimated_hours"] > 0:
                    p_end = date.fromisoformat(p_entry["planned_completion_date"])
                    t_start = date.fromisoformat(t_entry["planned_start_date"])
                    self.assertGreaterEqual(
                        t_start,
                        p_end,
                        f"Dependent {t_entry['skill_id']} starts ({t_start}) before strict prerequisite {p_entry['skill_id']} finishes ({p_end})",
                    )

    def test_08_uncertain_custom_goal_flags_confirmation(self):
        req = LearnerInputRequest.from_dict({
            "learner_name": "Devon",
            "target_goal": "Master Quantum Robotics Firmware Design",
            "current_skills": [],
            "study_time": {"minutes_per_day": 60, "study_days": ["Mon", "Wed", "Fri"]},
            "allow_safe_fallback": True,
        })
        roadmap = build_personalized_roadmap(req, self.kb)
        self.assertTrue(roadmap["goal_match_uncertain"])
        self.assertGreater(len(roadmap["closest_goal_candidates"]), 0)

    def test_09_ollama_unavailable_and_repair_flow(self):
        with patch.dict("os.environ", {"OLLAMA_BASE_URL": "http://127.0.0.1:59999"}):
            code, resp = handle_api_action(
                "generate_roadmap",
                {
                    "learner_name": "Alex",
                    "target_goal": "Become an AI Engineer",
                    "current_skills": [{"skill_name": "Python", "proficiency": "intermediate"}],
                    "study_time": {"minutes_per_day": 90, "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"]},
                    "allow_safe_fallback": False,
                },
            )
            self.assertEqual(code, 503)
            self.assertIn("The local AI model is unavailable", resp["error"])

        valid_llm_json = json.dumps({
            "matched_goal_id": "ai_engineer",
            "goal_match_confidence": "high",
            "goal_type": "career_role",
            "personalized_summary": "Ollama tailored plan for Alex building on intermediate Python.",
            "selected_skills": [
                {"skill_id": "python_programming", "importance": "essential", "tailored_rationale": "Core language."},
                {"skill_id": "numpy_scientific_computing", "importance": "essential", "tailored_rationale": "Vector math."},
                {"skill_id": "llm_foundations_prompting", "importance": "essential", "tailored_rationale": "LLM inference."},
            ],
            "assumptions": ["Using local Ollama inference."],
            "missing_information": [],
        })
        with patch(
            "backend.ollama_client._call_ollama_chat_endpoint",
            side_effect=["{broken_json", valid_llm_json],
        ):
            code, resp = handle_api_action(
                "generate_roadmap",
                {
                    "learner_name": "Alex",
                    "target_goal": "Become an AI Engineer",
                    "current_skills": [{"skill_name": "Python", "proficiency": "intermediate"}],
                    "study_time": {"minutes_per_day": 90, "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"]},
                    "allow_safe_fallback": False,
                },
            )
            self.assertEqual(code, 200)
            self.assertEqual(resp["validation_status"]["repair_attempts"], 1)

    def test_10_ml_evaluation_metrics(self):
        report = evaluate_goal_skill_relevance_classifier(self.kb)
        self.assertGreaterEqual(report["metrics"]["f1_score"], 0.9)

    def test_11_saved_plans_session_lifecycle(self):
        """
        Verifies the full Saved Plans session lifecycle:
        - Saving a roadmap
        - Listing saved sessions with START HERE / NEXT TO LEARN and effort metadata
        - Executing a skill completion on a saved session and recording activity history
        - Deleting a saved session
        """
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "test_sessions.db"
            temp_db = RoadmapDatabase(db_path=db_path)

            req = LearnerInputRequest.from_dict({
                "learner_name": "Elena",
                "target_goal": "Become an AI Engineer",
                "current_skills": [{"skill_name": "Python", "proficiency": "confident"}],
                "study_time": {"minutes_per_day": 90, "study_days": ["Mon", "Tue", "Wed", "Thu", "Fri"]},
                "allow_safe_fallback": True,
            })
            roadmap = build_personalized_roadmap(req, self.kb)
            rm_id = roadmap["roadmap_id"]
            temp_db.save_roadmap(roadmap)

            summaries = temp_db.list_roadmaps(kb=self.kb)
            self.assertEqual(len(summaries), 1)
            s0 = summaries[0]
            self.assertEqual(s0["roadmap_id"], rm_id)
            self.assertEqual(s0["learner_name"], "Elena")
            self.assertIsNotNone(s0["recommended_first_skill_id"])
            self.assertIsNotNone(s0["recommended_first_skill_name"])
            self.assertIsNotNone(s0["recommended_next_skill_id"])

            first_skill_id = s0["recommended_first_skill_id"]
            updated = temp_db.update_skill_status(rm_id, first_skill_id, "completed", self.kb)
            self.assertIsNotNone(updated)
            self.assertNotEqual(updated["recommended_first_skill_id"], first_skill_id)
            self.assertEqual(len(updated["progress_history"]), 1)
            self.assertEqual(updated["progress_history"][0]["skill_id"], first_skill_id)

            summaries_after = temp_db.list_roadmaps(kb=self.kb)
            self.assertEqual(len(summaries_after[0]["recent_activity"]), 1)

            deleted = temp_db.delete_roadmap(rm_id)
            self.assertTrue(deleted)
            self.assertEqual(len(temp_db.list_roadmaps(kb=self.kb)), 0)


if __name__ == "__main__":
    unittest.main()

