import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { signForPathPrefix } from "../signer";
import { fetch } from "undici";
import app from "../index";

// Mock dependencies
vi.mock("../signer");
vi.mock("undici");

const mockSignForPathPrefix = vi.mocked(signForPathPrefix);
const mockFetch = vi.mocked(fetch);

// Set test environment
process.env.NODE_ENV = "test";
process.env.CORS_ORIGIN = "http://localhost:5173";
process.env.USE_PROXY = "false";

describe("API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/playlist", () => {
    it("should return 400 when key is missing", async () => {
      const response = await request(app)
        .get("/api/playlist")
        .expect(400);

      expect(response.body.error).toBe("key is required");
    });

    it("should return signed playlist with rewritten URLs", async () => {
      const mockPlaylist = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment001.ts
#EXTINF:10.0,
segment002.ts
#EXT-X-ENDLIST`;

      mockSignForPathPrefix.mockReturnValue({
        url: "https://example.com/video.m3u8?Policy=abc&Signature=def&Key-Pair-Id=ghi",
        baseUrl: "https://example.com/",
        sigQuery: "Policy=abc&Signature=def&Key-Pair-Id=ghi",
        expires: 1234567890,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => mockPlaylist,
      } as unknown as Response);

      const response = await request(app)
        .get("/api/playlist?key=video.m3u8")
        .expect(200);

      expect(response.headers["content-type"]).toBe("application/vnd.apple.mpegurl; charset=utf-8");
      expect(response.text).toContain("https://example.com/segment001.ts?Policy=abc&Signature=def&Key-Pair-Id=ghi");
      expect(mockSignForPathPrefix).toHaveBeenCalledWith("video.m3u8");
    });

    it("should handle proxy mode when USE_PROXY is true", async () => {
      process.env.USE_PROXY = "true";

      const mockPlaylist = `#EXTM3U
segment.ts`;

      mockSignForPathPrefix.mockReturnValue({
        url: "https://example.com/video.m3u8?sig=abc",
        baseUrl: "https://example.com/",
        sigQuery: "sig=abc",
        expires: 1234567890,
      });

      mockFetch.mockResolvedValue({
        ok: true,
        text: async () => mockPlaylist,
      } as unknown as Response);

      const response = await request(app)
        .get("/api/playlist?key=video.m3u8")
        .expect(200);

      expect(response.text).toContain("/api/proxy?url=");
      
      // Reset for other tests
      process.env.USE_PROXY = "false";
    });

    it("should return 502 when origin playlist fetch fails", async () => {
      mockSignForPathPrefix.mockReturnValue({
        url: "https://example.com/video.m3u8",
        baseUrl: "https://example.com/",
        sigQuery: "",
        expires: 1234567890,
      });

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const response = await request(app)
        .get("/api/playlist?key=nonexistent.m3u8")
        .expect(502);

      expect(response.body.error).toBe("failed to fetch origin playlist");
    });
  });

  describe("GET /api/sign", () => {
    it("should return 400 when key is missing", async () => {
      const response = await request(app)
        .get("/api/sign")
        .expect(400);

      expect(response.body.error).toBe("key is required");
    });

    it("should return signed URL", async () => {
      mockSignForPathPrefix.mockReturnValue({
        url: "https://example.com/video.m3u8?Policy=abc",
        baseUrl: "https://example.com/",
        sigQuery: "Policy=abc",
        expires: 1234567890,
      });

      const response = await request(app)
        .get("/api/sign?key=video.m3u8")
        .expect(200);

      expect(response.body.url).toBe("https://example.com/video.m3u8?Policy=abc");
    });
  });

  describe("GET /api/proxy", () => {
    it("should return 400 when url is missing", async () => {
      const response = await request(app)
        .get("/api/proxy")
        .expect(400);

      expect(response.body.error).toBe("url is required");
    });

    it("should proxy content successfully", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue("video/mp2t"),
        },
        arrayBuffer: async () => new ArrayBuffer(1024),
      } as unknown as Response);

      const response = await request(app)
        .get("/api/proxy?url=https://example.com/segment.ts")
        .expect(200);

      expect(response.headers["content-type"]).toBe("video/mp2t");
      expect(mockFetch).toHaveBeenCalledWith("https://example.com/segment.ts");
    });

    it("should return error when proxied request fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      const response = await request(app)
        .get("/api/proxy?url=https://example.com/nonexistent.ts")
        .expect(404);

      expect(response.body.error).toBe("failed to fetch resource");
    });
  });
});