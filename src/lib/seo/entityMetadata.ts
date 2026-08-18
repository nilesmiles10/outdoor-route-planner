import type { Metadata } from "next";
import { getSiteSettings, pageTitle } from "@/lib/siteSettings";

// Gedeelde metadata-opbouw voor entiteitspagina's (trail, trail-regio,
// collectie, tour, highlight, …).
//
// Waarom: canonical, OG en Twitter werden per route met de hand samengesteld.
// Dat werkte, maar elke nieuwe route moest het patroon opnieuw goed raden — en
// twee routes hadden hun canonical simpelweg niet (zie SEO_AUDIT.md P1-1). De
// canonical-invariant vangt het ontbreken nu al; deze helper zorgt dat de
// vórm ook overal dezelfde is.
//
// Bewust géén gedragsverandering: de helper produceert exact wat de routes al
// uitstuurden. Dat is met een voor/na-diff op de geleverde HTML gecontroleerd.

export type EntityMetadataInput = {
  locale: string;
  /** Pad ná de locale, zonder leidende slash — bv. `trail/${id}`. */
  path: string;
  /** Onbewerkte paginatitel; wordt door pageTitle() met de sitenaam gecombineerd. */
  title: string;
  /**
   * Sitenaam achter de titel plakken. Standaard aan. Uit voor tour- en
   * collectiepagina's: die dragen hun eigen samengestelde titel
   * ("Naam | 21,5 km Fietsen") en kregen historisch géén merk-suffix. Zet je
   * dit aan, dan verandert de <title> van bestaande, geïndexeerde pagina's —
   * vandaar dat het expliciet per route wordt gekozen.
   */
  brand?: boolean;
  description?: string;
  /** Titel voor OG/Twitter als die van de <title> afwijkt (vaak korter). */
  socialTitle?: string;
  /**
   * Omschrijving voor OG/Twitter als die van de meta-description afwijkt. De
   * tourpagina hangt bv. de auteur-byline alléén aan de meta-description, niet
   * aan de share-kaart.
   */
  socialDescription?: string;
  /** summary_large_image i.p.v. de standaard summary-kaart. */
  largeImage?: boolean;
  /** Doorgegeven aan Next; bv. de thin-content-noindex van lege collecties. */
  robots?: Metadata["robots"];
  /**
   * OG-afbeelding meegeven. Nodig zodra je openGraph zet zónder eigen
   * opengraph-image-route: door openGraph te zetten vervalt de geërfde
   * site-afbeelding, dus die moet je expliciet terugverwijzen.
   */
  ogImage?: string;
};

export async function entityMetadata({
  locale,
  path,
  title,
  description,
  socialTitle,
  socialDescription,
  largeImage,
  ogImage,
  brand = true,
  robots,
}: EntityMetadataInput): Promise<Metadata> {
  const social = socialTitle ?? title;
  const socialDesc = socialDescription ?? description;
  return {
    title: brand ? pageTitle(await getSiteSettings(), title) : title,
    ...(robots ? { robots } : {}),
    description,
    // Self-canonical: consolideert tracking-varianten (?utm, ?fbclid) naar de
    // schone URL.
    alternates: { canonical: `/${locale}/${path}` },
    openGraph: {
      title: social,
      description: socialDesc,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      ...(largeImage ? { card: "summary_large_image" as const } : {}),
      title: social,
      description: socialDesc,
    },
  };
}

/** Titel voor een entiteit die niet (meer) bestaat. */
export async function notFoundMetadata(t: (k: string) => string): Promise<Metadata> {
  return { title: t("title") };
}
