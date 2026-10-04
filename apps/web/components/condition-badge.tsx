import type { Condition } from "@majimap/shared-types";
import { CONDITION_HEX } from "@majimap/shared-types";
import { SeverityBadge } from "@/components/severity-badge";

const LABELS: Record<Condition, string> = {
    good: "Good",
    fair: "Fair",
    poor: "Poor",
    critical: "Critical",
    unknown: "Unknown",
};

export function ConditionBadge({ condition }: { condition: Condition }) {
    return <SeverityBadge tone={condition}>{LABELS[condition]}</SeverityBadge>;
}

// Re-exported so existing `@/components/condition-badge` imports keep working —
// the values themselves live in @majimap/shared-types so native can use them too.
export { CONDITION_HEX };