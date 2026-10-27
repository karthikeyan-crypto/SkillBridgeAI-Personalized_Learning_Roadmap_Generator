"""
SkillBridge AI — Model Evaluation, Error Correction & Roadmap Quality Auditing.
Calculates real confusion-matrix metrics (TP, TN, FP, FN, Accuracy, Precision, Recall, F1)
from actual goal-to-skill relevance predictions against verified benchmark labels in the
knowledge base, and audits individual roadmaps for completeness, DAG validity, resource
coverage, and schedule feasibility.
"""

from __future__ import annotations
from typing import Dict, Any, List, Optional
from backend.planner import KnowledgeBase, detect_circular_prerequisites


def evaluate_goal_skill_relevance_classifier(kb: KnowledgeBase) -> Dict[str, Any]:
    """
    Evaluates the planner's goal-to-skill relevance prediction task against the
    labelled evaluation_benchmark pairs in knowledge_base.json.
    Never fabricates evaluation numbers; computes exact TP, TN, FP, FN from real predictions.
    """
    benchmark = kb.evaluation_benchmark
    if not benchmark:
        return {
            "status": "Not evaluated yet",
            "message": "No labelled test dataset available.",
        }

    tp = 0
    tn = 0
    fp = 0
    fn = 0
    detailed_cases: List[Dict[str, Any]] = []

    for row in benchmark:
        gid = row["goal_id"]
        sid = row["skill_id"]
        actual = int(row["actual_relevant"])

        goal_obj = kb.goals.get(gid)
        if not goal_obj:
            continue

        # Planner prediction: is `sid` selected as essential or recommended for `gid`?
        predicted_skills = set(goal_obj.get("essential_skills", [])) | set(
            goal_obj.get("recommended_skills", [])
        )
        predicted = 1 if sid in predicted_skills else 0

        if predicted == 1 and actual == 1:
            tp += 1
            outcome = "TP"
        elif predicted == 0 and actual == 0:
            tn += 1
            outcome = "TN"
        elif predicted == 1 and actual == 0:
            fp += 1
            outcome = "FP"
        else:
            fn += 1
            outcome = "FN"

        detailed_cases.append({
            "goal_id": gid,
            "skill_id": sid,
            "predicted": predicted,
            "actual": actual,
            "outcome": outcome,
        })

    total = tp + tn + fp + fn
    if total == 0:
        return {
            "status": "Not evaluated yet",
            "message": "No valid benchmark pairs evaluated.",
        }

    accuracy = round((tp + tn) / total, 4)
    precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
    recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
    f1_score = (
        round((2 * precision * recall) / (precision + recall), 4)
        if (precision + recall) > 0
        else 0.0
    )

    return {
        "status": "Evaluated against O*NET / ESCO verified benchmark labels",
        "task_description": "Binary relevance classification predicting whether a technical skill is core/essential for a target career or project goal.",
        "sample_size": total,
        "confusion_matrix": {
            "true_positives": tp,
            "true_negatives": tn,
            "false_positives": fp,
            "false_negatives": fn,
        },
        "metrics": {
            "accuracy": accuracy,
            "precision": precision,
            "recall": recall,
            "f1_score": f1_score,
        },
        "calibration_disclosure": (
            "Relevance scores reflect taxonomic match against curated O*NET/ESCO occupation-skill mappings, "
            "not calibrated posterior probabilities. Self-reported LLM confidence is never used as an accuracy metric."
        ),
        "cases": detailed_cases,
    }


def audit_roadmap_quality(roadmap: Dict[str, Any], kb: KnowledgeBase) -> Dict[str, Any]:
    """
    Audits a generated roadmap across 4 engineering dimensions:
    1. Catalogue Essential Completeness
    2. Prerequisite DAG Compliance
    3. Verified Resource Coverage
    4. Schedule Capacity & Deadline Feasibility
    """
    matched_gid = roadmap.get("matched_goal_id", "ai_engineer")
    goal_obj = kb.goals.get(matched_gid, kb.goals["ai_engineer"])
    expected_essential = set(goal_obj.get("essential_skills", []))

    nodes = roadmap.get("skill_nodes", [])
    plan_skill_ids = {n["skill_id"] for n in nodes}

    covered_essential = expected_essential & plan_skill_ids
    essential_completeness = (
        round(len(covered_essential) / len(expected_essential), 4)
        if expected_essential
        else 1.0
    )

    edges = roadmap.get("prerequisite_edges", [])
    has_cycle, _ = detect_circular_prerequisites(plan_skill_ids, edges)

    # Verify topological ordering in schedule for strict prerequisites
    seq_by_id = {n["skill_id"]: n["sequence_order"] for n in nodes}
    ordering_violations = 0
    for edge in edges:
        if edge.get("relationship_type", "strict_prerequisite") != "strict_prerequisite":
            continue
        p_id = edge["prerequisite_skill_id"]
        t_id = edge["skill_id"]
        if p_id in seq_by_id and t_id in seq_by_id:
            if seq_by_id[p_id] >= seq_by_id[t_id]:
                ordering_violations += 1

    nodes_with_resources = sum(1 for n in nodes if len(n.get("resources", [])) > 0)
    resource_coverage = round(nodes_with_resources / max(len(nodes), 1), 4)

    sched = roadmap.get("schedule", {})
    is_deadline_feasible = bool(sched.get("is_deadline_feasible", True))

    return {
        "essential_skill_completeness": essential_completeness,
        "expected_essential_count": len(expected_essential),
        "covered_essential_count": len(covered_essential),
        "prerequisite_dag_valid": (not has_cycle) and (ordering_violations == 0),
        "circular_dependencies_detected": has_cycle,
        "topological_ordering_violations": ordering_violations,
        "verified_resource_coverage": resource_coverage,
        "nodes_with_verified_resources": nodes_with_resources,
        "total_nodes": len(nodes),
        "schedule_deadline_feasible": is_deadline_feasible,
    }
