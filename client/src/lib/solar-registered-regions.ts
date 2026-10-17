export type RegisteredSolarChannel = "hmiContinuum" | "hmiMag";

export type RegisteredSolarRegionsReceipt = {
  schemaVersion: "solar-registered-active-regions/1";
  image: {
    channel: RegisteredSolarChannel;
    sourceId: "helioviewer-hmi" | "helioviewer-hmi-mag";
    source: "Helioviewer / NASA SDO HMI";
    instrument: "HMI";
    sourceUrl: string;
    imageUrl: string;
    sha256: string;
    observationAt: string;
    upstreamImageId: string;
    widthPx: 512;
    heightPx: 512;
    stale: boolean;
    productKind: "browse_image";
    scienceRunAllowed: false;
    quantitativeComparisonAllowed: false;
  };
  report: {
    sourceUrl: "https://services.swpc.noaa.gov/text/srs.txt";
    sourceSha256: string;
    issuedAt: string;
    validAt: string;
    fetchedAt: string;
  };
  wcs: {
    headerUrl: string;
    headerSha256: string;
    headerObservationAt: string;
    nativeWidthPx: 4096;
    nativeHeightPx: 4096;
    qualityFlag: number;
    qualityInterpretation: "numeric_flag_only_not_science_admission";
  };
  registration: {
    method: "noaa_srs_carrington_hpc_tan";
    rotationAssumption: "fixed_carrington_longitude";
    timeDeltaSeconds: number;
    maxAbsTimeDeltaSeconds: 129600;
    positionSemantics: "approximate_report_location_not_spot_centroid";
    pixelOrigin: "top_left";
    scienceRunAllowed: false;
    quantitativeComparisonAllowed: false;
  };
  regions: Array<{
    noaaNumber: number;
    latitudeDeg: number;
    centralMeridianDistanceDeg: number;
    carringtonLongitudeDeg: number;
    location: string;
    spotCount: number | null;
    spotClass: string | null;
    magneticClass: string | null;
    areaMillionths: number | null;
    category: "sunspot" | "plage";
    visible: boolean;
    xPx: number | null;
    yPx: number | null;
    omissionReason: "outside_visible_disk_or_image" | null;
  }>;
};

const HASH = /^[a-f0-9]{64}$/;
const IMAGE_ID = /^[1-9]\d{0,15}$/;
const NOAA_REPORT_URL = "https://services.swpc.noaa.gov/text/srs.txt";
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isDate = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const isHash = (value: unknown): value is string => typeof value === "string" && HASH.test(value);
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

export function isRegisteredSolarRegionsReceipt(value: unknown, channel: RegisteredSolarChannel): value is RegisteredSolarRegionsReceipt {
  if (!isRecord(value) || value.schemaVersion !== "solar-registered-active-regions/1" ||
      !isRecord(value.image) || !isRecord(value.report) || !isRecord(value.wcs) ||
      !isRecord(value.registration) || !Array.isArray(value.regions)) return false;
  const { image, report, wcs, registration, regions } = value;
  const sourceId = channel === "hmiContinuum" ? "helioviewer-hmi" : "helioviewer-hmi-mag";
  if (image.channel !== channel || image.sourceId !== sourceId ||
      image.source !== "Helioviewer / NASA SDO HMI" || image.instrument !== "HMI" ||
      image.productKind !== "browse_image" ||
      image.scienceRunAllowed !== false || image.quantitativeComparisonAllowed !== false ||
      typeof image.upstreamImageId !== "string" || !IMAGE_ID.test(image.upstreamImageId) ||
      image.sourceUrl !== `https://api.helioviewer.org/v2/downloadImage/?id=${image.upstreamImageId}&width=512&type=jpg` ||
      !isHash(image.sha256) ||
      image.imageUrl !== `/api/star-watcher/live-preview/image?channel=${channel}&source=${sourceId}&sha256=${image.sha256}` ||
      !isDate(image.observationAt) || image.widthPx !== 512 || image.heightPx !== 512 ||
      typeof image.stale !== "boolean") return false;
  if (report.sourceUrl !== NOAA_REPORT_URL || !isHash(report.sourceSha256) ||
      !isDate(report.issuedAt) || !isDate(report.validAt) || !isDate(report.fetchedAt)) return false;
  if (wcs.headerUrl !== `https://api.helioviewer.org/v2/getJP2Header/?id=${image.upstreamImageId}` ||
      !isHash(wcs.headerSha256) || !isDate(wcs.headerObservationAt) ||
      wcs.nativeWidthPx !== 4096 || wcs.nativeHeightPx !== 4096 ||
      !Number.isSafeInteger(wcs.qualityFlag) || Number(wcs.qualityFlag) < 0 ||
      wcs.qualityInterpretation !== "numeric_flag_only_not_science_admission") return false;
  if (Math.abs(Date.parse(image.observationAt) - Date.parse(wcs.headerObservationAt)) > 2_000 ||
      registration.method !== "noaa_srs_carrington_hpc_tan" ||
      registration.rotationAssumption !== "fixed_carrington_longitude" ||
      registration.positionSemantics !== "approximate_report_location_not_spot_centroid" ||
      registration.pixelOrigin !== "top_left" ||
      registration.scienceRunAllowed !== false || registration.quantitativeComparisonAllowed !== false ||
      registration.maxAbsTimeDeltaSeconds !== 129600 ||
      typeof registration.timeDeltaSeconds !== "number" || !Number.isFinite(registration.timeDeltaSeconds) ||
      Math.abs(registration.timeDeltaSeconds) > 129600 ||
      Math.abs(registration.timeDeltaSeconds - (Date.parse(image.observationAt) - Date.parse(report.validAt)) / 1_000) > 1) return false;
  const seen = new Set<number>();
  return regions.length <= 256 && regions.every((item: unknown) => {
    if (!isRecord(item) || !Number.isSafeInteger(item.noaaNumber) || Number(item.noaaNumber) <= 0 ||
        seen.has(Number(item.noaaNumber))) return false;
    seen.add(Number(item.noaaNumber));
    if (typeof item.latitudeDeg !== "number" || !Number.isFinite(item.latitudeDeg) || Math.abs(item.latitudeDeg) > 90 ||
        typeof item.centralMeridianDistanceDeg !== "number" || !Number.isFinite(item.centralMeridianDistanceDeg) || Math.abs(item.centralMeridianDistanceDeg) > 180 ||
        typeof item.carringtonLongitudeDeg !== "number" || !Number.isFinite(item.carringtonLongitudeDeg) || item.carringtonLongitudeDeg < 0 || item.carringtonLongitudeDeg > 360 ||
        typeof item.location !== "string" || !/^[NS]\d{1,2}[EW]\d{1,3}$/.test(item.location) ||
        (item.category !== "sunspot" && item.category !== "plage") ||
        (item.spotCount !== null && (!Number.isSafeInteger(item.spotCount) || Number(item.spotCount) < 0)) ||
        (item.areaMillionths !== null && (typeof item.areaMillionths !== "number" || !Number.isFinite(item.areaMillionths) || item.areaMillionths < 0)) ||
        !isNullableString(item.spotClass) || !isNullableString(item.magneticClass) ||
        typeof item.visible !== "boolean") return false;
    return item.visible ?
      typeof item.xPx === "number" && Number.isFinite(item.xPx) && item.xPx >= 0 && item.xPx < 512 &&
      typeof item.yPx === "number" && Number.isFinite(item.yPx) && item.yPx >= 0 && item.yPx < 512 &&
      item.omissionReason === null :
      item.xPx === null && item.yPx === null && item.omissionReason === "outside_visible_disk_or_image";
  });
}
