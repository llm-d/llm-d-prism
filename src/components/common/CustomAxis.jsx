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
        stroke="#475569" 
        tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
        tickLine={{ stroke: '#334155' }}
        axisLine={{ stroke: '#334155' }}
        label={{ 
            value: label, 
            position: 'bottom', 
            offset: 0,
            style: { fill: '#cbd5e1', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'sans-serif' }
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
        stroke="#475569" 
        tick={{ fill: '#94a3b8', fontSize: 10, fontFamily: 'monospace' }}
        tickLine={{ stroke: '#334155' }}
        axisLine={{ stroke: '#334155' }}
        label={{ 
            value: label, 
            angle: -90, 
            position: 'insideLeft', 
            offset: -10,
            style: { fill: '#cbd5e1', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAnchor: 'middle', fontFamily: 'sans-serif' }
        }}
        tickFormatter={(val) => {
            const v = Number(val);
            if (isNaN(v)) return val;
            return Math.abs(v) >= 1000 ? v.toFixed(0) : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }}
        {...props}
    />
);
