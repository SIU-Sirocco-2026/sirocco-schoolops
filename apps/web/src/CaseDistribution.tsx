// SPDX-License-Identifier: Apache-2.0
import { IconArrowUpRight, IconAlertTriangle } from "@tabler/icons-react";

export function CaseDistribution({
  summary,
  select,
}: {
  summary: { total: number; open: number; completed: number; overdue: number };
  select: (bucket: string) => void;
}) {
  const completed = summary.total ? summary.completed / summary.total : 0;
  const overdue = summary.total ? summary.overdue / summary.total : 0;
  return (
    <div className="report-distribution visual-distribution">
      <div
        className="distribution-donut"
        role="img"
        aria-label={`${summary.open} đang mở, ${summary.completed} hoàn thành trên tổng ${summary.total} hồ sơ`}
      >
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke={summary.total ? "#206bc4" : "#e4eaf2"}
            strokeWidth="20"
          />
          <circle
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke="#2b8a57"
            strokeWidth="20"
            className="chart-arc"
            pathLength="100"
            strokeDasharray={`${completed * 100} 100`}
            transform="rotate(-90 100 100)"
          />
          <circle
            cx="100"
            cy="100"
            r="61"
            fill="none"
            stroke="#e4eaf2"
            strokeWidth="5"
          />
          <circle
            cx="100"
            cy="100"
            r="61"
            fill="none"
            stroke="#bc3543"
            strokeWidth="5"
            className="chart-arc"
            pathLength="100"
            strokeDasharray={`${overdue * 100} 100`}
            transform="rotate(-90 100 100)"
          />
          <text x="100" y="100" textAnchor="middle" className="donut-number">
            {summary.total}
          </text>
          <text x="100" y="121" textAnchor="middle" className="donut-caption">
            hồ sơ
          </text>
        </svg>
      </div>
      <div className="distribution-breakdown">
        <h3>Phân bổ hồ sơ</h3>
        {[
          ["open", "Đang mở", summary.open, "#206bc4"],
          ["completed", "Hoàn thành", summary.completed, "#2b8a57"],
          ["overdue", "Quá hạn", summary.overdue, "#bc3543"],
        ].map(([id, label, count, color]) => (
          <button
            type="button"
            key={id}
            aria-label={`Xem nhóm ${label}: ${count} hồ sơ`}
            className="distribution-filter"
            onClick={() => select(String(id))}
          >
            <i style={{ background: String(color) }} aria-hidden="true" />
            <span>{label}</span>
            <strong>{count}</strong>
            <span className="distribution-percent">
              {summary.total
                ? Math.round((Number(count) / summary.total) * 100)
                : 0}
              %
            </span>
            <IconArrowUpRight size={16} aria-hidden="true" />
          </button>
        ))}
        {!!summary.overdue && (
          <button
            className="overdue-chip"
            type="button"
            onClick={() => select("overdue")}
          >
            <IconAlertTriangle size={16} aria-hidden="true" />
            {summary.overdue} hồ sơ cần chú ý
            <IconArrowUpRight size={16} aria-hidden="true" />
          </button>
        )}
        <small>Vòng trong: phần quá hạn của tổng hồ sơ.</small>
      </div>
    </div>
  );
}
