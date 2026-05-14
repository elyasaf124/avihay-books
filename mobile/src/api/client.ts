import axios from "axios";
import Constants from "expo-constants";

const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string; apiKey?: string | null } | undefined)
  ?.apiBaseUrl;
const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
const apiKey =
  process.env.EXPO_PUBLIC_API_KEY ??
  (Constants.expoConfig?.extra as { apiKey?: string | null } | undefined)?.apiKey;

export const API_BASE_URL = fromEnv ?? fromExtra ?? "http://localhost:4000/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10_000,
});

if (apiKey) {
  api.defaults.headers.common["x-api-key"] = apiKey;
}
