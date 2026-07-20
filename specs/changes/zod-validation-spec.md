# Spec: Zod Schema Validation for Results API and Parsers

- **Status**: Implemented
- **Author**: diamondburned, Jetski
- **Date**: July 20, 2026

## 1. Executive Summary & Rationale

This document outlines the design and architectural choices for introducing runtime schema validation using **Zod** within the Prism Results Store API and Benchmark Report v0.2 (BRV0.2) parsing logic.

Previously, Prism relied solely on TypeScript compile-time interfaces (defined in [api.ts](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/server/results/api.ts)) to represent GCS results files, and hand-written procedural JavaScript helper functions (such as `safeNum`, `toMs`, and `pct` in [benchmarkReportV02Parser.js](file:///usr/local/google/home/diamondburned/Projects/llm-d/llm-d-prism/src/utils/benchmarkReportV02Parser.js)) to parse and normalize metrics.

### 1.1 Rationale for Zod Migration & Core Challenges

The migration from compile-time TypeScript declarations to runtime Zod validation directly addresses the following core engineering challenges:

- **Unvalidated Field Edits & Inconsistent Propagation**: Before Zod, benchmark field edits in the staging wizard were not validated at all, and changes propagated through them were not consistent. This occasionally led to incomplete or broken benchmark packages being uploaded to GCS. By introducing Zod, validation is strictly enforced at runtime, providing instant, clear UX feedback when users fail to fill in required fields, and ensuring that updates are correctly propagated across all stages of a run.
- **Lack of Type Compliance (Agent & Client-Side Errors)**: Before Zod, code changes on the frontend or backend frequently broke data contracts. Because the frontend client is currently written in pure JavaScript, it did not benefit from compile-time TypeScript checks, allowing type compliance mismatches to go unnoticed. Implementing Zod runtime schemas immediately flags these data contract regressions during both local development iterations and automated testing.
- **Disconnected Client-Server Validation Logic**: Before Zod, the Prism client did not benefit from the strict types defined in Prism's Results Store backend API. The validation logic was not shared, meaning the client could not verify validity without first making a request to the server. Under the Zod architecture, both client and server inherit the exact same isomorphic validation schemas. The client can locally catch, highlight, and report validation errors immediately, removing the need to query the backend server for schema logic.

---

## 2. Technical Architecture & Implementation

### 2.1 Separation of Schema Concerns

Prism handles two distinct formats that require different validation strategies:

1.  **Prism Result Payload Schema (`PrismResultPayloadSchema`)**: 
    This schema governs the unified benchmark run payload stored in GCS and loaded into the Prism DB context. It enforces strict validation rules—such as requiring valid UUID structures for IDs (`runId`, `run_id`), ISO 8601 datetimes (`submitted_at`), specific literal values (`format: "brv02"`), and non-empty stage listings (`entries`).
2.  **Raw Report Ingestion Schema (`RawBRV02ReportSchema`)**: 
    This schema handles parsing and normalizing raw outputs from upstream execution tools (e.g., `inference-perf`). Unlike the internal payload, this schema must accommodate loose types, missing metrics, and varied structures.

### 2.2 Coercion and Preprocessing Pipeline

To clean up manual formatting checks during raw file ingestion, Zod schema declarations consume values through a chain of preprocessors:

- **`z.preprocess()`**: Used to execute numeric sanitization and metric conversions (e.g., converting seconds to milliseconds for latency parameters, normalizing fractions to percentage bounds for KV cache ratios) prior to validating the schema constraints.
- **`z.record(z.string(), ...)`**: Strictly defines the key-value bounds for free-form metadata dictionaries and software versions, ensuring compatibility with standard dictionary lookups.
- **`passthrough()`**: Allows raw reports to include unmapped or new properties, ensuring that updates to upstream tools do not break ingestion.

---

## 3. Trade-offs: Pros vs. Cons

### 3.1 Pros

- **Self-Documenting Schemas**: The structure of validated API inputs and report files is described declaratively, replacing procedural nested property checks.
- **Structural Guardrails**: Deep property accesses (e.g., `results.request_performance.aggregate.latency`) are validated as safe and structured before retrieval, preventing runtime crashes.
- **Detailed Error Reporting**: Zod returns structured error definitions (`ZodError`) specifying the exact path and validation failure code, allowing the front-end wizard to show clear feedback to users during upload staging.

### 3.2 Cons

- **Permissiveness Dilution**: Because the Results Store allows incomplete uploads (e.g., runs with missing performance or observability metrics), the raw report schema must mark almost every property as optional and nullable. When everything is permissive, the schema acts more as a parser/mapper than a strict validation gate.
- **TypeScript Alignment**: Using Zod inside the JS parser file (`benchmarkReportV02Parser.js`) requires runtime imports but does not yield full compile-time validation unless the parser is fully migrated to TypeScript (`.ts`).

---

## 4. Addressing Schema Duplication (Mapped Utility Proposal)

To address the repetitive declaration of optional and nullable fields across deeply nested structures (a limitation documented in [Zod GitHub Issue #2893](https://github.com/colinhacks/zod/issues/2893)), Prism proposes using a recursive utility function `deepNullish`.

This utility maps over a strict, master schema of the benchmark report format and returns a version where every nested property is recursively wrapped in `z.nullable().optional()`:

```typescript
import { z } from "zod";

/**
 * Recursively converts a strict schema to make all nested fields nullish (optional and nullable).
 */
export function deepNullish(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const newShape: any = {};
    for (const key in shape) {
      newShape[key] = deepNullish(shape[key]);
    }
    return z.object(newShape).nullish();
  }
  
  if (schema instanceof z.ZodArray) {
    return z.array(deepNullish(schema.element)).nullish();
  }
  
  return schema.nullish();
}
```

By introducing this pattern, developers can declare the canonical structure of a benchmark report once, then output the loose ingestion schema dynamically, preserving clean types while reducing code redundancy.

---

## 5. UI Integration & Field-Specific Visual Feedback

To improve the contributor user experience during the local staging and validation wizard, Zod validation errors and stage-level consistency checks are propagated as a structured mapping of field keys to their error status:

- **Field Path Keying**: Errors parsed from `ZodError` issues are mapped to dot-separated path strings (e.g., `model_name`, `hardware.hardware_name`).
- **Dynamic CSS Styling**: Input fields in the `SubmitValidationPage` form query `bundle.validation.fieldErrors[fieldKey]` to dynamically apply red/amber borders and text highlighting depending on whether the error severity is a blocking `'error'` or a non-blocking `'warning'`.
- **Consistency Verification**: Verification checks—such as ensuring that individual stage entries match the top-level metadata inputs—also write to the same `fieldErrors` structure, giving uniform visual indicators across both schema violations and consistency mismatches.
