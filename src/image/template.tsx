import type { ClaudeCodeStats, MonthlyActivity, WeekdayActivity } from "../types";
import { formatNumberFull, formatCostFull, formatDate } from "../utils/format";
import { ActivityHeatmap } from "./heatmap";
import { colors, typography, spacing, layout, components } from "./design-tokens";
import logo from "../../assets/images/claude-code-logo.svg" with { type: "text" };

const CLAUDE_LOGO_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(logo).toString("base64")}`;

export function WrappedTemplate({ stats }: { stats: ClaudeCodeStats }) {
  return (
    <div
      style={{
        width: layout.canvas.width,
        height: layout.canvas.height,
        display: "flex",
        flexDirection: "column",
        backgroundColor: colors.background,
        color: colors.text.primary,
        fontFamily: typography.fontFamily.mono,
        paddingLeft: layout.padding.horizontal,
        paddingRight: layout.padding.horizontal,
        paddingTop: layout.padding.top,
        paddingBottom: layout.padding.bottom,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -180,
          right: -120,
          width: 520,
          height: 520,
          backgroundColor: colors.accent.primary,
          opacity: 0.12,
          borderRadius: layout.radius.full,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -220,
          left: -140,
          width: 620,
          height: 620,
          backgroundColor: colors.accent.secondary,
          opacity: 0.12,
          borderRadius: layout.radius.full,
        }}
      />
      <Header year={stats.year} />

      <div style={{ marginTop: spacing[8], display: "flex", flexDirection: "row", gap: spacing[16], alignItems: "flex-start" }}>
        <HeroStatItem
          label="Started"
          subtitle={formatDate(stats.firstSessionDate)}
          value={`${stats.daysSinceFirstSession} Days Ago`}
        />
        <HeroStatItem
          label="Most Active Day"
          subtitle={stats.weekdayActivity.mostActiveDayName}
          value={stats.mostActiveDay?.formattedDate ?? "N/A"}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: colors.surface,
            borderRadius: layout.radius.lg,
            padding: spacing[8],
            border: `1px solid ${colors.surfaceBorder}`,
          }}
        >
          <span
            style={{
              fontSize: components.sectionHeader.fontSize,
              fontWeight: components.sectionHeader.fontWeight,
              color: components.sectionHeader.color,
              letterSpacing: components.sectionHeader.letterSpacing,
              textTransform: components.sectionHeader.textTransform,
            }}
          >
            Weekly
          </span>
          <WeeklyBarChart weekdayActivity={stats.weekdayActivity} />
        </div>
      </div>

      <Section title="Activity" marginTop={spacing[8]}>
        <ActivityHeatmap dailyActivity={stats.dailyActivity} year={stats.year} maxStreakDays={stats.maxStreakDays} />
      </Section>

      <div
        style={{
          marginTop: spacing[8],
          display: "flex",
          flexDirection: "column",
          backgroundColor: colors.surface,
          borderRadius: layout.radius.lg,
          padding: spacing[8],
          border: `1px solid ${colors.surfaceBorder}`,
        }}
      >
        <span
          style={{
            fontSize: components.sectionHeader.fontSize,
            fontWeight: components.sectionHeader.fontWeight,
            color: components.sectionHeader.color,
            letterSpacing: components.sectionHeader.letterSpacing,
            textTransform: components.sectionHeader.textTransform,
          }}
        >
          Monthly
        </span>
        <MonthlyBarChart monthlyActivity={stats.monthlyActivity} />
      </div>

      <div
        style={{
          marginTop: spacing[8],
          display: "flex",
          flexDirection: "row",
          gap: spacing[16],
        }}
      >
        <RankingList
          title="Top Models"
          items={stats.topModels.map((m) => ({
            name: m.name,
          }))}
        />
        <InsightCard stats={stats} />
      </div>

      <StatsGrid stats={stats} />
      <Footer />
    </div>
  );
}

function Header({ year }: { year: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing[2],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: spacing[8],
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: spacing[4] }}>
          <img
            src={CLAUDE_LOGO_DATA_URL}
            height={72}
            style={{
              objectFit: "contain",
            }}
          />
          <span
            style={{
              fontSize: typography.size["6xl"],
              fontWeight: typography.weight.bold,
              letterSpacing: typography.letterSpacing.tight,
              color: colors.text.primary,
              lineHeight: typography.lineHeight.none,
            }}
          >
            Claude Code
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: spacing[2],
            textAlign: "right",
          }}
        >
          <span
            style={{
              fontSize: typography.size["3xl"],
              fontWeight: typography.weight.medium,
              letterSpacing: typography.letterSpacing.normal,
              color: colors.text.tertiary,
              lineHeight: typography.lineHeight.none,
            }}
          >
            wrapped
          </span>
          <span
            style={{
              fontSize: typography.size["3xl"],
              fontWeight: typography.weight.bold,
              letterSpacing: typography.letterSpacing.normal,
              color: colors.accent.primary,
              lineHeight: typography.lineHeight.none,
            }}
          >
            {year}
          </span>
        </div>
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BAR_HEIGHT = 100;
const BAR_WIDTH = 56;
const BAR_GAP = 12;

const HERO_STAT_CONTENT_HEIGHT = BAR_HEIGHT + spacing[2] + 50;

function HeroStatItem({ label, subtitle, value }: { label: string; subtitle?: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        backgroundColor: colors.surface,
        borderRadius: layout.radius.lg,
        padding: spacing[8],
        height: HERO_STAT_CONTENT_HEIGHT + spacing[8] * 2,
        border: `1px solid ${colors.surfaceBorder}`,
      }}
    >
      <span
        style={{
          fontSize: components.sectionHeader.fontSize,
          fontWeight: components.sectionHeader.fontWeight,
          color: components.sectionHeader.color,
          letterSpacing: components.sectionHeader.letterSpacing,
          textTransform: components.sectionHeader.textTransform,
        }}
      >
        {label}
      </span>
      {subtitle && (
        <span
          style={{
            fontSize: typography.size['xl'],
            fontWeight: typography.weight.medium,
            color: colors.text.tertiary,
          }}
        >
          {subtitle}
        </span>
      )}
      <span
        style={{
          fontSize: typography.size["4xl"],
          fontWeight: typography.weight.medium,
          color: colors.text.primary,
          lineHeight: typography.lineHeight.none,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function WeeklyBarChart({ weekdayActivity }: { weekdayActivity: WeekdayActivity }) {
  const { counts, mostActiveDay, maxCount } = weekdayActivity;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          gap: BAR_GAP,
          height: BAR_HEIGHT,
        }}
      >
        {counts.map((count, i) => {
          const heightPercent = maxCount > 0 ? count / maxCount : 0;
          const barHeight = Math.max(8, Math.round(heightPercent * BAR_HEIGHT));
          const isHighlighted = i === mostActiveDay;

          return (
            <div
              key={i}
              style={{
                width: BAR_WIDTH,
                height: barHeight,
                backgroundColor: isHighlighted ? colors.accent.primary : colors.streak.level4,
                borderRadius: 4,
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: BAR_GAP,
        }}
      >
        {WEEKDAY_LABELS.map((label, i) => {
          const isHighlighted = i === mostActiveDay;
          return (
            <div
              key={i}
              style={{
                width: BAR_WIDTH,
                display: "flex",
                justifyContent: "center",
                fontSize: typography.size.sm,
                fontWeight: isHighlighted ? typography.weight.bold : typography.weight.regular,
                color: isHighlighted ? colors.accent.primary : colors.text.muted,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHLY_BAR_HEIGHT = 80;
const MONTHLY_BAR_WIDTH = 28;
const MONTHLY_BAR_GAP = 6;

function MonthlyBarChart({ monthlyActivity }: { monthlyActivity: MonthlyActivity }) {
  const { counts, mostActiveMonth, maxCount } = monthlyActivity;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: spacing[2] }}>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-end",
          gap: MONTHLY_BAR_GAP,
          height: MONTHLY_BAR_HEIGHT,
        }}
      >
        {counts.map((count, i) => {
          const heightPercent = maxCount > 0 ? count / maxCount : 0;
          const barHeight = Math.max(6, Math.round(heightPercent * MONTHLY_BAR_HEIGHT));
          const isHighlighted = i === mostActiveMonth;

          return (
            <div
              key={i}
              style={{
                width: MONTHLY_BAR_WIDTH,
                height: barHeight,
                backgroundColor: isHighlighted ? colors.accent.primary : colors.streak.level4,
                borderRadius: 4,
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "row",
          gap: MONTHLY_BAR_GAP,
        }}
      >
        {MONTH_LABELS.map((label, i) => {
          const isHighlighted = i === mostActiveMonth;
          return (
            <div
              key={i}
              style={{
                width: MONTHLY_BAR_WIDTH,
                display: "flex",
                justifyContent: "center",
                fontSize: typography.size.xs,
                fontWeight: isHighlighted ? typography.weight.bold : typography.weight.regular,
                color: isHighlighted ? colors.accent.primary : colors.text.muted,
              }}
            >
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Section({ title, marginTop = 0, children }: { title: string; marginTop?: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop,
        display: "flex",
        flexDirection: "column",
        gap: spacing[4],
      }}
    >
      <span
        style={{
          fontSize: components.sectionHeader.fontSize,
          fontWeight: components.sectionHeader.fontWeight,
          color: components.sectionHeader.color,
          letterSpacing: components.sectionHeader.letterSpacing,
          textTransform: components.sectionHeader.textTransform,
        }}
      >
        {title}
      </span>
      {children}
    </div>
  );
}

interface RankingItem {
  name: string;
  logoUrl?: string;
}

function RankingList({ title, items }: { title: string; items: RankingItem[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing[5],
        flex: 1,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.surfaceBorder}`,
        borderRadius: layout.radius.lg,
        padding: spacing[6],
      }}
    >
      <span
        style={{
          fontSize: components.sectionHeader.fontSize,
          fontWeight: components.sectionHeader.fontWeight,
          color: components.sectionHeader.color,
          letterSpacing: components.sectionHeader.letterSpacing,
          textTransform: components.sectionHeader.textTransform,
        }}
      >
        {title}
      </span>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing[4],
        }}
      >
        {items.map((item, i) => (
          <RankingItemRow key={i} rank={i + 1} name={item.name} logoUrl={item.logoUrl} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ stats }: { stats: ClaudeCodeStats }) {
  const insights = [
    stats.totalCacheReadTokens > 0 && {
      label: "Cache Read",
      value: `${formatNumberFull(stats.totalCacheReadTokens)} tok`,
    },
    stats.totalCacheWriteTokens > 0 && {
      label: "Cache Write",
      value: `${formatNumberFull(stats.totalCacheWriteTokens)} tok`,
    },
    stats.cacheHitRate > 0 && {
      label: "Cache Hit",
      value: `${stats.cacheHitRate.toFixed(1)}%`,
    },
    stats.totalToolCalls > 0 && {
      label: "Tool Calls",
      value: formatNumberFull(stats.totalToolCalls),
    },
    stats.totalWebSearchRequests > 0 && {
      label: "Web Searches",
      value: formatNumberFull(stats.totalWebSearchRequests),
    },
    stats.peakContextWindow > 0 && {
      label: "Peak Context",
      value: `${formatNumberFull(stats.peakContextWindow)} tok`,
    },
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: spacing[5],
        flex: 1,
        backgroundColor: colors.surface,
        border: `1px solid ${colors.surfaceBorder}`,
        borderRadius: layout.radius.lg,
        padding: spacing[6],
      }}
    >
      <span
        style={{
          fontSize: components.sectionHeader.fontSize,
          fontWeight: components.sectionHeader.fontWeight,
          color: components.sectionHeader.color,
          letterSpacing: components.sectionHeader.letterSpacing,
          textTransform: components.sectionHeader.textTransform,
        }}
      >
        Cache Efficiency
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: spacing[3] }}>
        {insights.map((item) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: spacing[4],
            }}
          >
            <span
              style={{
                fontSize: typography.size.md,
                fontWeight: typography.weight.medium,
                color: colors.text.tertiary,
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: typography.size.md,
                fontWeight: typography.weight.semibold,
                color: colors.text.primary,
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface RankingItemRowProps {
  rank: number;
  name: string;
  logoUrl?: string;
}

function RankingItemRow({ rank, name, logoUrl }: RankingItemRowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: spacing[4],
      }}
    >
      <span
        style={{
          fontSize: components.ranking.numberSize,
          fontWeight: typography.weight.bold,
          color: colors.text.tertiary,
          width: components.ranking.numberWidth,
          textAlign: "right",
        }}
      >
        {rank}
      </span>

      {logoUrl && (
        <img
          src={logoUrl}
          width={components.ranking.logoSize}
          height={components.ranking.logoSize}
          style={{
            borderRadius: components.ranking.logoBorderRadius,
            background: "#ffffff",
          }}
        />
      )}

      <span
        style={{
          fontSize: components.ranking.itemSize,
          fontWeight: typography.weight.medium,
          color: colors.text.primary,
        }}
      >
        {name}
      </span>
    </div>
  );
}

function StatsGrid({ stats }: { stats: ClaudeCodeStats }) {
  const hasCost = stats.hasUsageCost;

  return (
    <div
      style={{
        marginTop: spacing[4],
        display: "flex",
        flexDirection: "column",
        gap: spacing[5],
      }}
    >
      {hasCost ? (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          <div style={{ display: "flex", gap: spacing[5] }}>
            <StatBox label="Sessions" value={formatNumberFull(stats.totalSessions)} />
            <StatBox label="Messages" value={formatNumberFull(stats.totalMessages)} />
            <StatBox label="Total Tokens" value={formatNumberFull(stats.totalTokens)} />
          </div>

          <div style={{ display: "flex", gap: spacing[5] }}>
            <StatBox label="Projects" value={formatNumberFull(stats.totalProjects)} />
            <StatBox label="Streak" value={`${stats.maxStreak}d`} />
            <StatBox label="Usage Cost" value={formatCostFull(stats.totalCost)} />
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: spacing[5] }}>
          <div style={{ display: "flex", gap: spacing[5] }}>
            <StatBox label="Sessions" value={formatNumberFull(stats.totalSessions)} />
            <StatBox label="Messages" value={formatNumberFull(stats.totalMessages)} />
            <StatBox label="Tokens" value={formatNumberFull(stats.totalTokens)} />
          </div>

          <div style={{ display: "flex", gap: spacing[5] }}>
            <StatBox label="Projects" value={formatNumberFull(stats.totalProjects)} />
            <StatBox label="Streak" value={`${stats.maxStreak}d`} />
          </div>
        </div>
      )}
    </div>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
}

function StatBox({ label, value }: StatBoxProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: components.statBox.background,
        paddingTop: components.statBox.padding.y,
        paddingBottom: components.statBox.padding.y,
        paddingLeft: components.statBox.padding.x,
        paddingRight: components.statBox.padding.x,
        gap: components.statBox.gap,
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: components.statBox.borderRadius,
        border: `1px solid ${colors.surfaceBorder}`,
      }}
    >
      <span
        style={{
          fontSize: typography.size.lg,
          fontWeight: typography.weight.medium,
          color: colors.text.tertiary,
          textTransform: "uppercase",
          letterSpacing: typography.letterSpacing.wide,
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontSize: typography.size["2xl"],
          fontWeight: typography.weight.bold,
          color: colors.text.primary,
          lineHeight: typography.lineHeight.none,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Footer() {
  return (
    <div
      style={{
        marginTop: spacing[2],
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontSize: typography.size.lg,
          fontWeight: typography.weight.medium,
          color: colors.text.muted,
          letterSpacing: typography.letterSpacing.normal,
        }}
      >
        claude.ai/code
      </span>
    </div>
  );
}
