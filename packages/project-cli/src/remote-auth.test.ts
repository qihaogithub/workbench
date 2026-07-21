import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const effectivePackageRoot = process.env.PROJECT_CLI_PACKAGE_ROOT
  ? path.resolve(process.env.PROJECT_CLI_PACKAGE_ROOT)
  : packageRoot;
const cliPath = path.join(effectivePackageRoot, "bin", "ow.mjs");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-cli-auth-"));
const configPath = path.join(tempDir, "cli-config.json");

function runCli(args: string[], extraEnv: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [cliPath, ...args, "--json"], {
    cwd: effectivePackageRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      WORKBENCH_CLI_CONFIG: configPath,
      // 隔离外部环境，避免本机 AUTHOR_SITE_* 干扰断言
      AUTHOR_SITE_URL: "",
      AUTHOR_SITE_AUTH_TOKEN: "",
      ...extraEnv,
    },
  });
  const stdout = result.stdout.trim();
  const payload = stdout
    ? (JSON.parse(stdout) as Record<string, unknown>)
    : {};
  return { result, payload };
}

function errorCode(payload: Record<string, unknown>): string | undefined {
  const error = payload.error as { code?: string } | undefined;
  return error?.code;
}

try {
  // 未配置任何 remote 时 whoami 报 REMOTE_NOT_CONFIGURED
  const emptyWhoami = runCli(["whoami"]);
  assert.equal(emptyWhoami.payload.ok, false);
  assert.equal(errorCode(emptyWhoami.payload), "REMOTE_NOT_CONFIGURED");

  // remote add：首个 remote 自动成为默认
  const added = runCli(["remote", "add", "prod", "http://127.0.0.1:65000/"]);
  assert.equal(added.payload.ok, true);
  const addedData = added.payload.data as {
    name: string;
    url: string;
    isDefault: boolean;
  };
  assert.equal(addedData.name, "prod");
  assert.equal(addedData.url, "http://127.0.0.1:65000");
  assert.equal(addedData.isDefault, true);

  // 配置文件权限 0600
  const mode = fs.statSync(configPath).mode & 0o777;
  assert.equal(mode, 0o600);

  // 非法 url 报错
  const badUrl = runCli(["remote", "add", "bad", "ftp://x"]);
  assert.equal(badUrl.payload.ok, false);
  assert.equal(errorCode(badUrl.payload), "REMOTE_URL_INVALID");

  // remote list
  const listed = runCli(["remote", "list"]);
  assert.equal(listed.payload.ok, true);
  const listedData = listed.payload.data as {
    defaultRemote?: string;
    remotes: Array<{ name: string; loggedIn: boolean }>;
  };
  assert.equal(listedData.defaultRemote, "prod");
  assert.equal(listedData.remotes.length, 1);
  assert.equal(listedData.remotes[0].loggedIn, false);

  // 第二个 remote + use 切换默认
  runCli(["remote", "add", "staging", "http://127.0.0.1:65001"]);
  const used = runCli(["remote", "use", "staging"]);
  assert.equal(used.payload.ok, true);
  const afterUse = runCli(["whoami"]);
  assert.equal(afterUse.payload.ok, true);
  const whoamiData = afterUse.payload.data as {
    remote?: string;
    loggedIn: boolean;
  };
  assert.equal(whoamiData.remote, "staging");
  assert.equal(whoamiData.loggedIn, false);

  // whoami 显式 --remote 覆盖默认
  const whoamiProd = runCli(["whoami", "--remote", "prod"]);
  assert.equal(
    (whoamiProd.payload.data as { remote?: string }).remote,
    "prod",
  );

  // 非交互终端下 login 缺少用户名密码直接报错
  const loginNoInput = runCli(["login", "--remote", "prod"]);
  assert.equal(loginNoInput.payload.ok, false);
  assert.equal(errorCode(loginNoInput.payload), "LOGIN_INPUT_REQUIRED");

  // login 到不可达地址报 REMOTE_UNREACHABLE
  const loginUnreachable = runCli([
    "login",
    "--remote",
    "prod",
    "--username",
    "u",
    "--password",
    "p",
  ]);
  assert.equal(loginUnreachable.payload.ok, false);
  assert.equal(errorCode(loginUnreachable.payload), "REMOTE_UNREACHABLE");

  // 环境变量提供 token 时 whoami 视为已登录
  const whoamiEnvToken = runCli(["whoami"], {
    AUTHOR_SITE_AUTH_TOKEN: "env-token",
  });
  assert.equal(
    (whoamiEnvToken.payload.data as { loggedIn: boolean }).loggedIn,
    true,
  );

  // logout 清理凭证字段但保留 remote
  const loggedOut = runCli(["logout", "--remote", "prod"]);
  assert.equal(loggedOut.payload.ok, true);
  const afterLogout = runCli(["remote", "list"]);
  const remoteNames = (
    (afterLogout.payload.data as { remotes: Array<{ name: string }> }).remotes
  ).map((remote) => remote.name);
  assert.deepEqual(remoteNames.sort(), ["prod", "staging"]);

  // remote remove 后默认回退
  const removed = runCli(["remote", "remove", "staging"]);
  assert.equal(removed.payload.ok, true);
  const finalWhoami = runCli(["whoami"]);
  assert.equal(
    (finalWhoami.payload.data as { remote?: string }).remote,
    "prod",
  );

  console.log("remote-auth.test.ts 通过");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
