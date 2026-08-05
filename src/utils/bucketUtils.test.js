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

import { getCanonicalBucketName, getBucketAlias, dedupeBucketConfigs, getBucketBaseName, getBucketPrefix } from './bucketUtils.js';
import assert from 'node:assert';

console.log('Running bucketUtils unit tests...');

// 1. getCanonicalBucketName
assert.strictEqual(getCanonicalBucketName('gs://slabe-bucket'), 'slabe-bucket');
assert.strictEqual(getCanonicalBucketName('gs://slabe-bucket/'), 'slabe-bucket');
assert.strictEqual(getCanonicalBucketName('slabe-bucket'), 'slabe-bucket');
assert.strictEqual(getCanonicalBucketName('s3://my-aws-bucket/'), 'my-aws-bucket');
assert.strictEqual(getCanonicalBucketName({ bucket: 'gs://slabe-bucket/', alias: 'slabe' }), 'slabe-bucket');
assert.strictEqual(getCanonicalBucketName(null), '');

// 2. getBucketAlias
assert.strictEqual(getBucketAlias({ bucket: 'slabe-bucket', alias: 'slabe' }), 'slabe');
assert.strictEqual(getBucketAlias('slabe-bucket'), null);
assert.strictEqual(getBucketAlias({ bucket: 'slabe-bucket' }), null);

// 3. dedupeBucketConfigs
const sampleInput = [
    { bucket: 'slabe-bucket', alias: 'slabe' },
    'slabe-bucket',
    'gs://slabe-bucket',
    'gs://slabe-bucket/',
    { bucket: 'gs://slabe-bucket/', alias: 'slabe' },
    'other-bucket',
    { bucket: 'other-bucket', alias: 'Other' }
];

const result = dedupeBucketConfigs(sampleInput);

assert.strictEqual(result.length, 2);
assert.deepStrictEqual(result[0], { bucket: 'slabe-bucket', alias: 'slabe' });
assert.deepStrictEqual(result[1], { bucket: 'other-bucket', alias: 'Other' });

// 4. Test upgrade when simple string comes before object with alias
const sampleOrder2 = [
    'gs://slabe-bucket',
    { bucket: 'slabe-bucket', alias: 'slabe' }
];
const result2 = dedupeBucketConfigs(sampleOrder2);
assert.strictEqual(result2.length, 1);
assert.deepStrictEqual(result2[0], { bucket: 'slabe-bucket', alias: 'slabe' });

// 5. Path-scoped entries: canonical name retains the path as identity
assert.strictEqual(getCanonicalBucketName('gs://slabe-bucket/team-a/results/'), 'slabe-bucket/team-a/results');
assert.strictEqual(getCanonicalBucketName({ bucket: 'slabe-bucket/team-a' }), 'slabe-bucket/team-a');

// 6. getBucketBaseName strips any path scoping
assert.strictEqual(getBucketBaseName('slabe-bucket'), 'slabe-bucket');
assert.strictEqual(getBucketBaseName('gs://slabe-bucket/team-a/results/'), 'slabe-bucket');
assert.strictEqual(getBucketBaseName({ bucket: 'gs://slabe-bucket/team-a', alias: 'slabe' }), 'slabe-bucket');
assert.strictEqual(getBucketBaseName(null), '');

// 7. getBucketPrefix extracts a normalized trailing-slash prefix
assert.strictEqual(getBucketPrefix('slabe-bucket'), '');
assert.strictEqual(getBucketPrefix('slabe-bucket/team-a'), 'team-a/');
assert.strictEqual(getBucketPrefix('gs://slabe-bucket/team-a/results/'), 'team-a/results/');
assert.strictEqual(getBucketPrefix('slabe-bucket//team-a//'), 'team-a/');
assert.strictEqual(getBucketPrefix({ bucket: 'slabe-bucket/team-a', alias: 'slabe' }), 'team-a/');
assert.strictEqual(getBucketPrefix(null), '');

// 8. Dedupe treats different prefixes of the same bucket as distinct sources
const scopedInput = [
    'slabe-bucket/team-a',
    'gs://slabe-bucket/team-a/',
    'slabe-bucket/team-b',
    'slabe-bucket'
];
const scopedResult = dedupeBucketConfigs(scopedInput);
assert.strictEqual(scopedResult.length, 3);
assert.deepStrictEqual(scopedResult, ['slabe-bucket/team-a', 'slabe-bucket/team-b', 'slabe-bucket']);

console.log('All bucketUtils unit tests passed successfully!');
