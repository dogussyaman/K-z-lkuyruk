interface BackNavigation<T> {
  canGoBack: () => boolean;
  back: () => void;
  replace: (destination: T) => void;
}

export function goBackOrReplace<T>(navigation: BackNavigation<T>, fallback: T): void {
  if (navigation.canGoBack()) navigation.back();
  else navigation.replace(fallback);
}
