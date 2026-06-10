import { pool } from "../db/pool.js";

/** רושם/מעדכן טוקן Expo Push של מכשיר עובד (לשליחת התראות מרחוק). */
export async function upsertPushToken(expoToken: string, platform?: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO push_tokens (expo_token, platform, last_seen_at)
     VALUES ($1, $2, now())
     ON CONFLICT (expo_token)
     DO UPDATE SET platform = EXCLUDED.platform, last_seen_at = now()`,
    [expoToken, platform ?? null],
  );
}

/** כל הטוקנים הרשומים — יעד שליחת ההתראות (אין חשבונות עובדים נפרדים). */
export async function listPushTokens(): Promise<string[]> {
  const { rows } = await pool.query<{ expo_token: string }>(
    `SELECT expo_token FROM push_tokens ORDER BY last_seen_at DESC`,
  );
  return rows.map((r) => r.expo_token);
}

/** מסיר טוקן שנפסל על-ידי Expo (DeviceNotRegistered). */
export async function deletePushToken(expoToken: string): Promise<void> {
  await pool.query(`DELETE FROM push_tokens WHERE expo_token = $1`, [expoToken]);
}
