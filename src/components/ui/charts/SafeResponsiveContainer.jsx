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

import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useRef,
    useState,
} from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '../../../utils/cn';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

const isPercent = (value) => typeof value === 'string' && value.endsWith('%');

// Thin wrapper around Recharts' ResponsiveContainer that prevents Recharts 3.x
// from logging `width(-1) and height(-1)` on initial mount and `width(0) and
// height(0)` when mounted inside collapsed, hidden, or zero-sized flex/drawer
// containers (as well as SSR / JSDOM environments).
//
// Once positive pixel dimensions are observed, numeric `width` and `height` are
// passed to Recharts' ResponsiveContainer so it takes its static context fast
// path without creating a duplicate ResizeObserver or firing LogUtils.warn().
export const SafeResponsiveContainer = forwardRef(function SafeResponsiveContainer(
    {
        width = '100%',
        height = '100%',
        minWidth = 0,
        minHeight = 0,
        maxHeight,
        aspect,
        debounce = 0,
        id,
        className,
        style,
        onResize,
        children,
    },
    ref,
) {
    const containerRef = useRef(null);
    const onResizeRef = useRef(onResize);

    useImperativeHandle(ref, () => containerRef.current);

    useIsomorphicLayoutEffect(() => {
        onResizeRef.current = onResize;
    }, [onResize]);

    const [dims, setDims] = useState({ width: 0, height: 0 });

    useIsomorphicLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return undefined;

        let timeoutId = null;
        const applySize = (rawWidth, rawHeight) => {
            const nextWidth = Math.round(rawWidth);
            const nextHeight = Math.round(rawHeight);
            setDims((prev) => (
                prev.width === nextWidth && prev.height === nextHeight
                    ? prev
                    : { width: nextWidth, height: nextHeight }
            ));
            if (nextWidth > 0 && nextHeight > 0) {
                onResizeRef.current?.(nextWidth, nextHeight);
            }
        };

        const rect = el.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) {
            applySize(rect.width, rect.height);
        }

        if (typeof ResizeObserver === 'undefined') return undefined;

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            const { width: observedW, height: observedH } = entry.contentRect;
            if (debounce > 0) {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => applySize(observedW, observedH), debounce);
            } else {
                applySize(observedW, observedH);
            }
        });

        observer.observe(el);
        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            observer.disconnect();
        };
    }, [debounce]);

    let resolvedWidth = typeof width === 'number' ? width : dims.width;
    let resolvedHeight = typeof height === 'number' ? height : dims.height;

    if (aspect && aspect > 0) {
        if (resolvedWidth > 0) {
            resolvedHeight = Math.round(resolvedWidth / aspect);
        } else if (resolvedHeight > 0) {
            resolvedWidth = Math.round(resolvedHeight * aspect);
        }
        if (maxHeight && resolvedHeight > maxHeight) {
            resolvedHeight = maxHeight;
        }
    } else if (maxHeight && resolvedHeight > maxHeight) {
        resolvedHeight = maxHeight;
    }

    const canRender = resolvedWidth > 0 && resolvedHeight > 0;
    const innerStyle = {
        width: isPercent(width) ? 0 : undefined,
        height: isPercent(height) ? 0 : undefined,
        overflow: 'visible',
    };

    return (
        <div
            id={id !== undefined ? `${id}` : undefined}
            ref={containerRef}
            className={cn('recharts-responsive-container min-w-0 min-h-0', className)}
            style={{
                width,
                height,
                minWidth,
                minHeight,
                maxHeight,
                ...style,
            }}
        >
            {canRender ? (
                <div style={innerStyle}>
                    <ResponsiveContainer width={resolvedWidth} height={resolvedHeight}>
                        {children}
                    </ResponsiveContainer>
                </div>
            ) : null}
        </div>
    );
});
