import React from 'react';
import { X, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { EvaluationReportResponse, RoadmapResponse } from '../types/roadmap';

interface EvaluationAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  evaluationData: EvaluationReportResponse | null;
  roadmap: RoadmapResponse | null;
}

export const EvaluationAuditModal: React.FC<EvaluationAuditModalProps> = ({
  isOpen,
  onClose,
  evaluationData,
  roadmap,
}) => {
  if (!isOpen) return null;

  const ml = evaluationData?.ml_evaluation;
  const audit = roadmap?.quality_audit || evaluationData?.roadmap_audit;
  const val = roadmap?.validation_status;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eval-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs"
    >
      <div className="bg-[#0F172A] border border-slate-700 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono text-indigo-400 mb-1">
              <ShieldCheck className="w-4 h-4" />
              <span>SYSTEM VERIFICATION & ML BENCHMARK REPORT</span>
            </div>
            <h2 id="eval-modal-title" className="text-lg font-bold text-slate-100">
              Model Evaluation, Error Correction & Curriculum Audit
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close evaluation audit dialog"
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Active Roadmap Validation & Error Correction Status */}
        {val && audit && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-300">
              Active Roadmap Validation & Error Correction
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs tabular-nums">
              <div>
                <div className="text-slate-400">Schema & DAG Valid</div>
                <div className="mt-1 text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {audit.prerequisite_dag_valid ? '100% Valid DAG' : 'Invalid'}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Essential Coverage</div>
                <div className="mt-1 text-slate-100 font-semibold">
                  {audit.covered_essential_count}/{audit.expected_essential_count} (
                  {Math.round(audit.essential_skill_completeness * 100)}%)
                </div>
              </div>
              <div>
                <div className="text-slate-400">Resource Coverage</div>
                <div className="mt-1 text-cyan-300 font-semibold">
                  {audit.nodes_with_verified_resources}/{audit.total_nodes} (
                  {Math.round(audit.verified_resource_coverage * 100)}%)
                </div>
              </div>
              <div>
                <div className="text-slate-400">Repair Attempts</div>
                <div className="mt-1 text-slate-200 font-semibold">
                  {val.repair_attempts} · {val.is_fallback ? 'Safe Fallback' : 'Ollama Live'}
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{val.confidence_note}</p>
          </div>
        )}

        {/* 2. Real Machine-Learning Classification Benchmark */}
        {ml ? (
          <div className="space-y-3 pt-4 border-t border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-300">
                Goal-to-Skill Relevance Classifier Evaluation (n = {ml.sample_size} Verified Pairs)
              </h3>
              <span className="text-xs font-mono text-emerald-400">{ml.status}</span>
            </div>
            <p className="text-xs text-slate-400">{ml.task_description}</p>

            {/* Confusion Matrix & Classification Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs tabular-nums">
              <div>
                <div className="text-slate-400">Confusion Matrix</div>
                <div className="mt-1 text-slate-200">
                  TP: {ml.confusion_matrix.true_positives} · TN: {ml.confusion_matrix.true_negatives}
                </div>
                <div className="text-slate-400">
                  FP: {ml.confusion_matrix.false_positives} · FN: {ml.confusion_matrix.false_negatives}
                </div>
              </div>
              <div>
                <div className="text-slate-400">Accuracy</div>
                <div className="mt-1 text-base font-bold text-slate-100">
                  {(ml.metrics.accuracy * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">Precision / Recall</div>
                <div className="mt-1 text-base font-bold text-indigo-300">
                  {(ml.metrics.precision * 100).toFixed(1)}% / {(ml.metrics.recall * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-400">F1-Score</div>
                <div className="mt-1 text-base font-bold text-cyan-300">
                  {ml.metrics.f1_score.toFixed(4)}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80 text-xs text-slate-400">
              <strong className="text-slate-300">Calibration vs. Confidence Disclosure: </strong>
              {ml.calibration_disclosure}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400">Not evaluated yet.</div>
        )}
      </div>
    </div>
  );
};
