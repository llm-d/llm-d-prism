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

import { parseBucketEntry, getConfiguredBucketEntries, getConfiguredBucketNames, DEFAULT_RESULTS_BUCKETS } from './buckets.js';
import assert from 'node:assert';

console.log('Running buckets unit tests...');

// 1. parseBucketEntry: bare bucket names
assert.deepStrictEqual(parseBucketEntry('my-bucket'), { bucket: 'my-bucket', prefix: '' });
assert.deepStrictEqual(parseBucketEntry(' my-bucket '), { bucket: 'my-bucket', prefix: '' });
assert.deepStrictEqual(parseBucketEntry('gs://my-bucket/'), { bucket: 'my-bucket', prefix: '' });
assert.deepStrictEqual(parseBucketEntry(''), { bucket: '', prefix: '' });
assert.deepStrictEqual(parseBucketEntry(null), { bucket: '', prefix: '' });

// 2. parseBucketEntry: path-scoped entries yield a normalized trailing-slash prefix
assert.deepStrictEqual(parseBucketEntry('my-bucket/team-a'), { bucket: 'my-bucket', prefix: 'team-a/' });
assert.deepStrictEqual(parseBucketEntry('my-bucket/team-a/results/'), { bucket: 'my-bucket', prefix: 'team-a/results/' });
assert.deepStrictEqual(parseBucketEntry('gs://my-bucket/team-a/'), { bucket: 'my-bucket', prefix: 'team-a/' });
assert.deepStrictEqual(parseBucketEntry('my-bucket//team-a//'), { bucket: 'my-bucket', prefix: 'team-a/' });

// 3. getConfiguredBucketEntries: raw scoped entries pass through to clients
assert.deepStrictEqual(
    getConfiguredBucketEntries('bucket-a, bucket-b/sub/dir ,,'),
    ['bucket-a', 'bucket-b/sub/dir']
);

// 4. getConfiguredBucketEntries / getConfiguredBucketNames: default fallback
assert.deepStrictEqual(getConfiguredBucketEntries(undefined), DEFAULT_RESULTS_BUCKETS.split(','));
assert.deepStrictEqual(getConfiguredBucketNames(undefined), ['llm-d-benchmarks-staging', 'llm-d-benchmarks']);
assert.deepStrictEqual(getConfiguredBucketNames(''), ['llm-d-benchmarks-staging', 'llm-d-benchmarks']);

// 5. getConfiguredBucketNames: path scoping is stripped for bucket-name comparisons,
// so results-store and IAM permission checks still recognize scoped entries.
assert.deepStrictEqual(
    getConfiguredBucketNames('llm-d-benchmarks-staging/team-a,other-bucket/sub/dir'),
    ['llm-d-benchmarks-staging', 'other-bucket']
);
assert.deepStrictEqual(
    getConfiguredBucketNames('gs://bucket-a/x, bucket-b'),
    ['bucket-a', 'bucket-b']
);

// 6. Multiple prefixes of the same bucket are independent entries
assert.deepStrictEqual(
    getConfiguredBucketEntries('b1/p1,b1/p2,b2/p3'),
    ['b1/p1', 'b1/p2', 'b2/p3']
);
assert.deepStrictEqual(getConfiguredBucketNames('b1/p1,b1/p2,b2/p3'), ['b1', 'b1', 'b2']);
assert.deepStrictEqual(parseBucketEntry('b1/p1'), { bucket: 'b1', prefix: 'p1/' });
assert.deepStrictEqual(parseBucketEntry('b1/p2'), { bucket: 'b1', prefix: 'p2/' });

console.log('All buckets unit tests passed successfully!');
