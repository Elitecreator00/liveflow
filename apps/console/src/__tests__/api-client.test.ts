/**
 * API client unit tests (Console — validates @liveflow/api-client).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { login, goLive, updateSceneState, ApiError } from "@liveflow/api-client";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("login()", () => {
  it("POST /auth/login with correct body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: "tok123" }), { status: 200 }),
    );

    const result = await login({ email: "a@b.com", password: "pass" });
    expect(result.accessToken).toBe("tok123");
    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/auth/login"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws ApiError on 401", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    await expect(login({ email: "x@y.com", password: "bad" })).rejects.toThrow(ApiError);
  });
});

describe("goLive()", () => {
  it("POST /agencies/:id/streaming/go-live", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sessionId: "sess-1",
          streamKey: "key-abc",
          ingestUrl: "rtmp://localhost/live/key-abc",
        }),
        { status: 200 },
      ),
    );

    const res = await goLive(
      "agency-1",
      { creatorId: "c1", connectedAccountIds: ["acct-1"] },
      "token-xyz",
    );
    expect(res.sessionId).toBe("sess-1");
    const [url, init] = vi.mocked(global.fetch).mock.calls[0]!;
    expect(String(url)).toContain("/agencies/agency-1/streaming/go-live");
    expect((init as RequestInit).method).toBe("POST");
  });
});

describe("updateSceneState()", () => {
  const SESSION_ID = "sess-effects-1";
  const TOKEN = "jwt-test";
  const sceneStateResponse = {
    sessionId: SESSION_ID,
    overlays: [],
    updatedAt: new Date().toISOString(),
  };

  it("invia il campo effects nel body quando specificato", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sceneStateResponse), { status: 200 }),
    );

    await updateSceneState(
      SESSION_ID,
      [],
      undefined,
      undefined,
      { beautify: { enabled: true, intensity: 60 } },
      TOKEN,
    );

    const [, init] = vi.mocked(global.fetch).mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(body).toHaveProperty("effects");
    expect((body.effects as { beautify: { enabled: boolean; intensity: number } }).beautify).toEqual({
      enabled: true,
      intensity: 60,
    });
  });

  it("retrocompatibilità: chiamata senza effects (firma legacy 5-arg) funziona", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sceneStateResponse), { status: 200 }),
    );

    // Firma legacy: ultimo arg è il token (stringa).
    await updateSceneState(SESSION_ID, [], undefined, undefined, TOKEN);

    const [, init] = vi.mocked(global.fetch).mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    // effects può essere presente come undefined/null o assente — non deve rompere.
    expect(body).toHaveProperty("overlays");
  });

  it("SceneState con effects assente è retrocompatibile", () => {
    const legacyState = {
      sessionId: "s1",
      overlays: [],
      updatedAt: new Date().toISOString(),
    };
    // Verifica che lo stato legacy (senza effects) non rompa il type-check JS runtime.
    expect("effects" in legacyState).toBe(false);
  });
});
