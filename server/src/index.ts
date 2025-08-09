import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import dotenv from "dotenv";
import { signForPathPrefix } from "./signer.js";
import { fetch } from "undici";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || true }));
app.use(express.json());

app.disable("x-powered-by");
app.use((_: Request, res: Response, next: NextFunction) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

// 署名付きプレイリストを返す（プレイリスト内のURLも署名付きに書き換え）
app.get("/api/playlist", async (req: Request, res: Response) => {
  try {
    const key = (req.query.key as string) || "";
    if (!key) return res.status(400).json({ error: "key is required" });

    const {
      url: signedPlaylistUrl,
      baseUrl,
      sigQuery,
    } = signForPathPrefix(key);

    const resp = await fetch(signedPlaylistUrl);
    if (!resp.ok) {
      return res.status(502).json({ error: "failed to fetch origin playlist" });
    }
    const text = await resp.text();

    const appendSig = (u: string) => {
      const hasProto = /^https?:\/\//i.test(u);
      const target = hasProto ? u : baseUrl + u;
      const joiner = target.includes("?") ? "&" : "?";
      const signedUrl = `${target}${joiner}${sigQuery}`;

      // 環境変数でプロキシ使用を制御
      const useProxy = process.env.USE_PROXY === "true";
      if (useProxy) {
        return `/api/proxy?url=${encodeURIComponent(signedUrl)}`;
      }
      return signedUrl;
    };

    const rewrite = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      // タグ行のURI= を書き換え
      if (trimmed.startsWith("#") && /URI=/.test(trimmed)) {
        return trimmed.replace(/URI="?([^",]+)"?/i, (_m, p1: string) => {
          const signed = appendSig(p1);
          const quote = /URI="/i.test(trimmed) ? '"' : "";
          return `URI=${quote}${signed}${quote}`;
        });
      }
      // 非タグ行（セグメント/レンディションの相対/絶対URL）
      if (!trimmed.startsWith("#")) {
        return appendSig(trimmed);
      }
      return line;
    };

    const body = text.split(/\r?\n/).map(rewrite).join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.send(body);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to build signed playlist" });
  }
});

// 互換用（必要ならば直接署名URLを返す）
app.get("/api/sign", async (req: Request, res: Response) => {
  try {
    const key = (req.query.key as string) || "";
    if (!key) return res.status(400).json({ error: "key is required" });
    const { url } = signForPathPrefix(key);
    res.json({ url });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to sign url" });
  }
});

// 開発時のプロキシエンドポイント（CloudFrontのCORSが設定されるまでの暫定対応）
app.get("/api/proxy", async (req: Request, res: Response) => {
  try {
    const url = (req.query.url as string) || "";
    if (!url) return res.status(400).json({ error: "url is required" });

    const response = await fetch(url);
    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "failed to fetch resource" });
    }

    // Content-Typeをそのまま転送
    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    // レスポンスボディを転送
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "failed to proxy request" });
  }
});

const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => console.log(`server listening on ${PORT}`));
