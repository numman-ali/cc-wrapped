import type { ClaudeCodeStats, ModelStats, ProviderStats, WeekdayActivity } from "./types";
import { collectClaudeProjects, collectClaudeUsageSummary, loadClaudeStatsCache } from "./collector";
import { fetchModelsData, getModelDisplayName, getModelProvider, getProviderDisplayName } from "./models";
import { formatDateKey } from "./utils/dates";

export async function calculateStats(year: number): Promise<ClaudeCodeStats> {
  const [, statsCache, projects, usageSummary] = await Promise.all([
    fetchModelsData(),
    loadClaudeStatsCache(),
    collectClaudeProjects(year),
    collectClaudeUsageSummary(year),
  ]);

  const dailyActivity = new Map<string, number>();
  const weekdayCounts: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];

  let totalMessages = 0;
  let totalSessions = 0;
  let totalToolCalls = 0;

  const usageDailyActivity = usageSummary.dailyActivity;
  if (usageDailyActivity.size > 0) {
    for (const [entryDate, messageCount] of usageDailyActivity.entries()) {
      const entryYear = new Date(entryDate).getFullYear();
      if (entryYear !== year) continue;
      dailyActivity.set(entryDate, messageCount);
      totalMessages += messageCount;

      const weekday = new Date(entryDate).getDay();
      weekdayCounts[weekday] += messageCount;
    }
    totalSessions = usageSummary.totalSessions;
  } else {
    for (const entry of statsCache.dailyActivity ?? []) {
      const entryDate = entry?.date;
      if (!entryDate) continue;
      const entryYear = new Date(entryDate).getFullYear();
      if (entryYear !== year) continue;

      const messageCount = entry.messageCount ?? 0;
      dailyActivity.set(entryDate, messageCount);
      totalMessages += messageCount;
      totalSessions += entry.sessionCount ?? 0;
      totalToolCalls += entry.toolCallCount ?? 0;

      const weekday = new Date(entryDate).getDay();
      weekdayCounts[weekday] += messageCount;
    }
  }

  if (totalToolCalls === 0) {
    for (const entry of statsCache.dailyActivity ?? []) {
      totalToolCalls += entry.toolCallCount ?? 0;
    }
  }

  if (totalSessions === 0) {
    for (const entry of statsCache.dailyActivity ?? []) {
      totalSessions += entry.sessionCount ?? 0;
    }
  }

  const modelTokenTotals = new Map<string, number>();
  if (usageSummary.modelTokenTotals.size > 0) {
    for (const [modelId, tokens] of usageSummary.modelTokenTotals.entries()) {
      modelTokenTotals.set(modelId, tokens);
    }
  } else {
    for (const entry of statsCache.dailyModelTokens ?? []) {
      const entryDate = entry?.date;
      if (!entryDate) continue;
      const entryYear = new Date(entryDate).getFullYear();
      if (entryYear !== year) continue;
      for (const [modelId, tokens] of Object.entries(entry.tokensByModel ?? {})) {
        modelTokenTotals.set(modelId, (modelTokenTotals.get(modelId) || 0) + tokens);
      }
    }
  }

  const modelUsage = statsCache.modelUsage ?? {};
  if (modelTokenTotals.size === 0) {
    for (const [modelId, usage] of Object.entries(modelUsage)) {
      const tokens = (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
      if (tokens > 0) {
        modelTokenTotals.set(modelId, tokens);
      }
    }
  }

  const hasUsageSummaryTokens =
    usageSummary.totalTokens > 0 ||
    usageSummary.totalInputTokens > 0 ||
    usageSummary.totalOutputTokens > 0 ||
    usageSummary.totalCacheReadTokens > 0 ||
    usageSummary.totalCacheCreationTokens > 0;
  let totalTokens = usageSummary.totalTokens;
  let totalInputTokens = usageSummary.totalInputTokens;
  let totalOutputTokens = usageSummary.totalOutputTokens;
  let totalCost = usageSummary.totalCostUSD;
  let totalCacheReadTokens = usageSummary.totalCacheReadTokens;
  let totalCacheWriteTokens = usageSummary.totalCacheCreationTokens;
  let totalWebSearchRequests = 0;
  let peakContextWindow = 0;

  const modelStats: ModelStats[] = [];
  const providerCounts = new Map<string, number>();

  for (const [modelId, tokens] of modelTokenTotals.entries()) {
    if (tokens <= 0) continue;
    if (!hasUsageSummaryTokens) {
      totalTokens += tokens;
    }

    let inputTokens = tokens;
    let outputTokens = 0;
    let cachedInputTokens = 0;
    let cacheCreationTokens = 0;

    const usage = modelUsage[modelId];
    if (usage) {
      const usageInput = usage.inputTokens ?? 0;
      const usageOutput = usage.outputTokens ?? 0;
      const usageCacheRead = usage.cacheReadInputTokens ?? 0;
      const usageCacheCreate = usage.cacheCreationInputTokens ?? 0;
      const usageTotal = usageInput + usageOutput + usageCacheRead + usageCacheCreate;
      if (usageTotal > 0) {
        const ratio = tokens / usageTotal;
        inputTokens = Math.round(usageInput * ratio);
        outputTokens = Math.round(usageOutput * ratio);
        cachedInputTokens = Math.round(usageCacheRead * ratio);
        cacheCreationTokens = Math.round(usageCacheCreate * ratio);

        const scaledTotal = inputTokens + outputTokens + cachedInputTokens + cacheCreationTokens;
        if (scaledTotal !== tokens) {
          inputTokens += tokens - scaledTotal;
        }

      }

      if (!hasUsageSummaryTokens) {
        totalCacheReadTokens += cachedInputTokens;
        totalCacheWriteTokens += cacheCreationTokens;
      }
      totalWebSearchRequests += usage.webSearchRequests ?? 0;
      peakContextWindow = Math.max(peakContextWindow, usage.contextWindow ?? 0);
    }

    if (!hasUsageSummaryTokens) {
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
    }

    const providerId = resolveProviderId(modelId);
    providerCounts.set(providerId, (providerCounts.get(providerId) || 0) + tokens);

    modelStats.push({
      id: modelId,
      name: getModelDisplayName(modelId),
      providerId,
      count: tokens,
      percentage: 0,
    });
  }

  const topModels = modelStats
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((model) => ({
      ...model,
      percentage: totalTokens > 0 ? (model.count / totalTokens) * 100 : 0,
    }));

  const topProviders: ProviderStats[] = Array.from(providerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, count]) => ({
      id,
      name: getProviderDisplayName(id),
      count,
      percentage: totalTokens > 0 ? (count / totalTokens) * 100 : 0,
    }));

  const { maxStreak, currentStreak, maxStreakDays } = calculateStreaks(dailyActivity, year);

  const mostActiveDay = findMostActiveDay(dailyActivity);
  const weekdayActivity = buildWeekdayActivity(weekdayCounts);

  const cacheDenominator = totalCacheReadTokens + totalCacheWriteTokens;
  const cacheHitRate = cacheDenominator > 0 ? (totalCacheReadTokens / cacheDenominator) * 100 : 0;

  const firstSessionDate = usageSummary.firstTimestamp
    ? usageSummary.firstTimestamp
    : statsCache.firstSessionDate
    ? new Date(statsCache.firstSessionDate)
    : findFirstActivityDate(dailyActivity);
  const daysSinceFirstSession = Math.floor((Date.now() - firstSessionDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    year,
    firstSessionDate,
    daysSinceFirstSession,
    totalSessions,
    totalMessages,
    totalProjects: projects.size,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalCacheReadTokens,
    totalCacheWriteTokens,
    cacheHitRate,
    totalWebSearchRequests,
    totalToolCalls,
    peakContextWindow,
    totalCost,
    hasUsageCost: totalCost > 0,
    topModels,
    topProviders,
    maxStreak,
    currentStreak,
    maxStreakDays,
    dailyActivity,
    mostActiveDay,
    weekdayActivity,
  };
}

function resolveProviderId(modelId: string): string {
  const provider = getModelProvider(modelId);
  if (provider && provider !== "unknown") return provider;

  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gpt") || modelId.startsWith("openai")) return "openai";

  return "unknown";
}

function findFirstActivityDate(dailyActivity: Map<string, number>): Date {
  if (dailyActivity.size === 0) return new Date();
  const dates = Array.from(dailyActivity.keys()).sort();
  return new Date(dates[0]);
}

function calculateStreaks(
  dailyActivity: Map<string, number>,
  year: number
): { maxStreak: number; currentStreak: number; maxStreakDays: Set<string> } {
  // Get all active dates sorted
  const activeDates = Array.from(dailyActivity.keys())
    .filter((date) => date.startsWith(String(year)))
    .sort();

  if (activeDates.length === 0) {
    return { maxStreak: 0, currentStreak: 0, maxStreakDays: new Set() };
  }

  let maxStreak = 1;
  let tempStreak = 1;
  let tempStreakStart = 0;
  let maxStreakStart = 0;
  let maxStreakEnd = 0;

  for (let i = 1; i < activeDates.length; i++) {
    const prevDate = new Date(activeDates[i - 1]);
    const currDate = new Date(activeDates[i]);

    // Calculate difference in days
    const diffTime = currDate.getTime() - prevDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      tempStreak++;
      if (tempStreak > maxStreak) {
        maxStreak = tempStreak;
        maxStreakStart = tempStreakStart;
        maxStreakEnd = i;
      }
    } else {
      tempStreak = 1;
      tempStreakStart = i;
    }
  }

  // Build the set of max streak days
  const maxStreakDays = new Set<string>();
  for (let i = maxStreakStart; i <= maxStreakEnd; i++) {
    maxStreakDays.add(activeDates[i]);
  }

  // Calculate current streak (from today or yesterday backwards)
  const today = formatDateKey(new Date());
  const yesterday = formatDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const currentStreak = dailyActivity.has(today)
    ? countStreakBackwards(dailyActivity, new Date())
    : dailyActivity.has(yesterday)
    ? countStreakBackwards(dailyActivity, new Date(Date.now() - 24 * 60 * 60 * 1000))
    : 0;

  return { maxStreak, currentStreak, maxStreakDays };
}

/** Count consecutive days with activity going backwards from startDate (inclusive) */
function countStreakBackwards(dailyActivity: Map<string, number>, startDate: Date): number {
  let streak = 1;
  let checkDate = new Date(startDate);

  while (true) {
    checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
    if (dailyActivity.has(formatDateKey(checkDate))) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function findMostActiveDay(dailyActivity: Map<string, number>): { date: string; count: number; formattedDate: string } | null {
  if (dailyActivity.size === 0) {
    return null;
  }

  let maxDate = "";
  let maxCount = 0;

  for (const [date, count] of dailyActivity.entries()) {
    if (count > maxCount) {
      maxCount = count;
      maxDate = date;
    }
  }

  if (!maxDate) {
    return null;
  }

  // Parse date string (YYYY-MM-DD) and format as "Mon D"
  const [year, month, day] = maxDate.split("-").map(Number);
  const dateObj = new Date(year, month - 1, day);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const formattedDate = `${monthNames[dateObj.getMonth()]} ${dateObj.getDate()}`;

  return {
    date: maxDate,
    count: maxCount,
    formattedDate,
  };
}

function buildWeekdayActivity(counts: [number, number, number, number, number, number, number]): WeekdayActivity {
  const WEEKDAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  let mostActiveDay = 0;
  let maxCount = 0;
  for (let i = 0; i < 7; i++) {
    if (counts[i] > maxCount) {
      maxCount = counts[i];
      mostActiveDay = i;
    }
  }

  return {
    counts,
    mostActiveDay,
    mostActiveDayName: WEEKDAY_NAMES_FULL[mostActiveDay],
    maxCount,
  };
}
