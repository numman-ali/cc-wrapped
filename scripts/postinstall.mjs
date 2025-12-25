#!/usr/bin/env node

/**
 * Postinstall script for cc-wrapped
 *
 * This script runs after npm install and symlinks the correct platform-specific
 * binary to the bin directory. It auto-detects:
 * - Platform (darwin, linux, windows)
 * - Architecture (arm64, x64)
 * - Libc (glibc, musl) for Linux
 * - AVX2 support (baseline vs optimized) for x64
 */

import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Detect if the system uses musl libc (Alpine Linux, etc.)
 */
function detectMusl() {
  if (os.platform() !== "linux") return false;

  try {
    // Method 1: Check ldd output
    const lddOutput = execSync("ldd --version 2>&1 || true", { encoding: "utf8" });
    if (lddOutput.toLowerCase().includes("musl")) {
      return true;
    }

    // Method 2: Check for musl loader
    const files = fs.readdirSync("/lib").filter((f) => f.startsWith("ld-musl-"));
    if (files.length > 0) {
      return true;
    }
  } catch {
    // Ignore errors
  }

  return false;
}

/**
 * Detect if the CPU supports AVX2 instructions
 */
function detectAVX2() {
  if (os.arch() !== "x64") return true; // Only relevant for x64

  try {
    if (os.platform() === "linux") {
      const cpuinfo = fs.readFileSync("/proc/cpuinfo", "utf8");
      return cpuinfo.toLowerCase().includes("avx2");
    }

    if (os.platform() === "darwin") {
      const output = execSync("sysctl -n machdep.cpu.features 2>/dev/null || true", {
        encoding: "utf8",
      });
      return output.toLowerCase().includes("avx2");
    }

    if (os.platform() === "win32") {
      // Windows: Assume AVX2 support on modern systems
      // A more robust check would require native code
      return true;
    }
  } catch {
    // If we can't detect, assume AVX2 is supported
  }

  return true;
}

/**
 * Get the platform-specific package name
 */
function getPackageName() {
  let platform;
  switch (os.platform()) {
    case "darwin":
      platform = "darwin";
      break;
    case "linux":
      platform = "linux";
      break;
    case "win32":
      platform = "windows";
      break;
    default:
      return null;
  }

  let arch;
  switch (os.arch()) {
    case "x64":
      arch = "x64";
      break;
    case "arm64":
      arch = "arm64";
      break;
    default:
      return null;
  }

  // Build package name parts
  const parts = ["cc-wrapped", platform, arch];

  // Add baseline suffix for x64 without AVX2
  if (arch === "x64" && !detectAVX2()) {
    parts.push("baseline");
  }

  // Add musl suffix for Linux with musl libc
  if (platform === "linux" && detectMusl()) {
    parts.push("musl");
  }

  return parts.join("-");
}

/**
 * Find the binary from the platform package
 */
function findBinary(packageName) {
  const binaryName = os.platform() === "win32" ? "cc-wrapped.exe" : "cc-wrapped";

  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageDir = path.dirname(packageJsonPath);
    const binaryPath = path.join(packageDir, "bin", binaryName);

    if (fs.existsSync(binaryPath)) {
      return { binaryPath, binaryName };
    }
  } catch {
    // Package not found via require.resolve
  }

  // Fallback: try common paths
  const fallbackPaths = [
    path.join(__dirname, "..", packageName, "bin", binaryName),
    path.join(__dirname, "node_modules", packageName, "bin", binaryName),
  ];

  for (const p of fallbackPaths) {
    if (fs.existsSync(p)) {
      return { binaryPath: p, binaryName };
    }
  }

  return null;
}

/**
 * Prepare the bin directory
 */
function prepareBinDirectory(binaryName) {
  const binDir = path.join(__dirname, "bin");
  const targetPath = path.join(binDir, binaryName);

  // Ensure bin directory exists
  if (!fs.existsSync(binDir)) {
    fs.mkdirSync(binDir, { recursive: true });
  }

  // Remove existing binary/symlink if it exists
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  return { binDir, targetPath };
}

/**
 * Create symlink (or copy on Windows)
 */
function linkBinary(sourcePath, binaryName) {
  const { targetPath } = prepareBinDirectory(binaryName);

  if (os.platform() === "win32") {
    // Windows: copy instead of symlink (symlinks require admin)
    fs.copyFileSync(sourcePath, targetPath);
  } else {
    fs.symlinkSync(sourcePath, targetPath);
  }

  // Verify the file exists
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Failed to create binary at ${targetPath}`);
  }
}

async function main() {
  try {
    const packageName = getPackageName();

    if (!packageName) {
      console.error(`cc-wrapped: Unsupported platform: ${os.platform()}-${os.arch()}`);
      console.error("Please download the binary manually from:");
      console.error("https://github.com/numman-ali/cc-wrapped/releases");
      process.exit(0); // Exit gracefully
    }

    console.log(`cc-wrapped: Detected platform package: ${packageName}`);

    const result = findBinary(packageName);

    if (!result) {
      // Try fallback without baseline/musl
      const baseParts = packageName.split("-").slice(0, 3);
      const basePackage = baseParts.join("-");

      if (basePackage !== packageName) {
        console.log(`cc-wrapped: Trying fallback package: ${basePackage}`);
        const fallbackResult = findBinary(basePackage);

        if (fallbackResult) {
          linkBinary(fallbackResult.binaryPath, fallbackResult.binaryName);
          return;
        }
      }

      console.error(`cc-wrapped: Could not find binary for ${packageName}`);
      console.error("The optional dependency may have failed to install.");
      console.error("Please download the binary manually from:");
      console.error("https://github.com/numman-ali/cc-wrapped/releases");
      process.exit(0);
    }

    linkBinary(result.binaryPath, result.binaryName);
  } catch (error) {
    console.error("cc-wrapped: Postinstall error:", error.message);
    process.exit(0); // Exit gracefully to not break npm install
  }
}

main();
