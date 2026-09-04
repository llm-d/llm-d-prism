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

import { normalizeModelName } from './dataParser.js';

// null when the source cannot carry a custom label.
export const getCustomLabelRunId = (keyOrEntry) => {
    const key = typeof keyOrEntry === 'string' ? keyOrEntry : keyOrEntry?.source;
    if (typeof key === 'string') {
        if (key.startsWith('brv02:')) return key.substring(6);
        if (key.startsWith('results-store:')) return key.substring(14);
    }
    if (typeof keyOrEntry === 'object' && keyOrEntry?.source_info?.type === 'benchmark_report_v02') {
        return keyOrEntry.run_id || null;
    }
    return null;
};

export const stripModelPrefix = (description, model) => {
    const rest = String(description ?? '').trim();
    if (!rest) return '';

    const m = normalizeModelName(model);
    if (!m) return rest;

    const wrapped = rest.match(/^([^[\]()]+?)\s*([[(].+[\])])$/);
    if (wrapped && normalizeModelName(wrapped[1]) === m) return wrapped[2];

    if (/[[\]()]/.test(rest)) return rest;

    return normalizeModelName(rest) === m ? '' : rest;
};

// A generated experiment ID ends in -<epoch>-<id>, identical across a sweep, which
// pushes the treatment out of every truncated label. The epoch range and the id's
// fixed width keep an unrelated trailing number, such as a byte size, intact, and
// the word list spares tails a person chose.
const EXPERIMENT_ID_TAIL =
    /-1[6-9]\d{8}-(?!(?:bytes|baseline|final|run|stage|test|prod|dev|before|after|new|old)[\])]?$)[a-z0-9]{5,12}(?=[\])]?$)/i;

export const stripExperimentIdSuffix = (description) =>
    String(description ?? '').replace(EXPERIMENT_ID_TAIL, '');

export const buildRunLabel = ({ model, description, customLabel }) => {
    if (customLabel) return customLabel;
    let m = String(model ?? '');
    const d = description && description !== 'Unknown' ? description : '';
    if (!m) return d;
    const rest = stripExperimentIdSuffix(stripModelPrefix(d, m));
    if (!rest) return m;

    // model_name arrives lowercased by normalizeModelName; when the description
    // restates the model it does so as written, which is what a label should show.
    const wrapped = String(d).trim().match(/^([^[\]()]+?)\s*[[(]/);
    if (wrapped && normalizeModelName(wrapped[1]) === normalizeModelName(m)) m = wrapped[1].trim();

    const suffix = /^[[(]/.test(rest) ? rest : `[${rest}]`;
    // useDashboardData already appends the variant to model_name for some sources,
    // so pairing them again would repeat the variant twice in one label.
    if (m.endsWith(suffix)) return m;

    return `${m} ${suffix}`;
};

// Sources disagree on which field carries the description: brv02 sets runLabel,
// coalesced and edited runs set metadata.variant.
export const getEntryLabel = (entry) => {
    if (!entry) return '';
    return buildRunLabel({
        model: entry.model_name || entry.model || entry.metadata?.model_name,
        description: entry.runLabel || entry.metadata?.variant || entry.metadata?.configuration,
    });
};

/**
 * Resolves the benchmark name / run label for table sorting in Results Store.
 * Prefers active custom label overrides, then the benchmark runLabel,
 * and falls back to model or benchmarkKey when unspecified.
 */
export const getBenchmarkSortLabel = (stat, customLabels = {}) => {
    if (!stat) return '';
    const benchmarkData = Array.isArray(stat.data) ? stat.data : [];
    const sourceStr = benchmarkData[0]?.source || stat.source || '';
    const isBrv02 = sourceStr.startsWith('brv02:') ||
        benchmarkData[0]?.source_info?.type === 'benchmark_report_v02' ||
        stat.source_info?.type === 'benchmark_report_v02';
    const runId = isBrv02
        ? (sourceStr.startsWith('brv02:')
            ? sourceStr.replace('brv02:', '')
            : (benchmarkData[0]?.run_id || stat.run_id))
        : null;

    if (runId && customLabels?.[runId]) {
        return customLabels[runId];
    }
    const customKeyId = getCustomLabelRunId(stat.benchmarkKey || stat);
    if (customKeyId && customLabels?.[customKeyId]) {
        return customLabels[customKeyId];
    }

    const rawLabel = stat.runLabel ||
        stat.payload?.runLabel ||
        benchmarkData[0]?.runLabel ||
        benchmarkData[0]?.payload?.runLabel ||
        benchmarkData.find?.(d => d.runLabel)?.runLabel;

    if (rawLabel && typeof rawLabel === 'string' && rawLabel.trim()) {
        return rawLabel.trim();
    }

    return stat.model_name || stat.model || benchmarkData[0]?.metadata?.model_name || stat.benchmarkKey || '';
};

