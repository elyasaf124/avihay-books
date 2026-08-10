import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { BotStoreInfo } from "@avihay-books/shared";
import { useBotConfig } from "../../api/botConfig";
import { he } from "../../i18n/he";
import { theme } from "../../theme";
import { BotKeyboardScrollView, CenterState, LabeledInput } from "./BotFormControls";
import { useBotAutoSave } from "./useBotAutoSave";

function draftToStoreInfo(draft: Record<keyof BotStoreInfo, string>): BotStoreInfo {
  const nz = (v: string): string | null => (v.trim().length === 0 ? null : v.trim());
  const num = (v: string, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    store_name: draft.store_name.trim(),
    store_address: draft.store_address.trim(),
    hours_text: draft.hours_text,
    waze_url: nz(draft.waze_url),
    bank_details: draft.bank_details,
    payment_credit_url: nz(draft.payment_credit_url),
    payment_bit_url: nz(draft.payment_bit_url),
    payment_paybox_url: nz(draft.payment_paybox_url),
    catalog_pdf_url: nz(draft.catalog_pdf_url),
    updates_group_url: nz(draft.updates_group_url),
    delivery_home_fee: num(draft.delivery_home_fee, 0),
    delivery_point_fee: num(draft.delivery_point_fee, 0),
    human_hours_start: num(draft.human_hours_start, 0),
    human_hours_end: num(draft.human_hours_end, 0),
    admin_phone: draft.admin_phone.trim(),
  };
}

/** טופס עריכת פרטי החנות (`store_info`) — נשמר אוטומטית. */
export function StoreInfoEditor(): JSX.Element {
  const configQuery = useBotConfig();
  const [draft, setDraft] = useState<Record<keyof BotStoreInfo, string> | null>(null);

  useEffect(() => {
    if (!configQuery.data || draft) return;
    const s = configQuery.data.store_info;
    setDraft({
      store_name: s.store_name,
      store_address: s.store_address,
      hours_text: s.hours_text,
      waze_url: s.waze_url ?? "",
      bank_details: s.bank_details,
      payment_credit_url: s.payment_credit_url ?? "",
      payment_bit_url: s.payment_bit_url ?? "",
      payment_paybox_url: s.payment_paybox_url ?? "",
      catalog_pdf_url: s.catalog_pdf_url ?? "",
      updates_group_url: s.updates_group_url ?? "",
      delivery_home_fee: String(s.delivery_home_fee),
      delivery_point_fee: String(s.delivery_point_fee),
      human_hours_start: String(s.human_hours_start),
      human_hours_end: String(s.human_hours_end),
      admin_phone: s.admin_phone ?? "",
    });
  }, [configQuery.data, draft]);

  const savePayload = useMemo(() => {
    if (!configQuery.data || !draft) return null;
    return { ...configQuery.data, store_info: draftToStoreInfo(draft) };
  }, [configQuery.data, draft]);

  useBotAutoSave(savePayload, savePayload != null);

  const set = (key: keyof BotStoreInfo, value: string): void =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <CenterState
        loading={configQuery.isLoading || !draft}
        error={configQuery.isError}
        onRetry={() => void configQuery.refetch()}
      >
        {draft ? (
          <BotKeyboardScrollView contentStyle={styles.content}>
              <LabeledInput label={he.bot.fieldStoreName} value={draft.store_name} onChangeText={(v) => set("store_name", v)} maxLength={100} />
              <LabeledInput label={he.bot.fieldStoreAddress} value={draft.store_address} onChangeText={(v) => set("store_address", v)} multiline />
              <LabeledInput label={he.bot.fieldHoursText} value={draft.hours_text} onChangeText={(v) => set("hours_text", v)} multiline />
              <LabeledInput label={he.bot.fieldWazeUrl} value={draft.waze_url} onChangeText={(v) => set("waze_url", v)} hint={he.bot.optionalHint} keyboardType="url" />
              <LabeledInput label={he.bot.fieldBankDetails} value={draft.bank_details} onChangeText={(v) => set("bank_details", v)} multiline />
              <LabeledInput label={he.bot.fieldCreditUrl} value={draft.payment_credit_url} onChangeText={(v) => set("payment_credit_url", v)} hint={he.bot.optionalHint} keyboardType="url" />
              <LabeledInput label={he.bot.fieldBitUrl} value={draft.payment_bit_url} onChangeText={(v) => set("payment_bit_url", v)} hint={he.bot.optionalHint} keyboardType="url" />
              <LabeledInput label={he.bot.fieldPayboxUrl} value={draft.payment_paybox_url} onChangeText={(v) => set("payment_paybox_url", v)} hint={he.bot.optionalHint} keyboardType="url" />
              <LabeledInput label={he.bot.fieldCatalogUrl} value={draft.catalog_pdf_url} onChangeText={(v) => set("catalog_pdf_url", v)} hint={he.bot.optionalHint} keyboardType="url" />
              <LabeledInput label={he.bot.fieldUpdatesUrl} value={draft.updates_group_url} onChangeText={(v) => set("updates_group_url", v)} hint={he.bot.optionalHint} keyboardType="url" />
              <LabeledInput label={he.bot.fieldDeliveryHomeFee} value={draft.delivery_home_fee} onChangeText={(v) => set("delivery_home_fee", v)} keyboardType="numeric" />
              <LabeledInput label={he.bot.fieldDeliveryPointFee} value={draft.delivery_point_fee} onChangeText={(v) => set("delivery_point_fee", v)} keyboardType="numeric" />
              <LabeledInput label={he.bot.fieldHumanHoursStart} value={draft.human_hours_start} onChangeText={(v) => set("human_hours_start", v)} keyboardType="numeric" />
              <LabeledInput label={he.bot.fieldHumanHoursEnd} value={draft.human_hours_end} onChangeText={(v) => set("human_hours_end", v)} keyboardType="numeric" />
              <LabeledInput
                label={he.bot.fieldAdminPhone}
                value={draft.admin_phone}
                onChangeText={(v) => set("admin_phone", v)}
                hint={he.bot.fieldAdminPhoneHint}
                keyboardType="phone-pad"
              />
          </BotKeyboardScrollView>
        ) : null}
      </CenterState>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md },
});
