import { useEffect, useState } from "react";
import {
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Platform,
  type KeyboardEvent,
} from "react-native";

export interface KeyboardFrame {
  /** גובה ל-padding (iOS: height, Android: overlap). */
  height: number;
  /** קו עליון המקלדת בקואורדinates מוחלטות של החלון — null כשסגורה. */
  screenY: number | null;
}

/**
 * מחזיר גובה מקלדת + `screenY` ל-positioning מדויק (חשוב ב-Android מתחת ל-header).
 */
export function useKeyboardFrame(): KeyboardFrame {
  const [frame, setFrame] = useState<KeyboardFrame>({ height: 0, screenY: null });

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent): void => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      const { height, screenY } = e.endCoordinates;
      const windowH = Dimensions.get("window").height;
      const overlap = Math.max(0, windowH - screenY);
      setFrame({
        height: Platform.OS === "android" ? overlap : height,
        screenY,
      });
    };

    const onHide = (): void => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setFrame({ height: 0, screenY: null });
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return frame;
}

/**
 * מחזיר את גובה המקלדת בפיקסלים (0 כשסגורה).
 * iOS: `keyboardWillShow`/`keyboardWillHide` לאנימציה חלקה.
 * Android: `keyboardDidShow`/`keyboardDidHide`.
 */
export function useKeyboardHeight(): number {
  return useKeyboardFrame().height;
}
