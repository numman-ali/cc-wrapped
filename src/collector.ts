// Data collector - reads Claude Code storage and returns raw data

import { createReadStream } from "node:fs";
import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import os from "node:os";
import { createInterface } from "node:readline";
import { calculateCostUSD, getModelPricing, type ModelPricing } from "./pricing";

export interface ClaudeStatsCache {
  version?: number;
  lastComputedDate?: string;
  dailyActivity?: Array<{
    date: string;
    messageCount: number;
    sessionCount: number;
    toolCallCount?: number;
  }>;
  dailyModelTokens?: Array<{
    date: string;
    tokensByModel: Record<string, number>;
  }>;
  modelUsage?: Record<
    string,
    {
      inputTokens?: number;
      outputTokens?: number;
      cacheReadInputTokens?: number;
      cacheCreationInputTokens?: number;
      webSearchRequests?: number;
      costUSD?: number;
      contextWindow?: number;
    }
  >;
  totalSessions?: number;
  totalMessages?: number;
  firstSessionDate?: string;
}

const CLAUDE_DATA_PATH = join(os.homedir(), ".claude");
const CLAUDE_STATS_CACHE_PATH = join(CLAUDE_DATA_PATH, "stats-cache.json");
const CLAUDE_HISTORY_PATH = join(CLAUDE_DATA_PATH, "history.jsonl");
const CLAUDE_PROJECTS_DIR = "projects";
const CLAUDE_CONFIG_PATH = join(os.homedir(), ".config", "claude");
const CLAUDE_CONFIG_DIR_ENV = "CLAUDE_CONFIG_DIR";

export interface ClaudeUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalTokens: number;
  totalCostUSD: number;
  modelTokenTotals: Map<string, number>;
  firstTimestamp: Date | null;
  dailyActivity: Map<string, number>;
  totalMessages: number;
  totalSessions: number;
}

export async function checkClaudeDataExists(): Promise<boolean> {
  const projectsPath = join(CLAUDE_DATA_PATH, CLAUDE_PROJECTS_DIR);
  return await pathIsDirectory(projectsPath);
}

export async function loadClaudeStatsCache(): Promise<ClaudeStatsCache> {
  try {
    const raw = await readFile(CLAUDE_STATS_CACHE_PATH, "utf8");
    return JSON.parse(raw) as ClaudeStatsCache;
  } catch {
    return {};
  }
}

export async function collectClaudeProjects(year: number): Promise<Set<string>> {
  const projects = new Set<string>();

  try {
    const raw = await readFile(CLAUDE_HISTORY_PATH, "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as { timestamp?: number; project?: string };
        if (!entry.timestamp || !entry.project) continue;
        const entryYear = new Date(entry.timestamp).getFullYear();
        if (entryYear !== year) continue;
        projects.add(entry.project);
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // history.jsonl may not exist
  }

  return projects;
}

export async function collectClaudeUsageSummary(year: number): Promise<ClaudeUsageSummary> {
  const roots = await getClaudeProjectRoots();
  const modelTokenTotals = new Map<string, number>();
  const pricingCache = new Map<string, ModelPricing | null>();
  const processedHashes = new Set<string>();
  const dailyActivity = new Map<string, number>();
  const sessionIds = new Set<string>();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let totalTokens = 0;
  let totalCostUSD = 0;
  let firstTimestamp: Date | null = null;
  let totalMessages = 0;

  for (const root of roots) {
    const exists = await pathIsDirectory(root);
    if (!exists) continue;

    const files = await listJsonlFiles(root);
    for (const filePath of files) {
      const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity,
      });

      for await (const line of rl) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry: any;
        try {
          entry = JSON.parse(trimmed);
        } catch {
          continue;
        }

        const uniqueHash = createUniqueHash(entry);
        if (uniqueHash && processedHashes.has(uniqueHash)) {
          continue;
        }
        if (uniqueHash) {
          processedHashes.add(uniqueHash);
        }

        const timestamp = entry?.timestamp;
        if (!timestamp) continue;
        const entryDate = new Date(timestamp);
        if (Number.isNaN(entryDate.getTime()) || entryDate.getFullYear() !== year) {
          continue;
        }

        if (firstTimestamp == null || entryDate < firstTimestamp) {
          firstTimestamp = entryDate;
        }

        const dateKey = formatDateKey(entryDate);
        dailyActivity.set(dateKey, (dailyActivity.get(dateKey) || 0) + 1);
        totalMessages += 1;

        const sessionId = typeof entry?.sessionId === "string" ? entry.sessionId : undefined;
        if (sessionId) {
          sessionIds.add(sessionId);
        }

        const usage = entry?.message?.usage;
        const model = typeof entry?.message?.model === "string" ? entry.message.model : undefined;

        const rawCost = entry?.costUSD;
        const hasCost = typeof rawCost === "number" && Number.isFinite(rawCost);
        if (hasCost) {
          totalCostUSD += rawCost;
        }

        if (!usage) continue;

        const input = ensureNumber(usage.input_tokens);
        const output = ensureNumber(usage.output_tokens);
        const cacheCreate = ensureNumber(usage.cache_creation_input_tokens);
        const cacheRead = ensureNumber(usage.cache_read_input_tokens);
        const entryTotal = input + output + cacheCreate + cacheRead;

        totalInputTokens += input;
        totalOutputTokens += output;
        totalCacheCreationTokens += cacheCreate;
        totalCacheReadTokens += cacheRead;
        totalTokens += entryTotal;

        if (typeof model === "string" && model.trim() !== "") {
          modelTokenTotals.set(model, (modelTokenTotals.get(model) || 0) + entryTotal);

          if (!hasCost && entryTotal > 0) {
            let pricing = pricingCache.get(model);
            if (!pricingCache.has(model)) {
              pricing = await getModelPricing(model);
              pricingCache.set(model, pricing ?? null);
            }

            if (pricing) {
              totalCostUSD += calculateCostUSD(
                {
                  inputTokens: input,
                  outputTokens: output,
                  cacheCreationTokens: cacheCreate,
                  cachedInputTokens: cacheRead,
                },
                pricing
              );
            }
          }
        }
      }
    }
  }

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalTokens,
    totalCostUSD,
    modelTokenTotals,
    firstTimestamp,
    dailyActivity,
    totalMessages,
    totalSessions: sessionIds.size,
  };
}

function createUniqueHash(entry: any): string | null {
  const messageId = entry?.message?.id;
  const requestId = entry?.requestId;
  if (!messageId || !requestId) return null;
  return `${messageId}:${requestId}`;
}

async function getClaudeProjectRoots(): Promise<string[]> {
  const normalizedPaths = new Set<string>();
  const roots: string[] = [];

  const envPaths = (process.env[CLAUDE_CONFIG_DIR_ENV] ?? "").trim();
  if (envPaths !== "") {
    const entries = envPaths.split(",").map((value) => value.trim()).filter((value) => value !== "");
    for (const entry of entries) {
      const resolved = resolve(entry);
      const projectsPath = join(resolved, CLAUDE_PROJECTS_DIR);
      if (await pathIsDirectory(projectsPath)) {
        const canonical = await resolveCanonicalPath(projectsPath);
        if (normalizedPaths.has(canonical)) continue;
        normalizedPaths.add(canonical);
        roots.push(canonical);
      }
    }
    return roots;
  }

  const defaults = [CLAUDE_CONFIG_PATH, CLAUDE_DATA_PATH];
  for (const base of defaults) {
    const resolved = resolve(base);
    const projectsPath = join(resolved, CLAUDE_PROJECTS_DIR);
    if (await pathIsDirectory(projectsPath)) {
      const canonical = await resolveCanonicalPath(projectsPath);
      if (normalizedPaths.has(canonical)) continue;
      normalizedPaths.add(canonical);
      roots.push(canonical);
    }
  }

  return roots;
}

async function resolveCanonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

async function pathIsDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonlFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(fullPath);
    }
  }

  return files;
}

function ensureNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
