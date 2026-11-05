import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];

function start(label, args) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log(`[dev:all] ${label} 退出 (code=${code}, signal=${signal})，正在停止另一个进程`);
    }
    stopAll();
    process.exit(code ?? 1);
  });

  children.push(child);
}

let shuttingDown = false;

function stopAll() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

start("server", ["--env-file", resolve(root, ".env"), resolve(root, "server/index.mjs")]);
start("web", [resolve(root, "node_modules/vite/bin/vite.js")]);
