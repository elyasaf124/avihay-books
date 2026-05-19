const fs = require("fs");
const path = require("path");

/** Expo autolinking resolves native modules from mobile/node_modules; npm workspaces hoist them to the repo root. */
const HOISTED_NATIVE_DEPS = ["react-native-worklets"];

const mobileRoot = path.join(__dirname, "..");
const mobileNodeModules = path.join(mobileRoot, "node_modules");
const rootNodeModules = path.join(mobileRoot, "..", "node_modules");

function linkHoistedDep(depName) {
  const linkPath = path.join(mobileNodeModules, depName);
  const targetPath = path.join(rootNodeModules, depName);
  const targetPackageJson = path.join(targetPath, "package.json");

  if (!fs.existsSync(targetPackageJson)) {
    return;
  }

  if (fs.existsSync(linkPath)) {
    if (fs.existsSync(path.join(linkPath, "package.json"))) {
      return;
    }

    fs.rmSync(linkPath, { recursive: true, force: true });
  }

  fs.mkdirSync(mobileNodeModules, { recursive: true });
  fs.symlinkSync(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir");
}

for (const depName of HOISTED_NATIVE_DEPS) {
  linkHoistedDep(depName);
}
