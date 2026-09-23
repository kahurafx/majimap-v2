import type { Condition } from "@majimap/shared-types";
import { Badge } from "@/components/ui/badge";

const LABELS: Record<Condition, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  critical: "Critical",
  unknown: "Unknown",
};

export function ConditionBadge({ condition }: { condition: Condition }) {
  return <Badge variant={condition}>{LABELS[condition]}</Badge>;
}

export const CONDITION_HEX: Record<Condition, string> = {
  good: "#3f7a53",
  fair: "#c99a3a",
  poor: "#bb6a35",
  critical: "#a3453b",
  unknown: "#8b93a1",
};
