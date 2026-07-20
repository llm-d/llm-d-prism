// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Root container representing the JSON payload content stored inside a result file inside the bucket.
 * Verified by validatePrismUploadStructure.
 */
export interface PrismResultPayload {
    /** Unique identifier for the run. Generated as a unique UUIDv4 on staging. Example: "3f8c8b73-049e-4e4b-bb66-e8e08d6d63c3" */
    runId: string;
    /** Human-readable label representing the run. Usually defaults to parent folder name. Example: "gemma-4-9b-it" */
    runLabel: string;
    /** Standardized, canonical name of the target model being evaluated. Example: "meta-llama/Llama-3-8B-Instruct" */
    model_name: string;
    /** Hardware metadata container. Rejects "Unknown" or "Unknown Hardware" on final upload. */
    hardware: {
        /** Normalized name of the accelerator hardware. Example: "H100" or "TPU v6e" */
        hardware_name: string;
        /** Total count of accelerator chips used. Example: 8 */
        accelerator_count?: number | null;
    };
    /** Target upload and parsing schema format. Must be exactly "brv02". */
    format: "brv02";
    /** Author metadata representing the GitHub user who submitted the benchmark. */
    github_author?: {
        /** GitHub username of the contributor. Example: "octocat" */
        username: string;
    } | null;
    /** Date and time when the benchmark run was submitted, formatted as an ISO 8601 string. Example: "2026-07-07T22:13:42.000Z" */
    submitted_at?: string | null;
    /** Selected "Well-Lit Path" optimization and deployment classification. Example: "optimized-baseline" */
    well_lit_path?: string | null;
    /** Name of the primary backend inference execution engine. Example: "vllm" | "tgi" | "sglang" */
    inference_tool?: string;
    /** Software version of the main inference execution tool. Example: "v0.4.2" */
    inference_tool_version?: string;
    /** Flat key-value record mapping secondary software dependencies/tools to their versions. Example: { "guidellm": "v0.1.0" } */
    other_tools?: Record<string, string>;
    /** Flat key-value record mapping deployment configuration manifest files to their hosted URLs. Example: { "vllm_service": "https://github.com/.../vllm.yaml" } */
    manifests?: Record<string, string>;
    /** Flat key-value record mapping verification run logs/evidence to their storage bucket URLs. Example: { "run_log": "gs://llm-d-benchmarks/regressions/gemma2_9b/run.log" } */
    evidence?: Record<string, string>;
    /** Raw parsed YAML content dictionary harvested from run_metadata.yaml if found. */
    run_metadata?: Record<string, unknown>;
    /** User custom JSON metadata dictionary editable dynamically within the dashboard inline editor. */
    metadata?: Record<string, unknown>;
    /** Feedback reason for rejection or change requests, if any. */
    feedback?: string | null;
    /** Optional review metadata including reviewer and review status change history. */
    review?: {
        reviewer?: string;
        reviewedAt?: string;
        history?: Array<{
            status: string;
            changedAt: string;
            by: string;
        }>;
    } | null;
    /** Collection of stage-level benchmark metric documents. Rejects empty lists. */
    entries: PrismStageEntry[];
}

/**
 * Represents an individual benchmark stage entry nested inside the parent run bundle.
 */
export interface PrismStageEntry {
    /** Unique identifier for the stage. Generated as a unique UUIDv4 by Prism. */
    run_id: string;
    /** Human-friendly run description/label matching the parent run. Example: "gemma-4-9b-it" */
    run_description: string;
    /** Original filename of the evaluated benchmark stage report. Example: "benchmark_report_v0.2_stage_1.yaml" */
    filename: string;
    /**
     * The parsed content of the stage report. Note that this contains the target parsed/mapped representation used inside the Prism DB context.
     * Must conform to Benchmark Report v0.2 (treated as partial/optional).
     */
    raw_report: Record<string, unknown>;
}

/**
 * Represents the current status/state of a benchmark submission on Prism Cloud.
 */
export type PrismSubmissionState =
    | 'staged'
    | 'submitted_pending_processing'
    | 'submitted_pending_review'
    | 'public'
    | 'promoted'
    | 'rejected';

/**
 * Describes the custom object contexts attached to a benchmark result file on Google Cloud Storage.
 */
export interface PrismResultContext {
    submission_state: { value: string };
    github_user: { value: string };
    run_id: { value: string };
    hardware_name: { value: string };
    model_name: { value: string };
    run_label: { value: string };
    feedback?: { value: string };
    well_lit_path?: { value: string };
}

