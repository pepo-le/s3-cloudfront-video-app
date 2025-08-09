import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Hls from "hls.js";

function useHlsPlayer(src?: string) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(video);
      const onManifest = () => video.play().catch(() => {});
      hls.on(Hls.Events.MANIFEST_PARSED, onManifest);
      return () => {
        hls.off(Hls.Events.MANIFEST_PARSED, onManifest);
        hls.destroy();
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      const onLoaded = () => video.play().catch(() => {});
      video.addEventListener("loadedmetadata", onLoaded);
      return () => {
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeAttribute("src");
      };
    }
  }, [src]);
  return videoRef;
}

export default function App() {
  const [key, setKey] = useState("media/moon.m3u8");
  const [sourceUrl, setSourceUrl] = useState<string>(
    () => `/api/playlist?key=${encodeURIComponent("media/moon.m3u8")}`
  );
  const videoRef = useHlsPlayer(sourceUrl);

  const watermark = useMemo(() => {
    const ts = new Date().toLocaleString("ja-JP");
    return `CONFIDENTIAL • ${ts}`;
  }, []);

  const applyKey = useCallback(() => {
    setSourceUrl(`/api/playlist?key=${encodeURIComponent(key)}`);
  }, [key]);

  useEffect(() => {
    // 初回デモ用にロード
    applyKey();
  }, [applyKey]);

  return (
    <div className="container" onContextMenu={(e) => e.preventDefault()}>
      <h1>動画視聴</h1>
      <div className="player-wrap">
        <video
          ref={videoRef}
          controls
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")
              e.preventDefault();
          }}
          playsInline
          style={{ width: "100%", background: "black" }}
        >
          <track kind="captions" srcLang="ja" label="日本語" />
        </video>
        <div className="watermark">{watermark}</div>
      </div>

      <div className="controls">
        <input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          style={{ width: "60%" }}
        />
        <button type="button" onClick={applyKey}>
          読み込み
        </button>
      </div>

      <p className="hint">
        ・HLS + 署名クエリで直接保存を抑止（完全防止は不可）。
        <br />
        ・右クリック/ショートカット/PiP/リモート再生を抑止。
      </p>
    </div>
  );
}
