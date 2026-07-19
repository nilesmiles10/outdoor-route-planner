import { useTranslations } from "next-intl";
import MapView from "@/components/MapView";

export default function Home() {
  const t = useTranslations("app");

  return (
    <main className="relative h-dvh w-full">
      <MapView />
      <div className="absolute left-4 top-4 rounded-xl bg-white/90 px-4 py-2 shadow-md backdrop-blur">
        <h1 className="text-lg font-semibold text-neutral-900">{t("title")}</h1>
        <p className="text-sm text-neutral-600">{t("tagline")}</p>
      </div>
    </main>
  );
}
