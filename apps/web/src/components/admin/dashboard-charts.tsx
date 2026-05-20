"use client";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@bharatboot/ui";

export function DashboardCharts({ series }: { series: { day: string; value: number }[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Revenue — last 30 days</CardTitle></CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3D4F27" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3D4F27" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E8D2" />
              <XAxis dataKey="day" stroke="#1A1A1A" fontSize={11} tickFormatter={(v) => v.slice(5)} />
              <YAxis stroke="#1A1A1A" fontSize={11} tickFormatter={(v) => `₹${v.toLocaleString("en-IN")}`} />
              <Tooltip
                formatter={(v: number) => [`₹${v.toLocaleString("en-IN")}`, "Revenue"]}
                labelStyle={{ color: "#1A1A1A" }}
              />
              <Area type="monotone" dataKey="value" stroke="#3D4F27" fill="url(#rev)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
