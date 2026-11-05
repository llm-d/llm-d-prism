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

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Line, LineChart } from 'recharts';
import { SafeResponsiveContainer } from './SafeResponsiveContainer.jsx';

const SAMPLE_DATA = [
    { x: 0, y: 10 },
    { x: 1, y: 20 },
];

describe('SafeResponsiveContainer', () => {
    let observerCallback = null;
    let warnSpy;
    let errorSpy;

    beforeEach(() => {
        observerCallback = null;
        globalThis.ResizeObserver = class {
            constructor(cb) {
                observerCallback = cb;
            }
            observe() {}
            unobserve() {}
            disconnect() {}
        };
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it('emits zero console warnings when mounted in a zero-sized or hidden container', () => {
        const { container } = render(
            <div style={{ display: 'none', width: 0, height: 0 }}>
                <SafeResponsiveContainer width="100%" height="100%">
                    <LineChart data={SAMPLE_DATA}>
                        <Line dataKey="y" isAnimationActive={false} />
                    </LineChart>
                </SafeResponsiveContainer>
            </div>,
        );

        expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
        expect(container.querySelector('svg.recharts-surface')).toBeNull();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('mounts chart SVG once positive dimensions arrive and cleanly unmounts on collapse to zero without warnings', () => {
        const onResize = vi.fn();
        const { container } = render(
            <SafeResponsiveContainer width="100%" height="100%" onResize={onResize}>
                <LineChart data={SAMPLE_DATA}>
                    <Line dataKey="y" isAnimationActive={false} />
                </LineChart>
            </SafeResponsiveContainer>,
        );

        expect(container.querySelector('svg.recharts-surface')).toBeNull();

        act(() => {
            observerCallback?.([{ contentRect: { width: 640, height: 320 } }]);
        });

        const svg = container.querySelector('svg.recharts-surface');
        expect(svg).not.toBeNull();
        expect(svg.getAttribute('width')).toBe('640');
        expect(svg.getAttribute('height')).toBe('320');
        expect(onResize).toHaveBeenCalledWith(640, 320);

        act(() => {
            observerCallback?.([{ contentRect: { width: 0, height: 0 } }]);
        });

        expect(container.querySelector('svg.recharts-surface')).toBeNull();
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('measures positive getBoundingClientRect synchronously before ResizeObserver fires', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            width: 480,
            height: 240,
            top: 0,
            left: 0,
            right: 480,
            bottom: 240,
            x: 0,
            y: 0,
            toJSON: () => {},
        });

        const { container } = render(
            <SafeResponsiveContainer width="100%" height="100%">
                <LineChart data={SAMPLE_DATA}>
                    <Line dataKey="y" isAnimationActive={false} />
                </LineChart>
            </SafeResponsiveContainer>,
        );

        const svg = container.querySelector('svg.recharts-surface');
        expect(svg).not.toBeNull();
        expect(svg.getAttribute('width')).toBe('480');
        expect(svg.getAttribute('height')).toBe('240');
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('renders cleanly via renderToStaticMarkup without Recharts or SSR layout warnings', () => {
        const html = renderToStaticMarkup(
            <SafeResponsiveContainer width="100%" height="100%">
                <LineChart data={SAMPLE_DATA}>
                    <Line dataKey="y" isAnimationActive={false} />
                </LineChart>
            </SafeResponsiveContainer>,
        );

        expect(html).toContain('recharts-responsive-container');
        expect(warnSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
