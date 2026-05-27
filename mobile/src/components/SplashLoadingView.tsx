import { Image, StyleSheet, View } from "react-native";

const SPLASH_BACKGROUND = "#3d2817";

/** Full-screen splash image shown while app config / fonts are loading. */
export function SplashLoadingView(): JSX.Element {
  return (
    <View style={styles.root}>
      <Image source={require("../../assets/splash.png")} style={styles.image} resizeMode="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
  },
  image: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
});
