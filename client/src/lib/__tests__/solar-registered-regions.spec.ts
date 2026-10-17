import { expect, it } from "vitest";
import { isRegisteredSolarRegionsReceipt } from "../solar-registered-regions";

const hash = "a".repeat(64);
const reportHash = "b".repeat(64);
const headerHash = "c".repeat(64);
const receipt = {
  schemaVersion: "solar-registered-active-regions/1",
  image: {
    schemaVersion: "solar-live-preview/2", channel: "hmiContinuum", sourceId: "helioviewer-hmi",
    source: "Helioviewer / NASA SDO HMI", instrument: "HMI", productKind: "browse_image",
    upstreamImageId: "12345", sourceUrl: "https://api.helioviewer.org/v2/downloadImage/?id=12345&width=512&type=jpg",
    imageUrl: `/api/star-watcher/live-preview/image?channel=hmiContinuum&source=helioviewer-hmi&sha256=${hash}`,
    sha256: hash, observationAt: "2026-10-10T12:00:00.000Z", widthPx: 512, heightPx: 512,
    stale: false,
    scienceRunAllowed: false, quantitativeComparisonAllowed: false,
  },
  report: {
    sourceUrl: "https://services.swpc.noaa.gov/text/srs.txt", sourceSha256: reportHash,
    issuedAt: "2026-10-10T00:30:00.000Z", validAt: "2026-10-10T00:00:00.000Z", fetchedAt: "2026-10-10T13:00:00.000Z",
  },
  wcs: {
    headerUrl: "https://api.helioviewer.org/v2/getJP2Header/?id=12345", headerSha256: headerHash,
    headerObservationAt: "2026-10-10T12:00:00.000Z", nativeWidthPx: 4096, nativeHeightPx: 4096,
    qualityFlag: 0, qualityInterpretation: "numeric_flag_only_not_science_admission",
  },
  registration: {
    method: "noaa_srs_carrington_hpc_tan", rotationAssumption: "fixed_carrington_longitude",
    timeDeltaSeconds: 43200, maxAbsTimeDeltaSeconds: 129600,
    positionSemantics: "approximate_report_location_not_spot_centroid", pixelOrigin: "top_left",
    scienceRunAllowed: false, quantitativeComparisonAllowed: false,
  },
  regions: [{ noaaNumber: 4545, latitudeDeg: 18, centralMeridianDistanceDeg: 46,
    carringtonLongitudeDeg: 222, location: "N18W46", spotCount: 5,
    spotClass: "Cao", magneticClass: "Beta", areaMillionths: 70, category: "sunspot",
    visible: true, xPx: 300, yPx: 200, omissionReason: null }],
};

it("accepts only an exact image-bound HMI registration with coherent times and pixels", () => {
  expect(isRegisteredSolarRegionsReceipt(receipt, "hmiContinuum")).toBe(true);
  expect(isRegisteredSolarRegionsReceipt(receipt, "hmiMag")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, image: { ...receipt.image, sourceId: "sdo" } }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, image: { ...receipt.image, imageUrl: "/other.jpg" } }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, image: { ...receipt.image, upstreamImageId: "12346" } }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, image: { ...receipt.image, stale: "unknown" } }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, report: { ...receipt.report, sourceSha256: "wrong" } }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, registration: { ...receipt.registration, timeDeltaSeconds: 0 } }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, regions: [{ ...receipt.regions[0], xPx: 600 }] }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, regions: [{ ...receipt.regions[0], visible: false }] }, "hmiContinuum")).toBe(false);
  expect(isRegisteredSolarRegionsReceipt({ ...receipt, regions: [{ ...receipt.regions[0], latitudeDeg: Number.NaN }] }, "hmiContinuum")).toBe(false);
});
