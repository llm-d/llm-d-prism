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

export const CustomLabel = (props) => {
    const { x, y, stroke, index, lastIndex, text, viewBox, width, showLineLabel, showDataLabels, payload, dataPoint } = props;
    
    const content = [];
    const item = dataPoint || payload;

    // 1. Data Point Label (TP)
    if (showDataLabels && item) {
        let tp = item.tp || item.metadata?.tensor_parallelism || item.tensor_parallelism || item.metadata?.tp || '1';
        if (tp) {
             if (!String(tp).startsWith('TP')) tp = `TP${tp}`;
             content.push(
                <text key="tp" x={x} y={y - 8} fill={stroke} fontSize={9} textAnchor="middle" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                    {tp}
                </text>
             );
        }
    }

    // 2. Line Label (End only)
    if (showLineLabel && index === lastIndex) {
        const chartWidth = viewBox?.width || width || 0;
        const isNearRight = chartWidth > 0 && (x > (chartWidth - 250) || x > (chartWidth * 0.75));
        const textAnchor = isNearRight ? "end" : "start";
        const dx = isNearRight ? -10 : 10;
        
        content.push(
             <text key="line" x={x} y={y} dx={dx} dy={4} fill={stroke} fontSize={10} textAnchor={textAnchor} fontWeight="bold" style={{ pointerEvents: 'none' }}>
                {text}
            </text>
        );
    }
    
    return <g>{content}</g>;
};
