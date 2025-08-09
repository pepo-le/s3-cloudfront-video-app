# S3 + CloudFront HLS Video App

このアプリは、S3 上の HLS(m3u8/TS または fMP4)動画を CloudFront 経由で配信し、フロントは React、バックエンドは Node/Express で署名付き URL を生成します。UI では簡易的なダウンロード抑止を行っています。

## セットアップ

1. 依存関係のインストール

```
npm install
```

2. サーバーの環境変数を設定

`server/.env` を作成して、以下を設定。

```
PORT=4000
CORS_ORIGIN=http://localhost:5173
# 開発時のプロキシ使用フラグ（CloudFrontのCORS設定が完了したらfalseに変更）
USE_PROXY=false
CLOUDFRONT_DOMAIN=dxxxxx.cloudfront.net
CF_KEY_PAIR_ID=KXXXXXXXXXXXXXXXXXXX
CF_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
# または秘密鍵をファイルから読み込む場合
# CF_PRIVATE_KEY_PATH=./private_key.pem
```

3. 開発サーバー起動

```
npm run dev
```

フロント: http://localhost:5173
サーバー: http://localhost:4000

## 使い方

- フロントの入力欄に、CloudFront 配下の m3u8 キー（例: `media/sample/playlist.m3u8`）を指定し「読み込み」。
- バックエンドがプレイリストとセグメント URL を署名付きに書き換えたものを返します。

## MP4 を HLS 形式に変換

S3 に MP4 ファイルをアップロードする前に、HLS 形式に変換する必要があります。

```bash
# FFmpegでMP4をHLS形式に変換
ffmpeg -i sample.mp4 \
  -c:v libx264 -c:a aac \
  -hls_time 6 \
  -hls_playlist_type vod \
  -hls_segment_filename "sample_%03d.ts" \
  -start_number 0 \
  sample.m3u8

# S3にアップロード
aws s3 cp sample.m3u8 s3://your-bucket/sample.m3u8
aws s3 cp sample_000.ts s3://your-bucket/sample_000.ts
# 他のセグメントファイルも同様にアップロード
```

## 重要な設定

### CloudFront の CORS 設定

CloudFront で CORS ヘッダーが設定されていない場合、ブラウザで動画が再生できません。以下を設定してください：

1. **Response Headers Policy**で以下を追加：

   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Methods: GET, HEAD, OPTIONS`
   - `Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept`

2. **Behavior Settings**：
   - Allowed HTTP Methods: GET, HEAD, OPTIONS
   - Cache Based on Selected Request Headers: Include Origin

### 署名付き URL の有効期限

デフォルトでは 600 秒（10 分）です。長時間の動画の場合は注意が必要です。

## 保護の考え方（完全防止は不可）

- HLS 配信 + CloudFront の署名付き URL（ポリシーはプレイリストのディレクトリ配下を許容）。
- CloudFront: OAC/OAI + S3 バケットを Private に。必要に応じて Signed Cookies でも可。
- CloudFront レスポンスヘッダ: `Content-Disposition: inline` を設定（ダウンロードトリガ防止）。
- UI: controlsList=nodownload, disablePictureInPicture, 右クリック抑止, 透かし表示。
- DRM が必要な場合は Widevine/FairPlay 等のマルチ DRM を検討してください。

## トラブルシューティング

### CORS エラーが発生する場合

`USE_PROXY=true` に設定してプロキシ経由で配信してください。CloudFront の CORS 設定完了後は `false` に戻してください。
