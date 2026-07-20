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

import { z } from 'zod';

/**
 * Represents an individual benchmark stage entry nested inside the parent run bundle.
 */
export const PrismStageEntrySchema = z.object({
    /** Unique identifier for the stage. Generated as a unique UUIDv4 by Prism. */
    run_id: z.string().uuid(),
    /** Human-friendly run description/label matching the parent run. Example: "gemma-4-9b-it" */
    run_description: z.string(),
    /** Original filename of the evaluated benchmark stage report. Example: "benchmark_report_v0.2_stage_1.yaml" */
    filename: z.string(),
    /**
     * The parsed content of the stage report. Note that this contains the target parsed/mapped representation used inside the Prism DB context.
     * Must conform to Benchmark Report v0.2 (treated as partial/optional).
     */
    raw_report: z.record(z.string(), z.unknown()),
});

/**
 * Represents the current status/state of a benchmark submission on Prism Cloud.
 */
export const PrismSubmissionStateSchema = z.enum([
    'staged',
    'submitted_pending_processing',
    'submitted_pending_review',
    'public',
    'promoted',
    'rejected',
]);

/**
 * Root container representing the JSON payload content stored inside a result file inside the bucket.
 * Verified by validatePrismUploadStructure.
 */
export const PrismResultPayloadSchema = z.object({
    /** Unique identifier for the run. Generated as a unique UUIDv4 on staging. Example: "3f8c8b73-049e-4e4b-bb66-e8e08d6d63c3" */
    runId: z.string().uuid(),
    /** Human-readable label representing the run. Usually defaults to parent folder name. Example: "gemma-4-9b-it" */
    runLabel: z.string(),
    /** Standardized, canonical name of the target model being evaluated. Example: "meta-llama/Llama-3-8B-Instruct" */
    model_name: z.string()
        .min(1, "Model name cannot be empty")
        .refine(val => val !== 'Unknown', { message: "Model name cannot be 'Unknown'" }),
    /** Hardware metadata container. Rejects "Unknown" or "Unknown Hardware" on final upload. */
    hardware: z.object({
        /** Normalized name of the accelerator hardware. Example: "H100" or "TPU v6e" */
        hardware_name: z.string()
            .min(1, "Hardware name cannot be empty")
            .refine(val => val !== 'Unknown' && val !== 'Unknown Hardware', { message: "Hardware name cannot be 'Unknown' or 'Unknown Hardware'" }),
        /** Total count of accelerator chips used. Example: 8 */
        accelerator_count: z.number().nullable().optional(),
    }),
    /** Target upload and parsing schema format. Must be exactly "brv02". */
    format: z.literal("brv02"),
    /** Author metadata representing the GitHub user who submitted the benchmark. */
    github_author: z.object({
        /** GitHub username of the contributor. Example: "octocat" */
        username: z.string(),
    }).nullable().optional(),
    /** Date and time when the benchmark run was submitted, formatted as an ISO 8601 string. Example: "2026-07-07T22:13:42.000Z" */
    submitted_at: z.string().datetime().nullable().optional(),
    /** Selected "Well-Lit Path" optimization and deployment classification. Example: "optimized-baseline" */
    well_lit_path: z.string().nullable().optional(),
    /** Name of the primary backend inference execution engine. Example: "vllm" | "tgi" | "sglang" */
    inference_tool: z.string().optional(),
    /** Software version of the main inference execution tool. Example: "v0.4.2" */
    inference_tool_version: z.string().optional(),
    /** Flat key-value record mapping secondary software dependencies/tools to their versions. Example: { "guidellm": "v0.1.0" } */
    other_tools: z.record(z.string(), z.string()).optional(),
    /** Flat key-value record mapping deployment configuration manifest files to their hosted URLs. Example: { "vllm_service": "https://github.com/.../vllm.yaml" } */
    manifests: z.record(z.string(), z.string()).optional(),
    /** Flat key-value record mapping verification run logs/evidence to their storage bucket URLs. Example: { "run_log": "gs://llm-d-benchmarks/regressions/gemma2_9b/run.log" } */
    evidence: z.record(z.string(), z.string()).optional(),
    /** Raw parsed YAML content dictionary harvested from run_metadata.yaml if found. */
    run_metadata: z.record(z.string(), z.unknown()).optional(),
    /** User custom JSON metadata dictionary editable dynamically within the dashboard inline editor. */
    metadata: z.record(z.string(), z.unknown()).optional(),
    /** Feedback reason for rejection or change requests, if any. */
    feedback: z.string().nullable().optional(),
    /** Optional review metadata including reviewer and review status change history. */
    review: z.object({
        reviewer: z.string().optional(),
        reviewedAt: z.string().datetime().optional(),
        history: z.array(z.object({
            status: z.string(),
            changedAt: z.string().datetime(),
            by: z.string(),
        })).optional(),
    }).nullable().optional(),
    /** Collection of stage-level benchmark metric documents. Rejects empty lists. */
    entries: z.array(PrismStageEntrySchema).nonempty(),
});

const ContextValueSchema = z.object({ value: z.string() });

/**
 * Describes the custom object contexts attached to a benchmark result file on Google Cloud Storage.
 */
export const PrismResultContextSchema = z.object({
    submission_state: ContextValueSchema,
    github_user: ContextValueSchema,
    run_id: ContextValueSchema,
    hardware_name: ContextValueSchema,
    model_name: ContextValueSchema,
    run_label: ContextValueSchema,
    feedback: ContextValueSchema.optional(),
    well_lit_path: ContextValueSchema.optional(),
});

// TypeScript type inference definitions
export type PrismStageEntry = z.infer<typeof PrismStageEntrySchema>;
export type PrismSubmissionState = z.infer<typeof PrismSubmissionStateSchema>;
export type PrismResultPayload = z.infer<typeof PrismResultPayloadSchema>;
export type PrismResultContext = z.infer<typeof PrismResultContextSchema>;
