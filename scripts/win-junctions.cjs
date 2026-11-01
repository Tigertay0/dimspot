// Preloaded into the OpenNext build (node -r) so it runs on Windows without admin rights.
// Next links external server packages (like pg) into its standalone output, and OpenNext copies
// those links with symlinkSync, which Windows refuses without the symlink privilege (EPERM).
// A directory junction needs no privilege, so a refused directory link becomes one.
// Changes nothing on disk beyond the build output, and nothing on other systems.
const fs = require("node:fs");
const path = require("node:path");
const { syncBuiltinESMExports } = require("node:module");

const STANDALONE = path.resolve(".next", "standalone") + path.sep;
const LINKS_DIR = `${path.sep}.next${path.sep}node_modules${path.sep}`;

// On Windows, Next writes these links with absolute targets inside .next/standalone (on Linux they
// are relative, e.g. ../../node_modules/pg). OpenNext copies the standalone folder elsewhere, so a
// copied link must point at the same place inside the copy, as the relative link would.
function targetInCopy(target, link) {
  const absolute = path.resolve(path.dirname(link), target);
  const linksAt = link.lastIndexOf(LINKS_DIR);
  // Windows paths ignore case (a drive letter may come back as c: or C:).
  if (!absolute.toLowerCase().startsWith(STANDALONE.toLowerCase()) || linksAt < 0) return absolute;
  return path.join(link.slice(0, linksAt), absolute.slice(STANDALONE.length));
}

if (process.platform === "win32") {
  const symlinkSync = fs.symlinkSync;
  fs.symlinkSync = function symlinkOrJunction(target, link, type) {
    try {
      return symlinkSync(target, link, type);
    } catch (error) {
      const original = path.resolve(path.dirname(String(link)), String(target));
      const isDirectory = fs.statSync(original, { throwIfNoEntry: false })?.isDirectory();
      if (error.code !== "EPERM" || !isDirectory) throw error;
      return symlinkSync(targetInCopy(String(target), path.resolve(String(link))), link, "junction");
    }
  };
  // ES module imports of node:fs (OpenNext's build uses them) read the patched function too.
  syncBuiltinESMExports();
}
