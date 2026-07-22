// 4-tier content-visibility (Komoot-model, profile-optimization plan).
// Lattice wordt afgedwongen in de DB (can_view_content): close friends
// zien ook followers-tier; iedereen ziet public; owner/admin alles.
export type Visibility = "private" | "close_friends" | "followers" | "public";

export const VISIBILITIES: Visibility[] = [
  "private",
  "close_friends",
  "followers",
  "public",
];

export const VISIBILITY_ICON: Record<Visibility, string> = {
  private: "🔒",
  close_friends: "🤝",
  followers: "👥",
  public: "🌐",
};
