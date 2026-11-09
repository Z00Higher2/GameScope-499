/*
 * Steam image URLs to try in order, for <img onError> fallbacks.
 */
export function getSteamImageSources(
  appId: string,
  preferredImage?: string | null
): string[] {
  const sources = [
    preferredImage,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/capsule_616x353.jpg`,
  ];

  return [
    ...new Set(
      sources.filter(
        (source): source is string =>
          typeof source === "string" && source.trim().length > 0
      )
    ),
  ];
}

/*
 * Portrait cover art (600x900) first, then the landscape fallbacks.
 */
export function getSteamPortraitSources(appId: string): string[] {
  return [
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`,
    `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    ...getSteamImageSources(appId),
  ];
}
