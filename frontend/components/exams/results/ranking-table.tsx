import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { th, theadClass } from "@/components/cms/admin/list-parts";
import { formatDuration, formatMarks } from "@/lib/assessments";
import { cn } from "@/lib/utils";
import type { RankRow, Ranking } from "@/types/assessments";

/** Other learners appear by initials only. */
export function RankingTable({ ranking }: { ranking: Ranking }) {
  const rows: RankRow[] = [...ranking.top];
  if (ranking.you && !rows.some((r) => r.is_you)) rows.push(ranking.you);
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Ranking</CardTitle>
        <p className="text-sm text-muted">
          Best attempt of each of {ranking.participants} learner{ranking.participants === 1 ? "" : "s"}. Other learners are shown by initials.
        </p>
      </CardHeader>
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead className={theadClass}>
            <tr>
              <th className={th}>Rank</th>
              <th className={th}>Learner</th>
              <th className={th}>Score</th>
              <th className={th}>Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={`${r.rank}-${r.name}-${r.is_you}`} className={cn(r.is_you && "bg-teal-50 font-medium")}>
                <td className="px-4 py-3 tabular-nums">{r.rank}</td>
                <td className="px-4 py-3">{r.is_you ? `${r.name} (you)` : r.name}</td>
                <td className="px-4 py-3 tabular-nums">
                  {formatMarks(r.score)} / {formatMarks(r.max_score)}
                </td>
                <td className="px-4 py-3">{formatDuration(r.time_spent_seconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
