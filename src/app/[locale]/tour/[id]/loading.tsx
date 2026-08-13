// Loading-skeleton voor de tour-detailpagina. De server-component wacht op
// weer + gerelateerde routes + highlights; zonder deze fallback bleef het
// scherm leeg tot dat klaar was. Nu meteen feedback: grijze kaart-achtergrond
// + een pulserend paneel-skelet op dezelfde plek als het echte info-paneel
// (links op desktop, bottom-sheet op mobiel).
export default function Loading() {
  return (
    <main className="relative h-dvh w-full bg-neutral-100">
      <div className="absolute flex flex-col gap-3 rounded-2xl bg-white/95 p-4 shadow-xl max-md:inset-x-2 max-md:bottom-2 md:left-4 md:top-16 md:w-[340px]">
        <div className="animate-pulse space-y-3">
          <div className="h-3 w-1/3 rounded bg-neutral-200" />
          <div className="h-6 w-2/3 rounded bg-neutral-200" />
          <div className="flex gap-4 pt-1">
            <div className="h-9 w-14 rounded bg-neutral-200" />
            <div className="h-9 w-14 rounded bg-neutral-200" />
            <div className="h-9 w-14 rounded bg-neutral-200" />
            <div className="h-9 w-14 rounded bg-neutral-200" />
          </div>
          <div className="h-24 w-full rounded bg-neutral-200" />
          <div className="flex gap-2">
            <div className="h-8 w-20 rounded-lg bg-neutral-200" />
            <div className="h-8 w-28 rounded-lg bg-neutral-200" />
            <div className="h-8 w-16 rounded-lg bg-neutral-200" />
          </div>
        </div>
      </div>
    </main>
  );
}
