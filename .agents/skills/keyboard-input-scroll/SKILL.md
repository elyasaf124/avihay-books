---
name: keyboard-input-scroll
description: >-
  React Native patterns for keyboard-aware TextInputs: (1) ScrollView/FlatList forms —
  scroll only on overflow; ref add-remove.tsx. (2) Centered Modal dialogs — shift card
  with translateY, never stretch; ref MenuItemsManager.tsx. Use when the user asks to
  follow this skill (עקוב אחרי הסקיל / לפי הסקיל), when keyboard covers inputs, modal
  stretches on keyboard open, unwanted auto-scroll, or bottom inputs cannot scroll enough.
---

# Keyboard-aware inputs (React Native)

שני דפוסים — בחר לפי סוג מסך:

| סוג | פתרון | מקור אמת |
|-----|--------|----------|
| טופס גליל (`ScrollView` / `FlatList`) | גלילה מינימלית ב-`overflow` | `add-remove.tsx` |
| מודל ממורכז (`Modal`) | הזזת כרטיס ב-`translateY` | `MenuItemsManager.tsx` |

אל תמציא גישה חדשה.

---

## א. טופס גליל — מקור אמת

העתק את הלוגיקה **בדיוק** מ:

- **ראשי:** `mobile/app/(tabs)/add-remove.tsx` — `ensureInputVisible`, `onInputFocus`, `useEffect` על `keyboardHeight`
- **יישום משותף:** `mobile/src/components/bot/BotFormControls.tsx` — `BotKeyboardScrollView` + `LabeledInput`

אל תשתמש ב-`KeyboardAvoidingView` + `automaticallyAdjustKeyboardInsets` יחד אלא אם כבר קיים כך באותו מסך.

## הבעיה שפותרים (טופס גליל)

- המקלדת מכסה `TextInput` בטופס גליל
- גלילה מיותרת לשדות שלא באזור המקלדת
- שדות תחתונים — אין מספיק מקום לגלול
- גלילה שדוחפת את השדה לתחתית המסך ואז המקלדת מכסה

## הלוגיקה — טופס גליל (חובה)

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

## מה לא לעשות (טופס גליל)

| ❌ לא | למה |
|------|-----|
| `scrollTo(top - margin)` / להצמיד שדה לראש המסך | שובר שדות תחתונים |
| `measureInWindow` על ScrollView לחישוב visible | לא אמין; השתמש ב-`windowH - keyboardHeight` |
| גלילה ב-focus לפני `keyboardHeight > 0` בלי retry | Android — המקלדת עדיין לא נמדדה |
| `automaticallyAdjustKeyboardInsets={true}` עם גלילה ידנית | גלילה כפולה / לא צפויה |
| `textAlign="right"` ב-RTL native לתוויות | ב-`TextInput` ב-RTL: `textAlign="right"` (לא מתהפך כמו `Text`) |

## צ'קליסט — טופס גליל

- [ ] `useKeyboardHeight` + `useWindowDimensions`
- [ ] `inputRefs` Map + `focusedInputKeyRef`
- [ ] `scrollOffsetRef` + `onScroll`
- [ ] `ensureInputVisible` — העתקה מדויקת
- [ ] `onInputFocus` + `useEffect` 60ms
- [ ] `paddingBottom: keyboardHeight + theme.spacing.xl`
- [ ] `automaticallyAdjustKeyboardInsets={false}`
- [ ] ref על כל `TextInput` + `onFocus`

## בדיקה — טופס גליל

1. שדה עליון — **אין** גלילה
2. שדה באמצע שנכנס לאזור מקלדת — גלילה קטנה
3. שדה אחרון — עולה מעל המקלדת, לא נתקע
4. מעבר בין שדות עם מקלדת פתוחה — רק שדה מוסתר זז

---

## ב. מודל ממורכז — מקור אמת

העתק מ-`mobile/src/components/bot/MenuItemsManager.tsx` (מודלי create / edit).

### הבעיה שפותרים (מודל)

- המודל **נמתח** עד למעלה כשהמקלדת נפתחת
- רווח לבן ענק בתוך המודל
- `KeyboardAvoidingView` + `ScrollView` עם `paddingBottom: keyboardHeight` גורמים לזה

### מה לא לעשות במודל

| ❌ לא | למה |
|------|-----|
| `KeyboardAvoidingView` עם `behavior: "height"` | מותח את כל המיכל |
| `ScrollView` + `paddingBottom: keyboardHeight` בתוך כרטיס קטן | מנפח את גובה המודל |
| גלילה (`scrollTo`) בתוך מודל קומפקטי | לא נדרש; הזז את הכרטיס |

### Hooks ו-state

```typescript
const keyboardHeight = useKeyboardHeight();
const { height: windowH } = useWindowDimensions();
const inputRefs = useRef<Map<string, TextInput>>(new Map());
const focusedInputKeyRef = useRef<string | null>(null);
const [modalShift, setModalShift] = useState(0);
```

### `ensureInputVisible` למודל — `translateY` (לא scroll)

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
      const baseShift = theme.spacing.xl; // הזזה קטנה תמיד כשהמקלדת פתוחה
      setModalShift(overflow > 0 ? overflow : baseShift);
    });
  },
  [keyboardHeight, windowH],
);
```

- `overflow > 0` → הזזה לפי חפיפה (מינימום נדרש)
- אחרת → `baseShift` — המודל עולה **טיפה** ברגע פתיחת מקלדת

### focus + retry (זהה לטופס)

```typescript
const onModalInputFocus = useCallback(
  (key: string) => {
    focusedInputKeyRef.current = key;
    ensureInputVisible(key);
  },
  [ensureInputVisible],
);

useEffect(() => {
  if (keyboardHeight <= 0 || !focusedInputKeyRef.current) return undefined;
  const key = focusedInputKeyRef.current;
  const t = setTimeout(() => ensureInputVisible(key), 60);
  return () => clearTimeout(t);
}, [keyboardHeight, ensureInputVisible]);

// איפוס בסגירת מודל / מקלדת
useEffect(() => {
  if (!modalVisible) {
    focusedInputKeyRef.current = null;
    setModalShift(0);
  }
}, [modalVisible]);

useEffect(() => {
  if (keyboardHeight <= 0) setModalShift(0);
}, [keyboardHeight]);
```

### JSX — מבנה המודל

```tsx
<Modal visible transparent animationType="fade">
  <View style={styles.modalRoot}>
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable
        style={[
          styles.modalCard,
          modalShift > 0 && { transform: [{ translateY: -modalShift }] },
        ]}
        onPress={(e) => e.stopPropagation()}
      >
        {/* תוכן ישיר — בלי ScrollView */}
        <TextInput
          ref={(node) => { /* inputRefs map */ }}
          onFocus={() => onModalInputFocus("edit:title")}
          textAlign="right"
        />
      </Pressable>
    </Pressable>
  </View>
</Modal>
```

### סגנונות חובה ל-`modalCard`

```typescript
modalRoot: { flex: 1 },
backdrop: {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: theme.spacing.lg,
},
modalCard: {
  width: "100%",
  maxWidth: 420,
  alignSelf: "center",
  flexShrink: 1, // לא נמתח
  // padding, radius, shadow...
},
```

### צ'קליסט — מודל

- [ ] **בלי** `KeyboardAvoidingView`
- [ ] **בלי** `ScrollView` עוטף (אלא אם תוכן ארוך מאוד + `maxHeight`)
- [ ] `modalShift` + `translateY: -modalShift` על `modalCard`
- [ ] `baseShift` + `overflow` ב-`ensureInputVisible`
- [ ] `inputRefs` + `onModalInputFocus` + `useEffect` 60ms
- [ ] איפוס `modalShift` בסגירה
- [ ] `flexShrink: 1` + `alignSelf: "center"` על הכרטיס

### בדיקה — מודל

1. מקלדת נפתחת → המודל עולה **טיפה** (`baseShift`)
2. שדה תחתון מוסתר → עולה יותר (`overflow`)
3. שדה עליון → רק `baseShift`, לא קפיצה גדולה
4. סגירת מודל / מקלדת → חוזר למרכז (`modalShift = 0`)
5. המודל **לא** נמתח — גובה קבוע לפי תוכן
