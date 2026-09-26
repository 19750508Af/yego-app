// Local replacement for the SDK's SafeAreaTopScrim: reserves the OS
// status-bar / notch area so the app header never hides behind it.
export function SafeAreaTopScrim({ backgroundColor }: { backgroundColor?: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: "env(safe-area-inset-top, 0px)",
        background: backgroundColor ?? "transparent",
        flexShrink: 0,
      }}
    />
  );
}
