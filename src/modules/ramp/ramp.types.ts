export type RampPostStatus =
  | "care_sent"
  | "landing"
  | "selfie_received"
  | "processing"
  | "ready"
  | "posted";

export type FireCareCardRequest = {
  brandSlug?: string;
  recipientPhone: string;
  recipientName?: string;
  stylistName?: string;
  products?: string[];
};

export type RampDemoPostDto = {
  token: string;
  brandSlug: string;
  recipientPhone: string;
  recipientName: string;
  stylistName: string;
  products: string[];
  status: RampPostStatus;
  sourceType: string;
  careCardUrl: string | null;
  compositeUrl: string | null;
  caption: string | null;
  landingUrl: string;
  createdAt: string;
  updatedAt: string;
};

export type FireCareCardResponse = {
  ok: true;
  token: string;
  landingUrl: string;
  careCardUrl: string;
  sent: boolean;
  mock?: boolean;
  smsMode: "mock" | "twilio";
  messagePreview: string;
};

export type StoreSharedSelfieRequest = {
  token: string;
  mediaUrl: string;
  phone?: string;
  source?: string;
};
