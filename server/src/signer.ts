import { getSignedUrl as cfGetSignedUrl } from "@aws-sdk/cloudfront-signer";
import { readFileSync } from "node:fs";

function getEnv() {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CF_KEY_PAIR_ID;

  let privateKey = process.env.CF_PRIVATE_KEY?.replace(/\\n/g, "\n");

  // ファイルパスが指定されている場合
  if (!privateKey && process.env.CF_PRIVATE_KEY_PATH) {
    privateKey = readFileSync(process.env.CF_PRIVATE_KEY_PATH, "utf8");
  }

  if (!domain || !keyPairId || !privateKey) {
    throw new Error("Missing CloudFront signer envs");
  }
  return { domain, keyPairId, privateKey };
}

function dirnameOfKey(keyPath: string) {
  const i = keyPath.lastIndexOf("/");
  return i >= 0 ? keyPath.slice(0, i + 1) : "";
}

export function signForPathPrefix(keyPath: string, ttlSec = 600) {
  const { domain, keyPairId, privateKey } = getEnv();
  const dir = dirnameOfKey(keyPath);
  const resource = `https://${domain}/${dir}*`;
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: resource,
        Condition: {
          DateLessThan: { "AWS:EpochTime": expires },
        },
      },
    ],
  });

  const playlistUrl = `https://${domain}/${keyPath.replace(/^\//, "")}`;
  const signedPlaylistUrl = cfGetSignedUrl({
    url: playlistUrl,
    keyPairId,
    privateKey,
    policy,
  });
  const sigQuery = signedPlaylistUrl.split("?")[1] || "";
  const baseUrl = `https://${domain}/${dir}`;
  return { url: signedPlaylistUrl, baseUrl, sigQuery, expires };
}
