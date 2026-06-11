---
name: keyboard-input-scroll
description: >-
  React Native pattern for keeping focused TextInputs visible above the keyboard
  in ScrollView/FlatList forms. Scroll only when the input overlaps the keyboard
  zone, by the minimum overflow amount. Canonical reference: mobile/app/(tabs)/add-remove.tsx.
  Use when the user asks to follow this skill (עקוב אחרי הסקיל / לפי הסקיל),
  when the keyboard covers inputs, unwanted auto-scroll happens, or bottom inputs
  cannot scroll enough.
---

# Keyboard-aware input scroll (React Native)

## מקור אמת

העתק את הלוגיקה **בדיוק** מ:

- **ראשי:** `mobile/app/(tabs)/add-remove.tsx` — `ensureInputVisible`, `onInputFocus`, `useEffect` על `keyboardHeight`
- **יישום משותף:** `mobile/src/components/bot/BotFormControls.tsx` — `BotKeyboardScrollView` + `LabeledInput`

אל תמציא גישה חדשה. אל תשתמש ב-`KeyboardAvoidingView` + `automaticallyAdjustKeyboardInsets` יחד אלא אם כבר קיים כך באותו מסך.

## הבעיה שפותרים

- המקלדת מכסה `TextInput` בטופס גליל
- גלילה מיותרת לשדות שלא באזור המקלדת
- שדות תחתונים — אין מספיק מקום לגלול
- גלילה שדוחפת את השדה לתחתית המסך ואז המקלדת מכסה

## הלוגיקה (חובה)

### 1. Hooks ו-refs

```typescript
const keyboardHeight = useKeyboardHeight();
const { height: windowH } = useWindowDimensions();
const scrollOffsetRef = useRef(0);
const inputRefs = useRef<Map<string, TextInput>>(new Map());
const focusedInputKeyRef = useRef<string | null>(null);
```

### 2. `ensureInputVisible`

```typescript
const ensureInputVisible = useCallback(
  (key: string) => {
    if (keyboardHeight <= 0) return;
    const node = inputRefs.current.get(key);
    if (!node) return;
    node.measureInWindow((_x, y, _w, height) => {
      const keyboardTop = windowH - keyboardHeight;
      const margin = theme.spacing.lg;
      const overflow = y + height - (keyboardTop - margin);
      if (overflow > 0) {
        scrollRef.current?.scrollTo({
          y: Math.max(0, scrollOffsetRef.current + overflow),
          animated: true,
        });
      }
    });
  },
  [keyboardHeight, windowH],
);
```

- **רק** כש-`overflow > 0` — גלילה מינימלית
- מודדים את ה-`TextInput` (לא `View` עוטף)
- `keyboardTop = windowH - keyboardHeight` — לא `measureInWindow` על ה-ScrollView

### 3. `onInputFocus`

```typescript
const onInputFocus = useCallback(
  (key: string) => {
    focusedInputKeyRef.current = key;
    ensureInputVisible(key);
  },
  [ensureInputVisible],
);
```

### 4. ניסיון חוזר אחרי פתיחת מקלדת (Android)

```typescript
useEffect(() => {
  if (keyboardHeight <= 0 || !focusedInputKeyRef.current) return undefined;
  const key = focusedInputKeyRef.current;
  const t = setTimeout(() => ensureInputVisible(key), 60);
  return () => clearTimeout(t);
}, [keyboardHeight, ensureInputVisible]);
```

### 5. ScrollView / FlatList

```typescript
<ScrollView
  ref={scrollRef}
  keyboardShouldPersistTaps="handled"
  keyboardDismissMode="on-drag"
  automaticallyAdjustKeyboardInsets={false}
  scrollEventThrottle={16}
  onScroll={(e) => {
    scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
  }}
  contentContainerStyle={[
    contentStyle,
    { paddingBottom: keyboardHeight + theme.spacing.xl },
  ]}
>
```

### 6. TextInput

```typescript
<TextInput
  ref={(node) => {
    const key = "...";
    if (node) inputRefs.current.set(key, node);
    else inputRefs.current.delete(key);
  }}
  onFocus={() => onInputFocus(key)}
/>
```

בקומפוננטות משותפות: `useId()` למפתח + Context עם `registerInput` / `onInputFocus` (ראה `BotFormControls.tsx`).

## מה לא לעשות

| ❌ לא | למה |
|------|-----|
| `scrollTo(top - margin)` / להצמיד שדה לראש המסך | שובר שדות תחתונים |
| `measureInWindow` על ScrollView לחישוב visible | לא אמין; השתמש ב-`windowH - keyboardHeight` |
| גלילה ב-focus לפני `keyboardHeight > 0` בלי retry | Android — המקלדת עדיין לא נמדדה |
| `automaticallyAdjustKeyboardInsets={true}` עם גלילה ידנית | גלילה כפולה / לא צפויה |
| `textAlign="right"` ב-RTL native לתוויות | ב-`TextInput` ב-RTL: `textAlign="right"` (לא מתהפך כמו `Text`) |

## יישום במסך חדש — צ'קליסט

- [ ] `useKeyboardHeight` + `useWindowDimensions`
- [ ] `inputRefs` Map + `focusedInputKeyRef`
- [ ] `scrollOffsetRef` + `onScroll`
- [ ] `ensureInputVisible` — העתקה מדויקת
- [ ] `onInputFocus` + `useEffect` 60ms
- [ ] `paddingBottom: keyboardHeight + theme.spacing.xl`
- [ ] `automaticallyAdjustKeyboardInsets={false}`
- [ ] ref על כל `TextInput` + `onFocus`

## בדיקה

1. שדה עליון — **אין** גלילה
2. שדה באמצע שנכנס לאזור מקלדת — גלילה קטנה
3. שדה אחרון — עולה מעל המקלדת, לא נתקע
4. מעבר בין שדות עם מקלדת פתוחה — רק שדה מוסתר זז
