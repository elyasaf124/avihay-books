import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform, type KeyboardEvent } from "react-native";

/**
 * מחזיר את גובה המקלדת בפיקסלים (0 כשסגורה).
 * iOS: `keyboardWillShow`/`keyboardWillHide` לאנימציה חלקה.
 * Android: `keyboardDidShow`/`keyboardDidHide`.
 */
export function useKeyboardHeight(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (e: KeyboardEvent): void => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(e.endCoordinates.height);
    };

    const onHide = (): void => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setKeyboardHeight(0);
    };

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return keyboardHeight;
}
