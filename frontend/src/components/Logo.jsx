import logo from "../assets/logo.png";

const SIZE_CLASSES = {
  sm: "h-12 w-12",
  md: "h-16 w-16",
  lg: "h-24 w-24",
};

/**
 * Shared app logo/icon. Use everywhere the ELARA "brand mark" would appear
 * in a commercial product: auth screens, dashboard navigation, browser tab
 * (favicon, wired separately in index.html), etc. Keeping this as a single
 * component means the icon can be swapped/updated in one place.
 */
export default function Logo({ size = "md", className = "" }) {
  return (
    <img
      src={logo}
      alt="ELARA logo"
      className={`${SIZE_CLASSES[size] || SIZE_CLASSES.md} rounded-xl object-contain drop-shadow-neon-glow ${className}`}
    />
  );
}
