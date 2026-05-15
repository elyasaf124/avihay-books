import axios from "axios";
import { API_BASE_URL } from "./client";

function isProductionEmbeddedLocalhost(): boolean {
  if (__DEV__) return false;
  const u = API_BASE_URL.toLowerCase();
  return u.includes("localhost") || u.includes("127.0.0.1");
}

/** סיווג שגיאת `GET /store-map` לטקסט עזר (בלי הסודות). */
export type StoreMapFailureKind =
  | "localhost"
  | "auth"
  | "notFound"
  | "server"
  | "timeout"
  | "network"
  | "unknown";

export function classifyStoreMapFailure(error: unknown): StoreMapFailureKind {
  if (isProductionEmbeddedLocalhost()) return "localhost";
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (status === 401) return "auth";
    if (status === 404) return "notFound";
    if (typeof status === "number" && status >= 500) return "server";
    if (error.code === "ECONNABORTED") return "timeout";
    const msg = (error.message ?? "").toLowerCase();
    if (msg.includes("timeout")) return "timeout";
    if (error.response == null) return "network";
  }
  return "unknown";
}
