import type { Condition } from "@majimap/shared-types";
import { CONDITION_HEX } from "@majimap/shared-types";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<Condition, string> = {
    good: "Good",
    fair: "Fair",
    poor: "Poor",
    critical: "Critical",
    unknown: "Unknown",
};

export function ConditionBadge({ condition }: { condition: Condition }) {
    const color = CONDITION_HEX[condition];
    return (
        <Badge style={{ backgroundColor: `${color}1a`, color, borderColor: `${color}33` }}>
            {LABELS[condition]}
        </Badge>
    );
}

// Re-exported so existing `@/components/condition-badge` imports keep working —
// the values themselves now live in @majimap/shared-types so native can use them too.
export { CONDITION_HEX };