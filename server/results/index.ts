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

import { Router } from 'express';
import { listResultsHandler } from './routes/list.ts';
import { submitResultsHandler } from './routes/submit.ts';
import { getResultsHandler } from './routes/get.ts';
import { promoteResultsHandler } from './routes/promote.ts';
import { reviewResultsHandler } from './routes/review.ts';
import { deleteResultsHandler } from './routes/delete.ts';
import { exportResultsHandler, downloadEntryHandler } from './routes/export.ts';
import {
    getAgentToolingManifestHandler,
    getAgentSkillMdHandler,
    getAgentCliBundleHandler,
    getAgentExampleManifestHandler,
    getAgentInstallScriptHandler,
    getLlmsTxtHandler
} from './routes/agent.ts';

export const resultsRouter = Router();

resultsRouter.get('/api/results', listResultsHandler);
resultsRouter.post('/api/results', submitResultsHandler);

// Zero-clone Agent Skill & Standalone CLI distribution routes (MUST precede /api/results/:runId)
resultsRouter.get('/api/results/agent', getAgentToolingManifestHandler);
resultsRouter.get('/api/results/agent/SKILL.md', getAgentSkillMdHandler);
resultsRouter.get('/api/results/agent/skill.md', getAgentSkillMdHandler);
resultsRouter.get('/SKILL.md', getAgentSkillMdHandler);
resultsRouter.get('/llms.txt', getLlmsTxtHandler);
resultsRouter.get('/.well-known/agent.json', getAgentToolingManifestHandler);
resultsRouter.get('/.well-known/skills/index.json', getAgentToolingManifestHandler);
resultsRouter.get('/.well-known/skills/prism-results/SKILL.md', getAgentSkillMdHandler);
resultsRouter.get('/api/results/agent/prism.mjs', getAgentCliBundleHandler);
resultsRouter.get('/api/results/agent/experiment.yaml', getAgentExampleManifestHandler);
resultsRouter.get('/api/results/agent/install.sh', getAgentInstallScriptHandler);

resultsRouter.get('/api/results/:runId/export', exportResultsHandler);
resultsRouter.get('/api/results/:runId/entries/:entryIndex/download', downloadEntryHandler);
resultsRouter.get('/api/results/:runId', getResultsHandler);
resultsRouter.post('/api/results/:runId/promote', promoteResultsHandler);
resultsRouter.post('/api/results/:runId/review', reviewResultsHandler);
resultsRouter.delete('/api/results/:runId', deleteResultsHandler);

export * from './routes/list.ts';
export * from './routes/submit.ts';
export * from './routes/get.ts';
export * from './routes/promote.ts';
export * from './routes/review.ts';
export * from './routes/delete.ts';
export * from './routes/export.ts';
export * from './routes/agent.ts';
export * from './processing.ts';
export * from './gcs.ts';
export * from './api.ts';
export * from './exporter.ts';


