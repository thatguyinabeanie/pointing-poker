// Header and Layout both need this. It lives outside the component files so those files export
// only components (biome useComponentExportOnlyModules, and Fast Refresh).
// Layout reserves this much vertical space for the header, so the two must agree.
export const HEADER_HEIGHT = 48;
