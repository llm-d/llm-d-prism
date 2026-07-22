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

// Prism UI primitives. The contract for using (and extending) these lives in
// skills/style.md — read it before adding UI.

export { Button } from './Button';
export { Badge, StatusChip } from './Badge';
export { Modal } from './Modal';
export { Input, Select, Textarea, Checkbox, Label } from './FormControls';
export { Panel } from './Panel';
export { StatCard } from './StatCard';
export { Spinner, LoadingState } from './Spinner';
export { EmptyState } from './EmptyState';
export { PageHeader, ShareLinkButton } from './PageHeader';
export { WellLitHeader } from './WellLitHeader';
export { ToggleGroup } from './ToggleGroup';
export { StatPills } from './StatPills';
export { SectionLabel } from './SectionLabel';
export { FactCell } from './FactCell';

export { ChartContainer } from './charts/ChartContainer';
export { ChartTooltip, ChartTooltipRow } from './charts/ChartTooltip';
export { ChartLegend } from './charts/ChartLegend';
export { ChartXAxis, ChartYAxis } from './charts/Axis';
export { CHART_SERIES, seriesColor, CHART_STATUS } from './charts/palette';
export { getChartTheme, gridProps, tooltipProps } from './charts/theme';
