export type BriefStatus = "generating" | "ready" | "failed";

export type GhostPlant = {
  id: string;
  text: string;
  type?: string;
};

export type GhostBackBarItem = {
  product_name: string;
  brand?: string;
  qty?: number;
  default?: boolean;
};

export type GhostRetailSuggestion = {
  product: string;
  reason?: string;
  price?: number | null;
};

export type GhostBriefPayload = {
  brief_status: BriefStatus;
  appointmentId?: string;
  generatedAt?: string;
  ai_brief?: string | null;
  ai_plants?: GhostPlant[];
  back_bar?: GhostBackBarItem[];
  retail_suggestions?: GhostRetailSuggestion[];
  error?: string;
};

export type GhostNotesJobData = {
  salonId: string;
  clientKey: string;
  clientName: string;
  clientPhone?: string | null;
  appointmentId: string;
  services: string[];
  staffId?: string | null;
  appointmentNotes?: string | null;
};

export type BriefGenerationResult = {
  brief: string | null;
  plants: GhostPlant[];
  back_bar: GhostBackBarItem[];
  retail_suggestions: GhostRetailSuggestion[];
};
