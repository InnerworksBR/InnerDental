import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("separate production containers", () => {
  it("keeps the web deployment isolated and bound to localhost by default", () => {
    const compose = read("deploy/web.compose.yaml");
    const dockerfile = read("Dockerfile");
    const dockerignore = read(".dockerignore");

    expect(compose).toContain("name: luna-web");
    expect(compose).toContain("dockerfile: Dockerfile");
    expect(compose).toContain("${WEB_BIND_ADDRESS:-127.0.0.1}:${WEB_PORT:-3000}:3000");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).not.toMatch(/^\s{2}worker:/m);
    expect(dockerfile).toMatch(/^FROM node:24-slim@sha256:/m);
    expect(dockerfile).toContain("USER nextjs");
    expect(dockerfile).toContain("STOPSIGNAL SIGTERM");
    expect(dockerignore).toMatch(/^\.env\*$/m);
    expect(dockerignore).toMatch(/^deploy$/m);
  });

  it("keeps the worker private, independently deployable and non-root", () => {
    const compose = read("deploy/worker.compose.yaml");
    const dockerfile = read("worker/Dockerfile");
    const environment = read("deploy/worker.env.example");

    expect(compose).toContain("name: luna-worker");
    expect(compose).toContain("dockerfile: worker/Dockerfile");
    expect(compose).not.toMatch(/^\s+ports:/m);
    expect(compose).toContain("http://127.0.0.1:3001/health");
    expect(compose).toContain("read_only: true");
    expect(compose).not.toMatch(/^\s{2}web:/m);
    expect(dockerfile).toMatch(/^FROM node:24-slim@sha256:/m);
    expect(dockerfile).toContain("USER node");
    expect(dockerfile).toContain("STOPSIGNAL SIGTERM");
    expect(environment).toMatch(/^HANDOFF_NOTIFICATION_PHONE=/m);
  });
});
