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
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    loadActiveStagedBundles,
    clearActiveStagedBundles,
    saveWizardHandoff,
    saveStagedUploadCache,
    loadStagedUploadCache,
    clearStagedUploadCache,
    peekWizardStartupState,
    getBrv02RunsSync,
    loadBrv02Runs,
    saveBrv02Runs,
    toCloneableBundles,
    resetMemoryStoreForTests,
    LEGACY_ACTIVE_STAGED_LS,
    LEGACY_UPLOAD_CACHE_LS,
    LEGACY_BRV02_RUNS_LS,
    HAS_ACTIVE_STAGED_LS,
    HAS_UPLOAD_CACHE_LS,
    WIZARD_STEP_LS,
    SUBMIT_INTENT_LS
} from './stagedBundlesStore.js';

class QuotaMockStorage {
    constructor(maxBytes = 5 * 1024 * 1024) {
        this.store = {};
        this.maxBytes = maxBytes;
    }

    get totalBytes() {
        return Object.entries(this.store).reduce((sum, [k, v]) => sum + k.length + v.length, 0);
    }

    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
    }

    setItem(key, val) {
        const str = String(val);
        const existingLen = Object.prototype.hasOwnProperty.call(this.store, key)
            ? key.length + this.store[key].length
            : 0;
        if (this.totalBytes - existingLen + key.length + str.length > this.maxBytes) {
            const err = new Error(`Failed to execute 'setItem' on 'Storage': Setting the value of '${key}' exceeded the quota.`);
            err.name = 'QuotaExceededError';
            err.code = 22;
            throw err;
        }
        this.store[key] = str;
    }

    removeItem(key) {
        delete this.store[key];
    }

    clear() {
        this.store = {};
    }
}

function createMockIndexedDB({ failPutWithQuota = false, txCompleteDelayMs = 5 } = {}) {
    const databases = new Map();
    const stats = { txCompletedCount: 0, putCount: 0, getCount: 0 };

    const indexedDB = {
        open(dbName) {
            const req = { onupgradeneeded: null, onsuccess: null, onerror: null, result: null, error: null };
            setTimeout(() => {
                let dbData = databases.get(dbName);
                const isNew = !dbData;
                if (!dbData) {
                    dbData = { stores: new Map() };
                    databases.set(dbName, dbData);
                }

                const db = {
                    objectStoreNames: {
                        contains: (name) => dbData.stores.has(name)
                    },
                    createObjectStore(name) {
                        if (!dbData.stores.has(name)) {
                            dbData.stores.set(name, new Map());
                        }
                        return {};
                    },
                    close() {},
                    transaction(storeName) {
                        const map = dbData.stores.get(storeName) || new Map();
                        const tx = { oncomplete: null, onerror: null, onabort: null, error: null };

                        const objectStore = {
                            put(value, key) {
                                stats.putCount += 1;
                                const putReq = { onsuccess: null, onerror: null, error: null };
                                setTimeout(() => {
                                    if (failPutWithQuota) {
                                        const err = new Error('IndexedDB QuotaExceededError');
                                        err.name = 'QuotaExceededError';
                                        putReq.error = err;
                                        tx.error = err;
                                        if (putReq.onerror) putReq.onerror();
                                        if (tx.onerror) tx.onerror();
                                        return;
                                    }
                                    // Structured-clone simulation via JSON round-trip
                                    map.set(key, JSON.parse(JSON.stringify(value)));
                                    if (putReq.onsuccess) putReq.onsuccess();
                                    setTimeout(() => {
                                        stats.txCompletedCount += 1;
                                        if (tx.oncomplete) tx.oncomplete();
                                    }, txCompleteDelayMs);
                                }, 0);
                                return putReq;
                            },
                            get(key) {
                                stats.getCount += 1;
                                const getReq = { onsuccess: null, onerror: null, result: undefined, error: null };
                                setTimeout(() => {
                                    const val = map.has(key) ? JSON.parse(JSON.stringify(map.get(key))) : undefined;
                                    getReq.result = val;
                                    if (getReq.onsuccess) getReq.onsuccess();
                                    if (tx.oncomplete) tx.oncomplete();
                                }, 0);
                                return getReq;
                            },
                            delete(key) {
                                const delReq = { onsuccess: null, onerror: null, error: null };
                                setTimeout(() => {
                                    map.delete(key);
                                    if (delReq.onsuccess) delReq.onsuccess();
                                    setTimeout(() => {
                                        if (tx.oncomplete) tx.oncomplete();
                                    }, txCompleteDelayMs);
                                }, 0);
                                return delReq;
                            }
                        };

                        tx.objectStore = () => objectStore;
                        return tx;
                    }
                };

                req.result = db;
                if (isNew && req.onupgradeneeded) {
                    req.onupgradeneeded({ target: req });
                }
                if (req.onsuccess) {
                    req.onsuccess({ target: req });
                }
            }, 0);
            return req;
        }
    };

    return { indexedDB, stats, databases };
}

describe('stagedBundlesStore', () => {
    let mockStorage;
    const origIndexedDB = globalThis.indexedDB;
    const origLocalStorage = globalThis.localStorage;

    beforeEach(() => {
        resetMemoryStoreForTests();
        // Restrict localStorage to 1 KB so any multi-KB bundle write immediately throws QuotaExceededError
        mockStorage = new QuotaMockStorage(1024);
        Object.defineProperty(window, 'localStorage', { value: mockStorage, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, configurable: true, writable: true });
    });

    afterEach(() => {
        resetMemoryStoreForTests();
        Object.defineProperty(window, 'indexedDB', { value: origIndexedDB, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'indexedDB', { value: origIndexedDB, configurable: true, writable: true });
        Object.defineProperty(window, 'localStorage', { value: origLocalStorage, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'localStorage', { value: origLocalStorage, configurable: true, writable: true });
    });

    it('persists >5 MB multi-run bundles in IndexedDB without overflowing localStorage and survives reload', async () => {
        const { indexedDB } = createMockIndexedDB();
        Object.defineProperty(window, 'indexedDB', { value: indexedDB, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true, writable: true });

        // 6 bundles x ~1 MB = ~6 MB total (>5 MB browser localStorage quota, and >1 KB mockStorage quota)
        const largeChunk = 'x'.repeat(1024 * 1024);
        const bundles = Array.from({ length: 6 }, (_, idx) => ({
            id: `bundle-${idx}`,
            name: `arm-${idx}`,
            payload: {
                runId: `00000000-0000-4000-8000-00000000000${idx}`,
                runLabel: `arm-${idx}`,
                entries: [{ filename: `stage_0.yaml`, raw_report: { dense_timeseries: largeChunk } }]
            }
        }));

        const handoffRes = await saveWizardHandoff({ bundles, step: 2, intent: 'submit-review' });
        expect(handoffRes.ok).toBe(true);
        expect(handoffRes.backend).toBe('indexeddb');

        // Bulky JSON must never be written to localStorage; only tiny markers are stored
        expect(mockStorage.getItem(LEGACY_ACTIVE_STAGED_LS)).toBeNull();
        expect(mockStorage.getItem(HAS_ACTIVE_STAGED_LS)).toBe('1');
        expect(mockStorage.getItem(WIZARD_STEP_LS)).toBe('2');
        expect(mockStorage.getItem(SUBMIT_INTENT_LS)).toBe('submit-review');

        // Simulate full browser reload (wipes in-memory cache)
        resetMemoryStoreForTests();

        const startup = peekWizardStartupState();
        expect(startup.mode).toBe('wizard-step');
        expect(startup.wizardStep).toBe(2);
        expect(startup.needsAsyncHydration).toBe(true);

        const loaded = await loadActiveStagedBundles();
        expect(loaded).toHaveLength(6);
        expect(loaded[5].name).toBe('arm-5');
        expect(loaded[5].payload.entries[0].raw_report.dense_timeseries.length).toBe(1024 * 1024);

        await clearActiveStagedBundles();
        expect(mockStorage.getItem(HAS_ACTIVE_STAGED_LS)).toBeNull();
    });

    it('waits for IndexedDB tx.oncomplete before resolving saveStagedUploadCache for OAuth redirects', async () => {
        const { indexedDB, stats } = createMockIndexedDB({ txCompleteDelayMs: 25 });
        Object.defineProperty(window, 'indexedDB', { value: indexedDB, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true, writable: true });

        const bundles = [{ id: 'oauth-1', name: 'oauth-run', payload: { entries: [{ raw_report: { pad: 'y'.repeat(4096) } }] } }];
        const res = await saveStagedUploadCache(bundles);

        expect(res.ok).toBe(true);
        // Must be >= 1 at resolution time so window.location.href does not abort an uncommitted transaction
        expect(stats.txCompletedCount).toBe(1);
        expect(mockStorage.getItem(HAS_UPLOAD_CACHE_LS)).toBe('1');
        expect(mockStorage.getItem(LEGACY_UPLOAD_CACHE_LS)).toBeNull();

        resetMemoryStoreForTests();
        const startup = peekWizardStartupState({ initialIntent: 'submit-review' });
        // OAuth cache takes precedence over initialIntent="submit-review"
        expect(startup.mode).toBe('oauth-cache');
        expect(startup.wizardStep).toBe(3);
        expect(startup.needsAsyncHydration).toBe(true);

        const restored = await loadStagedUploadCache();
        expect(restored).toHaveLength(1);
        expect(restored[0].name).toBe('oauth-run');

        await clearStagedUploadCache();
        expect(mockStorage.getItem(HAS_UPLOAD_CACHE_LS)).toBeNull();
    });

    it('migrates legacy localStorage payloads into IndexedDB and frees localStorage quota', async () => {
        mockStorage.maxBytes = 50 * 1024;
        const legacyRuns = [{ runId: 'legacy-1', runLabel: 'Legacy Run', stages: [] }];
        mockStorage.setItem(LEGACY_BRV02_RUNS_LS, JSON.stringify(legacyRuns));

        const { indexedDB } = createMockIndexedDB();
        Object.defineProperty(window, 'indexedDB', { value: indexedDB, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true, writable: true });

        const syncRuns = getBrv02RunsSync();
        expect(syncRuns).toEqual(legacyRuns);

        // Save updated runs (>1 KB) and verify legacy localStorage key is removed
        const saveRes = await saveBrv02Runs([
            ...legacyRuns,
            { runId: 'new-2', runLabel: 'New Run', stages: [{ rawReport: { blob: 'z'.repeat(4096) } }] }
        ]);
        expect(saveRes.ok).toBe(true);
        expect(mockStorage.getItem(LEGACY_BRV02_RUNS_LS)).toBeNull();

        resetMemoryStoreForTests();
        const reloaded = await loadBrv02Runs();
        expect(reloaded).toHaveLength(2);
    });

    it('normalizes DOM File instances in stageFiles and metadataFiles for structured cloning', () => {
        const domFile = new File(['version: "0.2"'], 'stage_0.yaml', { type: 'text/yaml' });
        Object.defineProperty(domFile, 'webkitRelativePath', { value: 'run-dir/stage_0.yaml' });

        const cleaned = toCloneableBundles([
            {
                id: 'b1',
                stageFiles: [{ file: domFile, content: 'version: "0.2"' }],
                metadataFiles: {
                    run_metadata: { file: new File(['{}'], 'run_metadata.json'), content: '{}' },
                    config: null
                }
            }
        ]);

        expect(cleaned[0].stageFiles[0].file).toEqual({
            name: 'stage_0.yaml',
            webkitRelativePath: 'run-dir/stage_0.yaml'
        });
        expect(cleaned[0].stageFiles[0].file instanceof File).toBe(false);
        expect(cleaned[0].metadataFiles.run_metadata.file).toEqual({
            name: 'run_metadata.json',
            webkitRelativePath: ''
        });
    });

    it('returns { ok: false, error } and cleans up wizard flags when both IndexedDB and localStorage hit QuotaExceededError', async () => {
        const { indexedDB } = createMockIndexedDB({ failPutWithQuota: true });
        Object.defineProperty(window, 'indexedDB', { value: indexedDB, configurable: true, writable: true });
        Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, configurable: true, writable: true });

        const oversizedBundles = [{ id: 'big', payload: { data: 'q'.repeat(4096) } }];
        const res = await saveWizardHandoff({ bundles: oversizedBundles, step: 2, intent: 'submit-review' });

        expect(res.ok).toBe(false);
        expect(res.error.name).toBe('QuotaExceededError');
        expect(mockStorage.getItem(WIZARD_STEP_LS)).toBeNull();
        expect(mockStorage.getItem(SUBMIT_INTENT_LS)).toBeNull();
        expect(mockStorage.getItem(HAS_ACTIVE_STAGED_LS)).toBeNull();
    });
});
