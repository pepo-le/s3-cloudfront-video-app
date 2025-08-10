import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { signForPathPrefix } from "../signer";
import { readFileSync } from "node:fs";

// Mock AWS SDK
vi.mock("@aws-sdk/cloudfront-signer", () => ({
  getSignedUrl: vi.fn(),
}));

// Mock fs
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

const { getSignedUrl } = await import("@aws-sdk/cloudfront-signer");
const mockGetSignedUrl = vi.mocked(getSignedUrl);
const mockReadFileSync = vi.mocked(readFileSync);

describe("signer", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      CLOUDFRONT_DOMAIN: "d123456789.cloudfront.net",
      CF_KEY_PAIR_ID: "K123456789ABCDEF",
      CF_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nMOCK_KEY\\n-----END PRIVATE KEY-----",
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("signForPathPrefix", () => {
    it("should generate signed URL with correct parameters", () => {
      const mockSignedUrl = "https://d123456789.cloudfront.net/media/moon.m3u8?Policy=abc&Signature=def&Key-Pair-Id=K123456789ABCDEF";
      mockGetSignedUrl.mockReturnValue(mockSignedUrl);

      const result = signForPathPrefix("media/moon.m3u8");

      expect(mockGetSignedUrl).toHaveBeenCalledWith({
        url: "https://d123456789.cloudfront.net/media/moon.m3u8",
        keyPairId: "K123456789ABCDEF",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----",
        policy: expect.stringContaining("https://d123456789.cloudfront.net/media/*"),
      });

      expect(result.url).toBe(mockSignedUrl);
      expect(result.baseUrl).toBe("https://d123456789.cloudfront.net/media/");
      expect(result.sigQuery).toBe("Policy=abc&Signature=def&Key-Pair-Id=K123456789ABCDEF");
    });

    it("should handle file without directory", () => {
      const mockSignedUrl = "https://d123456789.cloudfront.net/video.m3u8?Policy=abc";
      mockGetSignedUrl.mockReturnValue(mockSignedUrl);

      const result = signForPathPrefix("video.m3u8");

      expect(result.baseUrl).toBe("https://d123456789.cloudfront.net/");
    });

    it("should use private key from file when CF_PRIVATE_KEY_PATH is set", () => {
      process.env = {
        ...process.env,
        CF_PRIVATE_KEY: undefined,
        CF_PRIVATE_KEY_PATH: "/path/to/key.pem",
      };
      
      mockReadFileSync.mockReturnValue("-----BEGIN PRIVATE KEY-----\nFILE_KEY\n-----END PRIVATE KEY-----");
      mockGetSignedUrl.mockReturnValue("https://example.com");

      signForPathPrefix("test.m3u8");

      expect(mockReadFileSync).toHaveBeenCalledWith("/path/to/key.pem", "utf8");
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          privateKey: "-----BEGIN PRIVATE KEY-----\nFILE_KEY\n-----END PRIVATE KEY-----",
        })
      );
    });

    it("should throw error when environment variables are missing", () => {
      process.env = {
        ...process.env,
        CLOUDFRONT_DOMAIN: undefined,
      };

      expect(() => signForPathPrefix("test.m3u8")).toThrow("Missing CloudFront signer envs");
    });

    it("should process policy with correct expiration time", () => {
      const mockTime = 1640000000;
      vi.spyOn(Date, "now").mockReturnValue(mockTime * 1000);
      mockGetSignedUrl.mockReturnValue("https://example.com");

      signForPathPrefix("test.m3u8", 300);

      const expectedPolicy = JSON.stringify({
        Statement: [
          {
            Resource: "https://d123456789.cloudfront.net/*",
            Condition: {
              DateLessThan: { "AWS:EpochTime": mockTime + 300 },
            },
          },
        ],
      });

      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          policy: expectedPolicy,
        })
      );
    });
  });
});