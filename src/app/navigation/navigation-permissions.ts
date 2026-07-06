import type { NavigationItem } from "./navigation-items";

export interface NavigationProfile {
  role?: string | null;
}

export function canViewNavigationItem(
  item: NavigationItem,
  profile: NavigationProfile | null | undefined,
): boolean {
  if (!item.managerOnly) return true;
  return profile?.role === "admin" || profile?.role === "manager";
}
