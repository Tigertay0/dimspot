import type { ServiceType } from "@/lib/types";

/**
 * Every provider the report form and the filter menu offer.
 *
 * One list, used three ways: the local (no database) store serves it directly,
 * db/migrations/0007_more_providers.sql seeds the same rows into Postgres
 * (lib/__tests__/provider-catalog.test.ts fails if the two drift), and the
 * ingest adapters attribute feed rows to these slugs.
 *
 * `regions` is where a provider operates, as two-letter state codes (plus DC
 * and PR). The report form uses it to put the companies that serve the pin
 * first: someone in Bethesda sees Pepco, not a list that starts with Alabama
 * Power. Empty means nationwide, or not worth narrowing.
 *
 * Slugs are identities. They are stored on user preferences and joined to
 * outages, so a slug is never renamed or reused; add a new row instead.
 */
export interface CatalogProvider {
  slug: string;
  name: string;
  serviceType: ServiceType;
  regions: string[];
}

type Row = [slug: string, name: string, regions?: string];

function rows(serviceType: ServiceType, list: Row[]): CatalogProvider[] {
  return list.map(([slug, name, regions]) => ({
    slug,
    name,
    serviceType,
    regions: regions ? regions.split(" ") : [],
  }));
}

const POWER: Row[] = [
  // Mid-Atlantic
  ["pepco", "Pepco", "DC MD"],
  ["bge", "BGE", "MD"],
  ["delmarva", "Delmarva Power", "DE MD"],
  ["potomac-edison", "Potomac Edison", "MD WV"],
  ["smeco", "SMECO", "MD"],
  ["dominion", "Dominion Energy", "VA NC SC"],
  ["novec", "NOVEC", "VA"],
  ["rappahannock", "Rappahannock Electric Cooperative", "VA"],
  ["appalachian-power", "Appalachian Power", "VA WV TN"],
  ["mon-power", "Mon Power", "WV"],
  ["atlantic-city-electric", "Atlantic City Electric", "NJ"],
  ["pseg", "PSE&G", "NJ"],
  ["jcpl", "JCP&L", "NJ"],
  ["peco", "PECO", "PA"],
  ["ppl", "PPL Electric", "PA"],
  ["duquesne", "Duquesne Light", "PA"],
  ["met-ed", "Met-Ed", "PA"],
  ["penelec", "Penelec", "PA"],
  ["penn-power", "Penn Power", "PA"],
  ["west-penn-power", "West Penn Power", "PA"],

  // New York and New England
  ["coned", "Con Edison", "NY"],
  ["orange-rockland", "Orange & Rockland", "NY NJ"],
  ["pseg-li", "PSEG Long Island", "NY"],
  ["national-grid", "National Grid", "NY MA"],
  ["nyseg", "NYSEG", "NY"],
  ["rge", "RG&E", "NY"],
  ["central-hudson", "Central Hudson", "NY"],
  ["eversource", "Eversource", "CT MA NH"],
  ["united-illuminating", "United Illuminating", "CT"],
  ["rhode-island-energy", "Rhode Island Energy", "RI"],
  ["central-maine-power", "Central Maine Power", "ME"],
  ["versant", "Versant Power", "ME"],
  ["green-mountain-power", "Green Mountain Power", "VT"],
  ["unitil", "Unitil", "NH MA"],

  // Southeast
  ["duke", "Duke Energy", "NC SC FL IN OH KY"],
  ["santee-cooper", "Santee Cooper", "SC"],
  ["georgia-power", "Georgia Power", "GA"],
  ["cobb-emc", "Cobb EMC", "GA"],
  ["jackson-emc", "Jackson EMC", "GA"],
  ["alabama-power", "Alabama Power", "AL"],
  ["huntsville-utilities", "Huntsville Utilities", "AL"],
  ["mississippi-power", "Mississippi Power", "MS"],
  ["fpl", "Florida Power & Light", "FL"],
  ["teco", "Tampa Electric", "FL"],
  ["jea", "JEA", "FL"],
  ["ouc", "OUC", "FL"],
  ["nes", "Nashville Electric Service", "TN"],
  ["mlgw", "Memphis Light, Gas and Water", "TN"],
  ["kub", "Knoxville Utilities Board", "TN"],
  ["epb", "EPB", "TN"],
  ["lge-ku", "LG&E and KU", "KY VA"],
  ["kentucky-power", "Kentucky Power", "KY"],
  ["entergy", "Entergy", "AR LA MS TX"],
  ["cleco", "Cleco", "LA"],
  ["luma", "LUMA Energy", "PR"],

  // Midwest
  ["comed", "ComEd", "IL"],
  ["ameren", "Ameren", "IL MO"],
  ["midamerican", "MidAmerican Energy", "IA IL SD"],
  ["alliant", "Alliant Energy", "IA WI"],
  ["dte", "DTE Energy", "MI"],
  ["consumers-energy", "Consumers Energy", "MI"],
  ["indiana-michigan-power", "Indiana Michigan Power", "IN MI"],
  ["aes-indiana", "AES Indiana", "IN"],
  ["aes-ohio", "AES Ohio", "OH"],
  ["aep-ohio", "AEP Ohio", "OH"],
  ["ohio-edison", "Ohio Edison", "OH"],
  ["illuminating-company", "The Illuminating Company", "OH"],
  ["toledo-edison", "Toledo Edison", "OH"],
  ["we-energies", "We Energies", "WI"],
  ["wps", "Wisconsin Public Service", "WI"],
  ["mge", "Madison Gas and Electric", "WI"],
  ["xcel", "Xcel Energy", "MN CO WI TX NM ND SD MI"],
  ["minnesota-power", "Minnesota Power", "MN"],
  ["otter-tail", "Otter Tail Power", "MN ND SD"],
  ["evergy", "Evergy", "KS MO"],
  ["oppd", "Omaha Public Power District", "NE"],
  ["nppd", "Nebraska Public Power District", "NE"],
  ["les", "Lincoln Electric System", "NE"],
  ["black-hills", "Black Hills Energy", "SD WY CO"],

  // Texas and the South-central states
  ["oncor", "Oncor", "TX"],
  ["centerpoint", "CenterPoint Energy", "TX IN"],
  ["aep-texas", "AEP Texas", "TX"],
  ["tnmp", "TNMP", "TX"],
  ["austin-energy", "Austin Energy", "TX"],
  ["cps-energy", "CPS Energy", "TX"],
  ["pedernales", "Pedernales Electric Cooperative", "TX"],
  ["el-paso-electric", "El Paso Electric", "TX NM"],
  ["oge", "OG&E", "OK AR"],
  ["pso", "PSO", "OK"],
  ["swepco", "SWEPCO", "AR LA TX"],

  // Mountain and Southwest
  ["aps", "APS", "AZ"],
  ["srp", "SRP", "AZ"],
  ["tep", "Tucson Electric Power", "AZ"],
  ["pnm", "PNM", "NM"],
  ["nv-energy", "NV Energy", "NV"],
  ["rocky-mountain-power", "Rocky Mountain Power", "UT WY ID"],
  ["idaho-power", "Idaho Power", "ID OR"],
  ["northwestern", "NorthWestern Energy", "MT SD"],

  // West coast, Alaska and Hawaii
  ["pge", "PG&E", "CA"],
  ["sce", "Southern California Edison", "CA"],
  ["sdge", "SDG&E", "CA"],
  ["ladwp", "LADWP", "CA"],
  ["smud", "SMUD", "CA"],
  ["pacific-power", "Pacific Power", "OR WA CA"],
  ["portland-general", "Portland General Electric", "OR"],
  ["pse", "Puget Sound Energy", "WA"],
  ["seattle-city-light", "Seattle City Light", "WA"],
  ["snohomish-pud", "Snohomish County PUD", "WA"],
  ["tacoma-power", "Tacoma Power", "WA"],
  ["avista", "Avista", "WA ID"],
  ["heco", "Hawaiian Electric", "HI"],
  ["chugach", "Chugach Electric", "AK"],

  // The fallback for a municipal utility or co-op that is not listed.
  ["local-power", "Local power company"],
];

const INTERNET: Row[] = [
  ["xfinity", "Comcast / Xfinity"],
  ["spectrum", "Spectrum"],
  ["att-internet", "AT&T Internet"],
  ["fios", "Verizon Fios", "NY NJ PA DE MD DC VA MA RI"],
  ["cox", "Cox"],
  ["optimum", "Optimum", "NY NJ CT"],
  ["centurylink", "CenturyLink"],
  ["quantum-fiber", "Quantum Fiber"],
  ["frontier", "Frontier"],
  ["google-fiber", "Google Fiber"],
  ["mediacom", "Mediacom"],
  ["astound", "Astound (RCN, Wave, Grande)"],
  ["wow", "WOW!"],
  ["breezeline", "Breezeline"],
  ["sparklight", "Sparklight"],
  ["kinetic", "Kinetic by Windstream"],
  ["brightspeed", "Brightspeed"],
  ["ziply", "Ziply Fiber", "WA OR ID MT"],
  ["metronet", "Metronet"],
  ["sonic", "Sonic", "CA"],
  ["tmobile-home", "T-Mobile Home Internet"],
  ["verizon-home", "Verizon 5G Home"],
  ["starlink", "Starlink"],
  ["hughesnet", "HughesNet"],
  ["viasat", "Viasat"],
  ["local-internet", "Local internet provider"],
];

const CELLULAR: Row[] = [
  ["verizon", "Verizon"],
  ["att", "AT&T"],
  ["tmobile", "T-Mobile"],
  ["uscellular", "US Cellular"],
  ["cricket", "Cricket Wireless"],
  ["metro", "Metro by T-Mobile"],
  ["boost", "Boost Mobile"],
  ["visible", "Visible"],
  ["mint", "Mint Mobile"],
  ["google-fi", "Google Fi"],
  ["xfinity-mobile", "Xfinity Mobile"],
  ["spectrum-mobile", "Spectrum Mobile"],
  ["straight-talk", "Straight Talk"],
  ["consumer-cellular", "Consumer Cellular"],
];

const OTHER: Row[] = [
  ["water", "Municipal water"],
  ["gas", "Natural gas"],
  ["landline", "Landline phone"],
  ["voip", "VoIP provider"],
  ["cable-tv", "Cable TV"],
];

export const PROVIDER_CATALOG: CatalogProvider[] = [
  ...rows("power", POWER),
  ...rows("internet", INTERNET),
  ...rows("cellular", CELLULAR),
  ...rows("other", OTHER),
];

/**
 * The "not listed" rows. They stay at the bottom of a picker however it is
 * sorted: a catch-all in the middle of an alphabetical list gets picked by
 * people whose real provider is two rows further down.
 */
export const FALLBACK_PROVIDER_SLUGS = new Set(["local-power", "local-internet"]);
