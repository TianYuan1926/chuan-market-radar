import {
  REQUIRED_UI_STATUS_KEYS,
  uiStatusLabel as dictionaryUiStatusLabel,
  type UiCanonicalStatus,
} from "./status-dictionary";

export const STATUS_LABEL_CN: Record<UiCanonicalStatus, string> =
  Object.fromEntries(
    REQUIRED_UI_STATUS_KEYS.map((status) => [status, dictionaryUiStatusLabel(status)]),
  ) as Record<UiCanonicalStatus, string>;

export function statusLabelCn(status: UiCanonicalStatus): string {
  return STATUS_LABEL_CN[status];
}

export const uiStatusLabel = statusLabelCn;
