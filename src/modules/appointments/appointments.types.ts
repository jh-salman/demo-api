export type CreateAppointmentInput = {
  clientName: string;
  clientPhone: string | null;
  service: string;
  start: Date;
  end: Date;
  color: string;
  price: number;
  notes: string;
  seriesId: string | null;
  staffId: string | null;
};
