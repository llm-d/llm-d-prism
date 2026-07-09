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

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, no-unused-vars */

import { storage, getPrismResultsBucket } from '../../server/results/gcs.ts';
import { parseReportV02, stageToEntry } from '../../src/utils/benchmarkReportV02Parser.js';
import { parseJsonEntry } from '../../src/utils/dataParser.js';
import { Command } from 'commander';
import yaml from 'js-yaml';
import { PrismSummaryEntry } from '../../server/results/api.ts';

async function asyncPool<T, R>(
    concurrency: number,
    iterable: T[],
    iteratorFn: (item: T) => Promise<R>
): Promise<R[]> {
    const ret: Promise<R>[] = [];
    const executing: Set<Promise<any>> = new Set();
    
    for (const item of iterable) {
        const p = Promise.resolve().then(() => iteratorFn(item));
        ret.push(p);
        executing.add(p);
        
        const clean = () => executing.delete(p);
        p.then(clean, clean);
        
        if (executing.size >= concurrency) {
            await Promise.race(executing);
        }
    }
    return Promise.all(ret);
}

function getSummaryFromEntries(entries: any[]): PrismSummaryEntry[] {
    return entries.map(e => {
        return {
            runLabel: e.runLabel || e.run_description || '',
            github_author: e.github_author,
            model: e.model || e.model_name || 'Unknown',
            model_name: e.model_name || e.model || 'Unknown',
            hardware: e.hardware || e.metadata?.hardware || 'Unknown',
            precision: e.precision || e.metadata?.precision || 'Unknown',
            backend: e.backend || e.metadata?.backend || 'Unknown',
            isl: e.isl || e.workload?.input_tokens || 0,
            osl: e.osl || e.workload?.output_tokens || 0,
            timestamp: e.timestamp || e.metadata?.timestamp || null,
            throughput: e.throughput || e.metrics?.throughput || null,
            latency: {
                mean: e.latency?.mean ?? e.metrics?.latency?.mean ?? null
            },
            components: e.components || e.metadata?.components || [],
            metadata: {
                model_name: e.metadata?.model_name || e.model_name || 'Unknown',
                backend: e.metadata?.backend || e.backend || 'Unknown',
                hardware: e.metadata?.hardware || e.hardware || 'Unknown',
                accelerator_type: e.metadata?.accelerator_type || e.hardware || 'Unknown',
                accelerator_count: e.metadata?.accelerator_count || 1,
                precision: e.metadata?.precision || 'Unknown',
                timestamp: e.metadata?.timestamp || e.timestamp || null,
                tp: e.metadata?.tp || 1,
                architecture: e.metadata?.architecture || 'aggregate',
                components: e.metadata?.components || e.components || []
            },
            workload: {
                input_tokens: e.workload?.input_tokens || e.isl || 0,
                output_tokens: e.workload?.output_tokens || e.osl || 0,
                stage: e.workload?.stage ?? 1
            }
        };
    });
}

async function processResultsStoreFile(file: any, dryRun: boolean): Promise<{ status: 'skipped' | 'updated' | 'error'; error?: string }> {
    try {
        const metadata = file.metadata;
        const customMetadata = metadata?.metadata || {};
        
        const [contents] = await file.download();
        const contentStr = contents.toString('utf8');
        
        const payload = JSON.parse(contentStr);
        if (!payload || !payload.entries) {
            return { status: 'error', error: 'Invalid Results Store payload: missing entries' };
        }
        
        const entries: any[] = [];
        for (const entry of payload.entries) {
            const parsedStage = parseReportV02(entry.raw_report, entry.filename);
            if (parsedStage) {
                parsedStage.runId = payload.runId;
                parsedStage.runLabel = payload.runLabel;
                parsedStage.run_metadata = payload.run_metadata;
                if (payload.metadata?.config) {
                    parsedStage.config = payload.metadata.config;
                }
                const fullEntry = stageToEntry(parsedStage);
                if (payload.github_author) {
                    fullEntry.github_author = payload.github_author;
                }
                entries.push(fullEntry);
            }
        }

        if (entries.length === 0) {
            return { status: 'skipped', error: 'No benchmark entries parsed' };
        }

        const summary = getSummaryFromEntries(entries);
        const summaryStr = JSON.stringify(summary);

        const currentSummary = String(customMetadata.prism_summary || '');
        if (currentSummary === summaryStr) {
            return { status: 'skipped' };
        }

        if (!dryRun) {
            await file.setMetadata({
                metadata: {
                    ...customMetadata,
                    prism_summary: summaryStr
                }
            });
        }

        return { status: 'updated' };
    } catch (e: any) {
        return { status: 'error', error: e.message };
    }
}

async function run(force: boolean, dryRun: boolean, bucketName: string) {
    console.log(`Starting backfill. Mode: ${force ? 'force' : 'quick'}, Dry Run: ${dryRun}`);

    const bucket = storage.bucket(bucketName);
    console.log(`Target GCS Bucket: gs://${bucketName}`);

    let totalFiles = 0;
    let checkedFiles = 0;
    let skippedFiles = 0;
    let updatedFiles = 0;
    let errorFiles = 0;

    // Fetch all files in the bucket
    console.log('Listing all files in bucket...');
    const allFiles: any[] = [];
    let pageToken: string | undefined = undefined;
    do {
        const [files, nextQuery]: [any[], any] = await bucket.getFiles({
            pageToken,
            autoPaginate: false
        });
        allFiles.push(...files);
        pageToken = nextQuery?.pageToken;
    } while (pageToken);

    console.log(`Found ${allFiles.length} GCS objects. Grouping by folder...`);

    const resultsStoreFiles: any[] = [];
    const adhocFilesByFolder: Map<string, any[]> = new Map();

    for (const file of allFiles) {
        if (file.name.endsWith('/')) {
            continue;
        }
        if (file.name.endsWith('.keep') || file.name.split('/').pop()?.startsWith('.')) {
            continue;
        }

        if (file.name.startsWith('prism-results-store/')) {
            if (file.name.endsWith('.json')) {
                resultsStoreFiles.push(file);
            }
        } else {
            const baseName = file.name.split('/').pop() || '';
            if (baseName === 'per_request_lifecycle_metrics.json') {
                continue;
            }
            const isCandidate = file.name.endsWith('.json') || file.name.endsWith('.yaml') || file.name.endsWith('.yml') || file.name.endsWith('.log');
            if (isCandidate) {
                const parts = file.name.split('/');
                parts.pop();
                const folderPath = parts.join('/') + '/';
                
                if (!adhocFilesByFolder.has(folderPath)) {
                    adhocFilesByFolder.set(folderPath, []);
                }
                adhocFilesByFolder.get(folderPath)!.push(file);
            }
        }
    }

    console.log(`Results Store files to index: ${resultsStoreFiles.length}`);
    console.log(`Ad-hoc folders containing benchmark runs: ${adhocFilesByFolder.size}`);

    // 1. Process Results Store files in parallel (concurrency: 10)
    await asyncPool(10, resultsStoreFiles, async (file) => {
        totalFiles++;
        const metadata = file.metadata;
        const customMetadata = metadata?.metadata || {};
        const hasSummary = !!customMetadata.prism_summary;
        
        if (hasSummary && !force) {
            skippedFiles++;
            return;
        }
        
        checkedFiles++;
        console.log(`Processing Results Store run: ${file.name}...`);
        const res = await processResultsStoreFile(file, dryRun);
        if (res.status === 'updated') {
            console.log(`  -> Successfully indexed: ${file.name}`);
            updatedFiles++;
        } else if (res.status === 'skipped') {
            console.log(`  -> Skipped ${file.name}. ${res.error ? `Reason: ${res.error}` : ''}`);
            skippedFiles++;
        } else {
            console.error(`  -> ERROR on ${file.name}: ${res.error}`);
            errorFiles++;
        }
    });

    // 2. Process ad-hoc folders as unified runs in parallel (concurrency: 5)
    const foldersList = Array.from(adhocFilesByFolder.entries());
    
    await asyncPool(5, foldersList, async ([folderPath, files]) => {
        // Only parse BRV01 and BRV02 report files (benchmark_report prefix with json/yaml/yml extension)
        const filesToParse = files.filter(f => {
            const baseName = (f.name.split('/').pop() || '').toLowerCase();
            return baseName.startsWith('benchmark_report') && 
                   (baseName.endsWith('.json') || baseName.endsWith('.yaml') || baseName.endsWith('.yml'));
        });

        if (filesToParse.length === 0) {
            skippedFiles += files.length;
            return;
        }

        totalFiles += files.length;

        // Determine if this folder needs checking
        const needsIndex = force || filesToParse.some(f => !f.metadata?.metadata?.prism_summary);
        if (!needsIndex) {
            skippedFiles += files.length;
            return;
        }

        console.log(`Processing folder run: ${folderPath}...`);
        checkedFiles += filesToParse.length;

        const v01Entries: any[] = [];
        const v02Entries: any[] = [];
        const parsedV01Files: any[] = [];
        const parsedV02Files: any[] = [];

        // Fetch target files in parallel
        await Promise.all(filesToParse.map(async (file) => {
            try {
                const [contents] = await file.download();
                const contentStr = contents.toString('utf8');

                // Try parsing as YAML/JSON
                let parsedDoc: any = null;
                let isYaml = false;
                let isJson = false;

                try {
                    parsedDoc = JSON.parse(contentStr);
                    isJson = true;
                } catch {
                    try {
                        parsedDoc = yaml.load(contentStr);
                        isYaml = true;
                    } catch {
                        // Not valid JSON/YAML. Could be a raw log file.
                    }
                }

                let fileEntries: any[] = [];
                let isV02File = false;

                if (parsedDoc && typeof parsedDoc === 'object') {
                    if (parsedDoc.version === '0.2') {
                        isV02File = true;
                        const parsedStage = parseReportV02(parsedDoc, file.name);
                        if (parsedStage) {
                            const entry = stageToEntry(parsedStage);
                            fileEntries = [entry];
                        }
                    } else if (parsedDoc.metrics || parsedDoc.load_summary) {
                        const entry = parseJsonEntry({ ...parsedDoc, source: 'gcs-backfill' }, file.name);
                        fileEntries = [entry];
                    }
                }

                if (fileEntries.length > 0) {
                    const hasDate = file.name.match(/(\d{8})-(\d{6})/);
                    fileEntries.forEach(e => {
                        if (!hasDate) {
                            e.timestamp = null;
                            if (e.metadata) {
                                e.metadata.timestamp = null;
                            }
                        }
                        const folderBase = folderPath.split('/').filter(Boolean).pop() || '';
                        e.runLabel = folderBase;
                    });

                    if (isV02File) {
                        v02Entries.push(...fileEntries);
                        parsedV02Files.push(file);
                    } else {
                        v01Entries.push(...fileEntries);
                        parsedV01Files.push(file);
                    }
                }
            } catch (err: any) {
                console.warn(`  -> Failed to read/parse ${file.name}: ${err.message}`);
            }
        }));

        // Apply V0.2 vs V0.1 precedence rules
        let allEntries: any[] = [];
        let parsedFilesToUpdate: any[] = [];

        if (v02Entries.length > 0) {
            allEntries = v02Entries;
            parsedFilesToUpdate = [...parsedV02Files, ...parsedV01Files];
        } else {
            allEntries = v01Entries;
            parsedFilesToUpdate = parsedV01Files;
        }

        if (allEntries.length === 0) {
            console.log(`  -> No result-run files could be parsed in folder: ${folderPath}`);
            skippedFiles += files.length;
            return;
        }

        const summary = getSummaryFromEntries(allEntries);
        const summaryStr = JSON.stringify(summary);

        // Update metadata for all files in parallel
        await Promise.all(parsedFilesToUpdate.map(async (file) => {
            const currentSummary = String(file.metadata?.metadata?.prism_summary || '');
            if (currentSummary === summaryStr) {
                skippedFiles++;
                console.log(`  -> Skipped ${file.name} (Summary metadata already up-to-date)`);
                return;
            }

            if (!dryRun) {
                try {
                    await file.setMetadata({
                        metadata: {
                            ...(file.metadata?.metadata || {}),
                            prism_summary: summaryStr
                        }
                    });
                    console.log(`  -> Updated summary metadata for ${file.name}`);
                    updatedFiles++;
                } catch (err: any) {
                    console.error(`  -> Failed to update metadata for ${file.name}: ${err.message}`);
                    errorFiles++;
                }
            } else {
                console.log(`  -> [Dry Run] Would update summary metadata for ${file.name}`);
                updatedFiles++;
            }
        }));

        const unparsedCount = files.length - parsedFilesToUpdate.length;
        skippedFiles += unparsedCount;
    });

    console.log(`\nBackfill execution complete.`);
    console.log(`Metrics:`);
    console.log(`  Files found:             ${totalFiles}`);
    console.log(`  Files checked:           ${checkedFiles}`);
    console.log(`  Files updated:           ${updatedFiles}`);
    console.log(`  Files skipped:           ${skippedFiles}`);
    console.log(`  Errors:                  ${errorFiles}`);
}

async function wipe(dryRun: boolean, bucketName: string) {
    console.log(`Starting metadata wipe. Dry Run: ${dryRun}`);

    const bucket = storage.bucket(bucketName);
    console.log(`Target GCS Bucket: gs://${bucketName}`);

    let totalFiles = 0;
    let filesWithSummary = 0;
    let wipedFiles = 0;
    let errorFiles = 0;

    // Fetch all files in the bucket
    console.log('Listing all files in bucket...');
    const allFiles: any[] = [];
    let pageToken: string | undefined = undefined;
    do {
        const [files, nextQuery]: [any[], any] = await bucket.getFiles({
            pageToken,
            autoPaginate: false
        });
        allFiles.push(...files);
        pageToken = nextQuery?.pageToken;
    } while (pageToken);

    totalFiles = allFiles.length;
    console.log(`Found ${totalFiles} GCS objects in total. Scanning for prism_summary metadata...`);

    const filesToWipe: any[] = [];

    for (const file of allFiles) {
        if (file.name.endsWith('/')) {
            continue;
        }
        const hasSummary = !!file.metadata?.metadata?.prism_summary;
        if (hasSummary) {
            filesToWipe.push(file);
        }
    }

    filesWithSummary = filesToWipe.length;
    console.log(`Found ${filesWithSummary} objects containing prism_summary metadata.`);

    if (filesWithSummary === 0) {
        console.log('Nothing to wipe.');
        return;
    }

    // Process wiping in parallel (concurrency: 10)
    await asyncPool(10, filesToWipe, async (file) => {
        console.log(`Wiping prism_summary from: ${file.name}...`);
        
        if (!dryRun) {
            try {
                const customMetadata = file.metadata?.metadata || {};
                await file.setMetadata({
                    metadata: {
                        ...customMetadata,
                        prism_summary: null
                    }
                });
                console.log(`  -> Successfully wiped: ${file.name}`);
                wipedFiles++;
            } catch (err: any) {
                console.error(`  -> ERROR wiping ${file.name}: ${err.message}`);
                errorFiles++;
            }
        } else {
            console.log(`  -> [Dry Run] Would wipe: ${file.name}`);
            wipedFiles++;
        }
    });

    console.log(`\nWipe execution complete.`);
    console.log(`Metrics:`);
    console.log(`  Total GCS objects:       ${totalFiles}`);
    console.log(`  Objects with metadata:   ${filesWithSummary}`);
    console.log(`  Objects wiped:           ${wipedFiles}`);
    console.log(`  Errors:                  ${errorFiles}`);
}

const program = new Command();

program
    .name('backfill-metadata')
    .description('Manage and backfill GCS benchmark metadata')
    .argument('<mode>', 'Execution mode: "quick" (skips already indexed), "force" (re-validates and overrides), or "wipe" (wipes prism_summary)')
    .option('-d, --dry-run', 'Preview changes without uploading/updating metadata', false)
    .option('-e, --env <env>', 'Target environment: "staging" or "prod" (or "production")', 'staging')
    .action(async (mode, options) => {
        if (mode !== 'quick' && mode !== 'force' && mode !== 'wipe') {
            console.error(`Error: invalid mode "${mode}". Mode must be either "quick", "force", or "wipe".`);
            program.help();
            return;
        }
        
        const env = options.env;
        if (env !== 'staging' && env !== 'prod' && env !== 'production') {
            console.error(`Error: invalid env "${env}". Env must be either "staging" or "prod" (or "production").`);
            program.help();
            return;
        }
        
        const dryRun = !!options.dryRun;
        const bucketName = env === 'staging' ? 'llm-d-benchmarks-staging' : 'llm-d-benchmarks';
        
        if (mode === 'wipe') {
            try {
                await wipe(dryRun, bucketName);
            } catch (err) {
                console.error('Fatal wipe error:', err);
                process.exit(1);
            }
        } else {
            const force = mode === 'force';
            try {
                await run(force, dryRun, bucketName);
            } catch (err) {
                console.error('Fatal backfill error:', err);
                process.exit(1);
            }
        }
    });

if (process.argv.length <= 2) {
    program.help();
}

program.parse(process.argv);
