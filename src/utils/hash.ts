import { createHash } from "node:crypto";

export function sha256(text: string): string {
  const hash = createHash("sha256");
  hash.update(text, "utf8");
  return hash.digest("hex");
}


