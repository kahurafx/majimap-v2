import type { Condition } from "@majimap/shared-types";
import { CONDITION_HEX } from "@majimap/shared-types";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";

/**
 * Badge colored by severity, reusing the same good/fair/poor/critical/
 * unknown scale as asset condition. shadcn's generated Badge has no
 * variants for these (and regenerating it would wipe a hand-added one),
 * so this applies color via inline style instead of `variant`. Reach for
 * this instead of `variant={someCustomString}` on Badge directly — that
 * exact mistake has already shown up four times across this codebase.
 */
export function SeverityBadge({ tone, children }: { tone: Condition; children: ReactNode }) {
    const color = CONDITION_HEX[tone];
    return (
        <Badge style={{ backgroundColor: `${color}1a`, color, borderColor: `${color}33` }}>
            {children}
        </Badge>
    );
}