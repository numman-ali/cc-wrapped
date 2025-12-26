#!/usr/bin/env bun

import * as p from "@clack/prompts";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { checkClaudeDataExists, resolveClaudeDataPath } from "./collector";
import { calculateStats } from "./stats";
import { generateImage } from "./image/generator";
import { displayInTerminal, getTerminalName } from "./terminal/display";
import { copyImageToClipboard } from "./clipboard";
import { isWrappedAvailable } from "./utils/dates";
import { formatCostFull, formatNumber, formatNumberFull } from "./utils/format";
import type { ClaudeCodeStats } from "./types";

const VERSION = "1.0.0";

function printHelp() {
  console.log(`
cc-wrapped v${VERSION}

Generate your Claude Code year in review stats card.

USAGE:
  cc-wrapped [OPTIONS]

OPTIONS:
  -y, --year <YYYY>        Generate wrapped for a specific year (default: current year)
  -c, --config-dir <PATH>  Path to Claude Code config directory (default: auto-detect)
  -o, --output <PATH>      Output path for image (default: ~/cc-wrapped-YYYY.png)
  -V, --verbose            Show debug information
  -h, --help               Show this help message
  -v, --version            Show version number

EXAMPLES:
  cc-wrapped                            # Generate current year wrapped
  cc-wrapped --year 2025                # Generate 2025 wrapped
  cc-wrapped -c ~/.config/claude        # Use specific config directory
  cc-wrapped -o ~/Desktop/wrapped.png   # Save to specific location
  cc-wrapped --verbose                  # Show debug info
`);
}

async function main() {
  // Parse command line arguments
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      year: { type: "string", short: "y" },
      "config-dir": { type: "string", short: "c" },
      output: { type: "string", short: "o" },
      verbose: { type: "boolean", short: "V" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
    strict: true,
    allowPositionals: false,
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (values.version) {
    console.log(`cc-wrapped v${VERSION}`);
    process.exit(0);
  }

  // Set config dir from CLI arg (takes priority over auto-detection)
  if (values["config-dir"]) {
    process.env.CLAUDE_CONFIG_DIR = values["config-dir"];
  }

  const verbose = values.verbose ?? false;

  p.intro("claude code wrapped");

  // Show verbose debug info
  if (verbose) {
    const configPath = resolveClaudeDataPath();
    p.log.info(`Config directory: ${configPath ?? "not found"}`);
  }

  const requestedYear = values.year ? parseInt(values.year, 10) : new Date().getFullYear();

  // Validate year parameter
  if (Number.isNaN(requestedYear) || requestedYear < 2024 || requestedYear > new Date().getFullYear()) {
    p.cancel(`Invalid year: ${values.year}. Must be between 2024 and ${new Date().getFullYear()}`);
    process.exit(1);
  }

  const availability = isWrappedAvailable(requestedYear);
  if (!availability.available) {
    if (Array.isArray(availability.message)) {
      availability.message.forEach((line) => p.log.warn(line));
    } else {
      p.log.warn(availability.message || "Wrapped not available yet.");
    }
    p.cancel();
    process.exit(0);
  }

  const dataExists = await checkClaudeDataExists();
  if (!dataExists) {
    p.cancel("Claude Code data not found in ~/.config/claude or ~/.claude\n\nMake sure you have used Claude Code at least once.");
    process.exit(0);
  }

  const spinner = p.spinner();
  spinner.start("Scanning your Claude Code history...");

  let stats;
  try {
    stats = await calculateStats(requestedYear);
  } catch (error) {
    spinner.stop("Failed to collect stats");
    const message = error instanceof Error ? error.message : String(error);
    p.cancel(`Failed to collect stats: ${message}`);
    process.exit(1);
  }

  if (stats.totalSessions === 0) {
    spinner.stop("No data found");
    p.cancel(`No Claude Code activity found for ${requestedYear}`);
    process.exit(0);
  }

  // Show verbose stats summary
  if (verbose) {
    p.log.info(`Sessions: ${stats.totalSessions}, Messages: ${stats.totalMessages}, Projects: ${stats.totalProjects}`);
  }

  spinner.stop("Found your stats!");

  const activityDates = Array.from(stats.dailyActivity.keys())
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (activityDates.length > 1 && requestedYear === new Date().getFullYear()) {
    const spanDays = Math.ceil(
      (activityDates[activityDates.length - 1].getTime() - activityDates[0].getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (spanDays <= 35) {
      p.log.warn(
        "Claude Code logs are kept ~30 days by default. To keep more history, increase cleanupPeriodDays in your settings.json."
      );
    }
  }

  // Display summary
  const summaryLines = [
    `Sessions:      ${formatNumber(stats.totalSessions)}`,
    `Messages:      ${formatNumber(stats.totalMessages)}`,
    `Total Tokens:  ${formatNumber(stats.totalTokens)}`,
    `Projects:      ${formatNumber(stats.totalProjects)}`,
    `Streak:        ${stats.maxStreak} days`,
    stats.hasUsageCost && `Usage Cost:    ${stats.totalCost.toFixed(2)}$`,
    stats.mostActiveDay && `Most Active:   ${stats.mostActiveDay.formattedDate}`,
  ].filter(Boolean);

  p.note(summaryLines.join("\n"), `Your ${requestedYear} in Claude Code`);

  // Generate image
  spinner.start("Generating your wrapped image...");

  let image: { fullSize: Buffer; displaySize: Buffer };
  try {
    image = await generateImage(stats);
  } catch (error) {
    spinner.stop("Failed to generate image");
    p.cancel(`Error generating image: ${error}`);
    process.exit(1);
  }

  spinner.stop("Image generated!");

  const displayed = await displayInTerminal(image.displaySize);
  if (!displayed) {
    p.log.info(`Terminal (${getTerminalName()}) doesn't support inline images`);
  }

  const filename = `cc-wrapped-${requestedYear}.png`;
  const { success, error } = await copyImageToClipboard(image.fullSize, filename);

  if (success) {
    p.log.success("Automatically copied image to clipboard!");
  } else {
    p.log.warn(`Clipboard unavailable: ${error}`);
    p.log.info("You can save the image to disk instead.");
  }

  // Handle image saving
  const outputPath = values.output;
  if (outputPath) {
    // If --output is provided, save directly without prompting
    try {
      await Bun.write(outputPath, image.fullSize);
      p.log.success(`Saved to ${outputPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      p.log.error(`Failed to save: ${message}`);
    }
  } else {
    // Interactive mode: prompt user
    const defaultPath = join(process.env.HOME || "~", filename);

    const shouldSave = await p.confirm({
      message: `Save image to ~/${filename}?`,
      initialValue: true,
    });

    if (p.isCancel(shouldSave)) {
      p.outro("Cancelled");
      process.exit(0);
    }

    if (shouldSave) {
      try {
        await Bun.write(defaultPath, image.fullSize);
        p.log.success(`Saved to ${defaultPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        p.log.error(`Failed to save: ${message}`);
      }
    }
  }

  const shouldShare = await p.confirm({
    message: "Share on X (Twitter)? Don't forget to attach your image!",
    initialValue: true,
  });

  if (!p.isCancel(shouldShare) && shouldShare) {
    const tweetUrl = generateTweetUrl(stats);
    const opened = await openUrl(tweetUrl);
    if (opened) {
      p.log.success("Opened X in your browser.");
    } else {
      p.log.warn("Couldn't open browser. Copy this URL:");
      p.log.info(tweetUrl);
    }
    p.log.info("Press CMD / CTRL + V to paste the image.");
  }

  p.outro("Share your wrapped!");
  process.exit(0);
}

function generateTweetUrl(stats: ClaudeCodeStats): string {
  const lines: string[] = [];
  lines.push(`Claude Code Wrapped ${stats.year}`);
  lines.push("");
  lines.push(`Total Tokens: ${formatNumberFull(stats.totalTokens)}`);
  lines.push(`Total Messages: ${formatNumberFull(stats.totalMessages)}`);
  lines.push(`Total Sessions: ${formatNumberFull(stats.totalSessions)}`);
  lines.push("");
  lines.push(`Longest Streak: ${stats.maxStreak} days`);
  lines.push(`Top model: ${stats.topModels[0]?.name ?? "N/A"}`);
  lines.push(
    `Total Estimated Cost: ${stats.hasUsageCost ? formatCostFull(stats.totalCost) : "N/A"}`
  );
  lines.push("");
  lines.push("Get yours: npx cc-wrapped");
  lines.push("");
  lines.push("Credit: @nummanali @moddi3io");
  lines.push("");
  lines.push("(Paste Image Stats with CMD / CTRL + V)");

  const text = lines.join("\n");

  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", text);
  return url.toString();
}

async function openUrl(url: string): Promise<boolean> {
  const platform = process.platform;
  let command: string;

  if (platform === "darwin") {
    command = "open";
  } else if (platform === "win32") {
    command = "start";
  } else {
    command = "xdg-open";
  }

  try {
    const proc = Bun.spawn([command, url], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
