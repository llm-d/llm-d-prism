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
 * Minimal in-memory S3 for tests. Implements the five commands the Results Store
 * uses, with S3 semantics that matter here: ETag = MD5 of the body (so rewriting the
 * same JSON keeps the ETag), LastModified moves on every PUT, user-metadata keys come
 * back in a configurable case, paginated listing, and NoSuchKey/404 errors.
 */

import crypto from 'crypto';

function notFound(name = 'NoSuchKey') {
    const err = new Error('The specified key does not exist.');
    err.name = name;
    err.$metadata = { httpStatusCode: 404 };
    return err;
}

export function createFakeS3({ pageSize = 1000, metadataKeyCase = 'lower', tickMs = 1000 } = {}) {
    const objects = new Map(); // key -> { body, metadata, etag, lastModified, contentType }
    let clock = Date.UTC(2026, 10, 8, 12, 0, 0);
    const calls = [];

    const caseKey = (k) => (metadataKeyCase === 'upper' ? k.toUpperCase() : metadataKeyCase === 'mixed'
        ? k.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('-')
        : k.toLowerCase());
    const metadataOf = (obj) => Object.fromEntries(Object.entries(obj.metadata).map(([k, v]) => [caseKey(k), v]));

    function put(key, body, metadata, contentType) {
        clock += tickMs;
        objects.set(key, {
            body,
            metadata: { ...metadata },
            etag: `"${crypto.createHash('md5').update(body).digest('hex')}"`,
            lastModified: new Date(clock),
            contentType
        });
        return objects.get(key);
    }

    const client = {
        async send(command) {
            const name = command.constructor.name;
            const input = command.input;
            calls.push({ name, input });
            switch (name) {
                case 'PutObjectCommand': {
                    for (const [k, v] of Object.entries(input.Metadata || {})) {
                        // Real S3 rejects non-ASCII / control characters in header values.
                        if (!/^[\x20-\x7e]*$/.test(v) || !/^[a-z0-9-]+$/i.test(k)) {
                            const err = new Error(`Invalid metadata header ${k}`);
                            err.name = 'InvalidArgument';
                            err.$metadata = { httpStatusCode: 400 };
                            throw err;
                        }
                    }
                    return { ETag: put(input.Key, String(input.Body), input.Metadata || {}, input.ContentType).etag };
                }
                case 'GetObjectCommand': {
                    const obj = objects.get(input.Key);
                    if (!obj) throw notFound();
                    return {
                        Body: { transformToString: async () => obj.body },
                        ETag: obj.etag,
                        LastModified: obj.lastModified,
                        ContentType: obj.contentType,
                        Metadata: metadataOf(obj)
                    };
                }
                case 'HeadObjectCommand': {
                    const obj = objects.get(input.Key);
                    if (!obj) throw notFound('NotFound');
                    return { ETag: obj.etag, LastModified: obj.lastModified, Metadata: metadataOf(obj) };
                }
                case 'HeadBucketCommand':
                    return {};
                case 'DeleteObjectCommand': {
                    objects.delete(input.Key);
                    return {};
                }
                case 'ListObjectsV2Command': {
                    const keys = [...objects.keys()].filter(k => !input.Prefix || k.startsWith(input.Prefix)).sort();
                    const start = input.ContinuationToken ? Number(input.ContinuationToken) : 0;
                    const next = start + pageSize;
                    return {
                        Contents: keys.slice(start, next).map(k => ({ Key: k, Size: objects.get(k).body.length })),
                        IsTruncated: next < keys.length,
                        NextContinuationToken: next < keys.length ? String(next) : undefined
                    };
                }
                default:
                    throw new Error(`fakeS3: unsupported command ${name}`);
            }
        }
    };

    return {
        client,
        objects,
        calls,
        /** Simulates an out-of-band edit (another replica or a manual change). */
        putRaw(key, body, metadata = {}) {
            put(key, typeof body === 'string' ? body : JSON.stringify(body), metadata, 'application/json');
        },
        resetCalls() {
            calls.length = 0;
        }
    };
}
