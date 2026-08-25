import {
  Application,
  Color,
  Icon,
  Keyboard,
  MenuBarExtra,
  getApplications,
  getPreferenceValues,
  open,
  openCommandPreferences,
} from "@raycast/api";
import { useCachedPromise } from "@raycast/utils";
import { AccessibilityError, DockTile, readDockTiles, readSystemDarkMode } from "./dock";

interface Preferences {
  symbol: "bell" | "app";
  symbolStyle: "outline" | "filled";
  showCount: boolean;
  hideWhenClear: boolean;
}

interface DockApp {
  tile: DockTile;
  application?: Application;
}

// Built-in icons in the dropdown are tinted against Raycast's app theme rather than the menu's
// appearance, so tint them explicitly for the system Light/Dark appearance the menu actually uses.
const menuIcon = (source: Icon, darkMode: boolean) => ({ source, tintColor: darkMode ? "#FFFFFF" : "#1D1D1F" });

const ACCESSIBILITY_SETTINGS = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

// Dock tiles that are never applications.
const NON_APP_TILES = new Set(["Downloads", "Trash", "Applications", "Documents"]);

/** Asset for the menu bar icon: icons/{bell,app}[-badge][-fill].svg, tinted at render time. */
function iconAsset({ symbol = "bell", symbolStyle = "filled" }: Preferences, badged: boolean): string {
  return `icons/${symbol}${badged ? "-badge" : ""}${symbolStyle === "filled" ? "-fill" : ""}.svg`;
}

function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function resolveApps(tiles: DockTile[], applications: Application[]): DockApp[] {
  return tiles
    .filter((tile) => !NON_APP_TILES.has(tile.name))
    .map((tile) => ({ tile, application: applications.find((a) => sameName(a.name, tile.name)) }));
}

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();

  const { data, isLoading, error, revalidate } = useCachedPromise(readDockTiles, [], {
    keepPreviousData: true,
  });
  const { data: applications } = useCachedPromise(getApplications, [], { keepPreviousData: true });
  const { data: darkMode = false } = useCachedPromise(readSystemDarkMode, [], { keepPreviousData: true });

  const badged = resolveApps(data ?? [], applications ?? []).filter((app) => app.tile.count > 0);
  const total = badged.reduce((sum, app) => sum + app.tile.count, 0);
  const hasBadges = total > 0;

  if (preferences.hideWhenClear && data && !error && !hasBadges) {
    return null;
  }

  const accessibilityDenied = error instanceof AccessibilityError;
  // Tinting with PrimaryText makes the glyph follow the menu bar's foreground colour (including
  // wallpaper-based tinting) like a native template image.
  const icon = error
    ? { source: Icon.ExclamationMark, tintColor: Color.Orange }
    : { source: iconAsset(preferences, hasBadges), tintColor: Color.PrimaryText };

  const summary = badged.map((app) => `${app.tile.name} ${app.tile.badge}`).join(" · ");

  return (
    <MenuBarExtra
      icon={icon}
      title={preferences.showCount && hasBadges ? String(total) : undefined}
      tooltip={error ? "Unable to read Dock badges" : summary || "No notifications"}
      isLoading={isLoading}
    >
      {accessibilityDenied ? (
        <MenuBarExtra.Section title="Accessibility permission required">
          <MenuBarExtra.Item
            title="Allow Raycast in Privacy & Security → Accessibility"
            icon={menuIcon(Icon.Lock, darkMode)}
            onAction={() => open(ACCESSIBILITY_SETTINGS)}
          />
        </MenuBarExtra.Section>
      ) : error ? (
        <MenuBarExtra.Section title="Error">
          <MenuBarExtra.Item title={error.message} icon={menuIcon(Icon.ExclamationMark, darkMode)} />
        </MenuBarExtra.Section>
      ) : (
        <MenuBarExtra.Section title={hasBadges ? `${total} notification${total === 1 ? "" : "s"}` : "No notifications"}>
          {badged.map((app) => (
            <AppItem key={app.tile.name} app={app} darkMode={darkMode} />
          ))}
        </MenuBarExtra.Section>
      )}
      <MenuBarExtra.Section>
        <MenuBarExtra.Item
          title="Refresh"
          icon={menuIcon(Icon.ArrowClockwise, darkMode)}
          shortcut={Keyboard.Shortcut.Common.Refresh}
          onAction={revalidate}
        />
        <MenuBarExtra.Item
          title="Preferences…"
          icon={menuIcon(Icon.Gear, darkMode)}
          onAction={openCommandPreferences}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}

function AppItem({ app, darkMode }: { app: DockApp; darkMode: boolean }) {
  const { tile, application } = app;
  return (
    <MenuBarExtra.Item
      title={tile.name}
      subtitle={tile.badge}
      icon={application ? { fileIcon: application.path } : menuIcon(Icon.AppWindow, darkMode)}
      onAction={() => open(application?.path ?? `/Applications/${tile.name}.app`)}
    />
  );
}
