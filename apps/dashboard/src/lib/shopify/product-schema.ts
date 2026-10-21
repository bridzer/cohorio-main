export type ProductSchemaInput = {
  title: string;
  descriptionText: string | null;
  sku?: string | null;
  imageUrl: string | null;
  minimumPrice: number | null;
  currencyCode: string | null;
};

type ProductJsonLd = {
  "@context": "https://schema.org";
  "@type": "Product";
  name?: string;
  description?: string;
  sku?: string;
  image?: string;
  offers?: {
    "@type": "Offer";
    price: string;
    priceCurrency?: string;
  };
};

function present(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function productJsonLd(product: ProductSchemaInput): ProductJsonLd {
  const jsonLd: ProductJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
  };
  const name = present(product.title);
  const description = present(product.descriptionText);
  const sku = present(product.sku);
  const image = present(product.imageUrl);
  if (name) jsonLd.name = name;
  if (description) jsonLd.description = description;
  if (sku) jsonLd.sku = sku;
  if (image) jsonLd.image = image;
  if (
    typeof product.minimumPrice === "number" &&
    Number.isFinite(product.minimumPrice) &&
    product.minimumPrice > 0
  ) {
    const currency = present(product.currencyCode);
    jsonLd.offers = {
      "@type": "Offer",
      price: product.minimumPrice.toFixed(2),
      ...(currency ? { priceCurrency: currency } : {}),
    };
  }
  return jsonLd;
}
