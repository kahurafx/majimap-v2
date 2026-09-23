"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { conditionTrend } from "@/lib/mock-data";
import { CONDITION_HEX } from "@/components/condition-badge";

export function ConditionTrendChart() {

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground text-base font-semibold">Condition trend</CardTitle>
        <CardDescription>Asset condition mix over the last 6 months.</CardDescription>
      </CardHeader>
      <CardContent className="h-72 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={conditionTrend} barSize={22}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickLine={false} axisLine={false} fontSize={12} width={24} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid hsl(var(--border))",
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="good" name="Good" stackId="a" fill={CONDITION_HEX.good} radius={[0, 0, 0, 0]} />
            <Bar dataKey="fair" name="Fair" stackId="a" fill={CONDITION_HEX.fair} />
            <Bar dataKey="poor" name="Poor" stackId="a" fill={CONDITION_HEX.poor} />
            <Bar dataKey="critical" name="Critical" stackId="a" fill={CONDITION_HEX.critical} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
