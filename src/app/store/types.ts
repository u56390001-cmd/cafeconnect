export interface StoreCategory {
  categoryId: string;
  name: string;
}

export interface StoreItem {
  itemId: string;
  categoryId: string;
  name: string;
  description: string;
  priceMinor: number;
  imageReferences?: Array<{
    assetId: string;
    url: string;
    altText: string;
    width: number | null;
    height: number | null;
  }>;
  spiceLevel?: string;
  dietaryLabels?: string[];
  portion?: string;
}

export interface StoreOffer {
  offerId: string;
  name: string;
  description: string;
  type: string;
  valueLabel: string;
  minOrderMinor: number | null;
}

export interface StoreCatalog {
  businessName: string;
  currency: string;
  categories: StoreCategory[];
  items: StoreItem[];
  offers: StoreOffer[];
  deliveryFeeMinor: number;
  minimumOrderMinor: number;
  pickupAvailable: boolean;
  paymentMethods: string;
  deliveryAreaLabel: string | null;
  orderInstructions: string | null;
  city: string | null;
}
