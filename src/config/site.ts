const rawCompanyName = process.env.NEXT_PUBLIC_COMPANY_NAME?.trim();
const rawCompanyAcronym = process.env.NEXT_PUBLIC_COMPANY_ACRONYM?.trim();

const companyName = rawCompanyName && rawCompanyName.length > 0 ? rawCompanyName : "Facturador";
const companyAcronym =
  rawCompanyAcronym && rawCompanyAcronym.length > 0
    ? rawCompanyAcronym
    : companyName
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 4) || companyName.slice(0, 4).toUpperCase();

export const siteConfig = {
  name: companyName,
  acronym: companyAcronym,
  description: `${companyName} centraliza facturación electrónica, inventario y operaciones en una sola herramienta.`,
  links: {
    github: "https://github.com/your-org/facturador",
  },
};

export type SiteConfig = typeof siteConfig;
