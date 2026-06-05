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

import React from 'react';
import { XAxis, YAxis } from 'recharts';

export const CustomXAxis = ({ label, theme, ...props }) => (
    <XAxis 
        stroke={theme === 'dark' ? "#94a3b8" : "#475569"} 
        tick={{ fill: theme === 'dark' ? '#cbd5e1' : '#334155', fontSize: 11 }}
        tickLine={{ stroke: theme === 'dark' ? '#cbd5e1' : '#475569' }}
        axisLine={{ stroke: theme === 'dark' ? '#94a3b8' : '#475569' }}
        label={{ 
            value: label, 
            position: 'bottom', 
            offset: 0,
            style: { fill: theme === 'dark' ? '#f8fafc' : '#0f172a', fontSize: 11, fontWeight: 600 }
        }}
        tickFormatter={(val) => {
            const v = Number(val);
            if (isNaN(v)) return val;
            return Math.abs(v) >= 100 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }}
        {...props}
    />
);

export const CustomYAxis = ({ label, theme, ...props }) => (
    <YAxis 
        stroke={theme === 'dark' ? "#94a3b8" : "#475569"} 
        tick={{ fill: theme === 'dark' ? '#cbd5e1' : '#334155', fontSize: 11 }}
        tickLine={{ stroke: theme === 'dark' ? '#cbd5e1' : '#475569' }}
        axisLine={{ stroke: theme === 'dark' ? '#94a3b8' : '#475569' }}
        label={{ 
            value: label, 
            angle: -90, 
            position: 'insideLeft', 
            style: { fill: theme === 'dark' ? '#f8fafc' : '#0f172a', fontSize: 11, fontWeight: 600, textAnchor: 'middle' }
        }}
        tickFormatter={(val) => {
            const v = Number(val);
            if (isNaN(v)) return val;
            return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }}
        {...props}
    />
);
