import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = await findAppBundle(context.appOutDir);

  await execFileAsync(
    "codesign",
    ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath],
    { maxBuffer: 1024 * 1024 * 8 }
  );

  await execFileAsync(
    "codesign",
    ["--verify", "--deep", "--strict", "--verbose=2", appPath],
    { maxBuffer: 1024 * 1024 * 8 }
  );

  console.log(`Ad-hoc signed macOS app bundle: ${appPath}`);
}

export default afterPack;

async function findAppBundle(appOutDir) {
  const entries = await readdir(appOutDir);
  const appName = entries.find((entry) => entry.endsWith(".app"));

  if (!appName) {
    throw new Error(`No .app bundle found in ${appOutDir}`);
  }

  return path.join(appOutDir, appName);
}
