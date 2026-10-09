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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import yaml from 'js-yaml';
import { downloadRunBRV02 } from './brv02Exporter.js';
import { parseReportV02, stageToEntry } from './benchmarkReportV02Parser.js';
import { createRunZipBuffer } from '../../server/results/exporter.ts';

const reports = [
    { version: '0.2.1', workload: { stage: 0 }, results: { request_performance: { aggregate: { requests: { total: 22 } } } } },
    { version: '0.2.1', workload: { stage: 0 }, results: { session_performance: { sessions: { total: 2 } } } },
    { version: '0.2.1', workload: { stage: 1 }, results: { request_performance: { aggregate: { requests: { total: 44 } } } } },
];

const payload = {
    runId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    runLabel: 'agentic run',
    entries: reports.map((raw_report, i) => ({
        prism_stage_index: raw_report.workload.stage,
        filename: `report_${i}.yaml`,
        raw_report,
    })),
};

function expectReports(buffer) {
    const files = unzipSync(new Uint8Array(buffer));
    const names = Object.keys(files);
    expect(names).toHaveLength(reports.length);
    expect(names.every(name => name.includes('stage_'))).toBe(true);
    expect(names.map(name => yaml.load(strFromU8(files[name])))).toEqual(reports);
}

async function browserDownload(run, entries = []) {
    vi.useFakeTimers();
    let download;
    vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
        download = blob;
        return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.stubGlobal('document', {
        createElement: () => ({ click: vi.fn() }),
        body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    downloadRunBRV02(run, entries);
    return download.arrayBuffer();
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('benchmark archives with companion request and session reports', () => {
    it('keeps every report in a Results API archive', () => {
        expectReports(createRunZipBuffer(payload).buffer);
    });

    it('keeps every report in a browser payload download', async () => {
        expectReports(await browserDownload(payload));
    });

    it('keeps every report in a download from normalized comparison entries', async () => {
        const entries = reports.map((rawReport, i) =>
            stageToEntry(parseReportV02(rawReport, `report_${i}.yaml`)));
        expect(entries.map(entry => entry.workload.stage)).toEqual([0, 0, 1]);
        expectReports(await browserDownload({ runId: payload.runId, runLabel: payload.runLabel }, entries));
    });
});
