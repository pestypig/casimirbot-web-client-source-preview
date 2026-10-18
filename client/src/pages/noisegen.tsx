// Alias route for Helix Core • Noise Gens, reusing helix-noise-gens assembly.
import { useEffect } from "react";
import HelixNoiseGensPage from "./helix-noise-gens";

const TITLE = "Helix Core • Noise Gens";
const DESCRIPTION =
  "Upload artist-verified stems, generate Helix remixes, and explore community-ranked covers.";

export default function NoiseGenAlias() {
  useEffect(() => {
    document.title = TITLE;

    const metaDescription =
      document.querySelector<HTMLMetaElement>('meta[name="description"]') ??
      (() => {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "description");
        document.head.appendChild(meta);
        return meta;
      })();

    const previousDescription = metaDescription.getAttribute("content");
    metaDescription.setAttribute("content", DESCRIPTION);

    return () => {
      if (previousDescription !== null) {
        metaDescription.setAttribute("content", previousDescription);
      }
    };
  }, []);

  return <HelixNoiseGensPage />;
}

